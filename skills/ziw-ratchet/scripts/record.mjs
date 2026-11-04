import path from "node:path";
import { assert, clean, git, quote, fileHash } from "./io.mjs";
import { append, fold } from "./run-records.mjs";
import { approve } from "./evidence.mjs";
import { rankedRecommendations, readVerdicts, roundId, sessionsDone } from "./sessions.mjs";
import { critiqueFamily } from "./critique.mjs";
import { stopReason } from "./decisions.mjs";
import { action, commands } from "./actions.mjs";

function text(options, key) {
  assert(typeof options[key] === "string" && options[key].trim(), `record requires --${key}`);
  return options[key];
}
function positive(options, key) {
  const value = text(options, key);
  assert(
    /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0,
    `--${key} must be a positive integer`,
  );
  return Number(value);
}
export function currentSession(state, id) {
  const session = state.sessions[id];
  assert(session, `unknown session: ${id}`);
  const round = state.active;
  const family = session.family;
  const valid = family?.endsWith("-crit")
    ? !round &&
      family === critiqueFamily(state) &&
      ((state.status === "setup" && family === "r00-crit") || state.status === "running")
    : family?.startsWith("cal-")
      ? state.status === "setup"
      : family?.startsWith("fin-")
        ? state.status === "finishing"
        : family?.endsWith("cmp")
          ? state.status === "running" &&
            round?.candidate &&
            !round.compared &&
            family === `${roundId(round.number)}-cmp`
          : family?.endsWith("ref")
            ? state.status === "running" &&
              round?.compared?.result.pass &&
              !round.anchored &&
              family === `${roundId(round.number)}-ref`
            : state.status === "running" &&
              round &&
              !round.candidate &&
              !round.rejection &&
              id === `${roundId(round.number)}-impl`;
  assert(valid, `session is outside the current phase: ${id}`);
  return session;
}
export function record(root, directory, events, event, options) {
  const state = fold(events);
  assert(
    !["done", "failed"].includes(state.status) || event === "reported",
    `cannot record ${event} in ${state.status} run`,
  );
  const round = state.active;
  let entry = { type: event };
  switch (event) {
    case "launched":
    case "lost":
    case "judged": {
      const id = text(options, "session"),
        session = currentSession(state, id);
      entry.session = id;
      if (event === "launched") {
        assert(!session.receipt && !session.verdicts, "session already launched or judged");
        entry.receipt = text(options, "receipt");
      } else {
        assert(session.receipt && !session.verdicts, "session has no pending launch");
        if (event === "judged") {
          assert(session.family, "implementers must record implemented or implement-failed");
          Object.assign(entry, readVerdicts(session, state.setup.criteria));
          entry.outputHash = fileHash(
            path.join(
              session.directory,
              session.family.endsWith("-crit") ? "critique.json" : "verdicts.json",
            ),
          );
        }
      }
      break;
    }
    case "approved":
      assert(state.status === "awaiting-approval", "approved requires completed calibration");
      entry.manifestHash = approve(root, directory, state);
      break;
    case "plan": {
      assert(state.status === "running" && !round, "plan requires an idle running phase");
      assert(
        state.critiqueCommit === state.lastKept,
        "plan requires the latest critique; tick first",
      );
      const candidates = rankedRecommendations(state);
      assert(
        !stopReason({
          setup: state.setup,
          standings: state.standings,
          capture: state.captures[state.lastKept],
          stop: state.stop,
          plateau: state.plateau,
          rounds: state.rounds.length,
          cap: state.cap,
          recommendations: candidates,
        }),
        "run has a stop condition; tick before planning",
      );
      const recs = text(options, "recs").split(","),
        targets = text(options, "targets").split(",");
      assert(
        recs.length >= 1 &&
          recs.length <= 5 &&
          new Set(recs).size === recs.length &&
          recs.every((id) => candidates.some((r) => r.id === id)),
        "plan requires 1 to 5 distinct untried recommendation IDs",
      );
      assert(
        targets.length >= 1 &&
          targets.length <= 3 &&
          new Set(targets).size === targets.length &&
          targets.every(
            (id) =>
              candidates.some((r) => recs.includes(r.id) && r.criterion === id) &&
              state.setup.criteria.some((c) => c.id === id && c.type === "judged"),
          ),
        "plan requires 1 to 3 judged criteria of the selected recommendations",
      );
      const units = options.units === undefined ? undefined : text(options, "units").split(",");
      if (units)
        assert(
          new Set(units).size === units.length &&
            units.every((unit) => state.setup.sets.working.includes(unit)),
          "--units requires distinct working unit IDs",
        );
      entry = { type: "plan", round: state.rounds.length + 1, recs, targets, units };
      break;
    }
    case "implemented": {
      assert(round && !round.candidate && !round.rejection, "implemented requires a planned round");
      const session = currentSession(state, `${roundId(round.number)}-impl`);
      assert(session.receipt, "implementation requires a confirmed launch");
      clean(root);
      assert(
        git(root, "rev-parse", "HEAD") === state.lastKept,
        "implementation HEAD must equal last kept commit",
      );
      const requested = text(options, "commit");
      assert(/^[0-9a-f]{7,40}$/.test(requested), "--commit must be a Git SHA");
      const commit = git(root, "rev-parse", `${requested}^{commit}`);
      assert(commit !== state.lastKept, "implementation must create a new commit");
      git(root, "merge-base", "--is-ancestor", state.lastKept, commit);
      git(root, "merge", "--ff-only", commit);
      entry.commit = commit;
      entry.changes = git(root, "log", "--format=%s", `${state.lastKept}..${commit}`);
      break;
    }
    case "implement-failed":
      assert(
        round && !round.candidate && !round.rejection,
        "implement-failed requires an unimplemented round",
      );
      entry.reason = text(options, "reason");
      break;
    case "checked":
      clean(root);
      assert(
        git(root, "rev-parse", "HEAD") === round?.candidate,
        "full gate HEAD must equal the round candidate",
      );
      assert(
        round?.anchored?.result.pass && round.fullGate == null,
        "checked requires a passing anchor test",
      );
      assert(["pass", "fail"].includes(options.result), "--result must be pass or fail");
      entry.result = options.result;
      break;
    case "commented": {
      const number = positive(options, "round");
      assert(
        state.rounds.some((r) => r.number === number && r.outcome === "kept" && !r.commented),
        "commented requires an uncommented kept round",
      );
      entry.round = number;
      break;
    }
    case "paused":
      entry.reason = text(options, "reason");
      entry.wake = text(options, "wake");
      break;
    case "stop":
      assert(!state.stop, "stop is already recorded");
      break;
    case "cap":
      entry.rounds = positive(options, "rounds");
      assert(entry.rounds > state.cap, "cap can only be raised");
      break;
    case "published":
      assert(
        state.status === "finishing" &&
          state.keeps &&
          sessionsDone(state, "fin-base") &&
          sessionsDone(state, "fin-ref"),
        "published requires completed confirmation",
      );
      entry.pr = text(options, "pr");
      entry.head = text(options, "head");
      assert(/^https:\/\/[^\s]+$/.test(entry.pr), "--pr must be an HTTPS URL");
      if (entry.head !== state.lastKept)
        entry = {
          type: "failed",
          reason: `publish head mismatch: expected ${state.lastKept}, got ${entry.head}`,
        };
      else {
        clean(root);
        assert(
          git(root, "rev-parse", "HEAD") === state.lastKept,
          "publication HEAD must equal last kept",
        );
      }
      break;
    case "failed":
      entry.reason = text(options, "reason");
      break;
    case "reported":
      assert(
        !state.reported &&
          (state.status === "failed" || (state.status === "finishing" && !state.keeps)),
        "reported requires an unreported failed or zero-keep finish",
      );
      break;
    default:
      throw new Error(`unknown record event: ${event}`);
  }
  append(directory, events, entry);
  const updated = fold(events);
  if (event === "paused") {
    const command = commands(root, directory);
    return {
      status: updated.status,
      round: round?.number ?? updated.rounds.length,
      actions: [
        action(
          "wait",
          `Schedule a resume through Repo Config's continuation method when ${entry.wake}. Reason: ${entry.reason}.`,
          command.call("tick"),
        ),
      ],
    };
  }
  return { status: updated.status, event: entry.type };
}
