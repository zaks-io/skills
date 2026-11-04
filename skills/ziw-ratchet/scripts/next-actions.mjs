import { writeFileSync } from "node:fs";
import path from "node:path";
import { clean, git, quote } from "./io.mjs";
import { append, fold } from "./run-records.mjs";
import { anchorDecision, compareDecision, stopReason } from "./decisions.mjs";
import { baselineStanding, scoreSessions } from "./scoring.mjs";
import { panel, rankedRecommendations, roundId, sessionsDone } from "./sessions.mjs";
import { implementerBrief } from "./session-briefs.mjs";
import { action, commands, judgeActions } from "./actions.mjs";
import { critiqueFamily } from "./critique.mjs";
import { calibrationSummary } from "./calibration.mjs";
import { commentText, report } from "./report.mjs";

function revert(root, directory, events, state, reason) {
  try {
    clean(root);
    const expected = state.active.candidate ?? state.lastKept;
    if (git(root, "rev-parse", "HEAD") !== expected)
      throw new Error("HEAD is not the round candidate");
    git(root, "reset", "--hard", state.lastKept);
    append(directory, events, { type: "reverted", round: state.active.number, reason });
  } catch (error) {
    append(directory, events, { type: "failed", reason: `unsafe revert: ${error.message}` });
  }
}
export function nextActions(root, directory, events) {
  const command = commands(root, directory);
  const score = (state, family) =>
    scoreSessions(panel(state, family), state.setup.criteria, state.setup.thresholds.confidence);
  for (let transitions = 0; transitions < 30; transitions++) {
    const state = fold(events);
    if (state.status === "done") return [];
    if (state.stop && ["setup", "awaiting-approval"].includes(state.status)) {
      append(directory, events, { type: "finishing", reason: "stopped" });
      continue;
    }
    if (state.status === "failed")
      return state.reported
        ? []
        : [
            action(
              "report-ticket",
              `Post the run report on ${state.setup.ticket} and record that it was posted.`,
              command.record("reported"),
              { text: report(state) },
            ),
          ];
    if (state.status === "setup") {
      if (!state.captures[state.baseline])
        return [
          action(
            "capture",
            "Capture baseline evidence with the locked recipe.",
            command.call("capture"),
          ),
        ];
      const actions = [];
      for (const family of [...(state.references.length ? ["cal-fwd", "cal-rev"] : []), "r00-crit"])
        if (!sessionsDone(state, family))
          actions.push(...judgeActions(directory, events, family, command));
      if (actions.length) return actions;
      const standings = state.references.length ? score(state, "cal-fwd") : baselineStanding(state);
      append(directory, events, {
        type: "calibrated",
        standings,
        recommendations: panel(state, "r00-crit").flatMap((s) => s.recommendations),
        summary: calibrationSummary(state, standings),
      });
      continue;
    }
    if (state.status === "awaiting-approval")
      return [
        action(
          "approve",
          "Show the calibration summary and ask for approval. Record approved only after the user says yes.",
          command.record("approved"),
          { summary: state.calibration },
        ),
      ];
    if (state.status === "finishing") {
      if (!state.keeps)
        return [
          action(
            "report-ticket",
            `Post the run report on ${state.setup.ticket} and record that it was posted.`,
            command.record("reported"),
            { text: report(state) },
          ),
        ];
      const actions = [];
      for (const family of ["fin-base", "fin-ref"])
        if (!sessionsDone(state, family))
          actions.push(...judgeActions(directory, events, family, command));
      if (actions.length) return actions;
      const file = path.join(directory, "report.md");
      writeFileSync(file, report(state));
      return [
        action(
          "publish",
          "Push the confirmed commit and open or update the draft PR through Create PR, using this report as its body. If a hook needs a source change, record the failure instead of fixing it.",
          command.record("published", "--pr <url> --head <sha>"),
          {
            head: state.lastKept,
            report: file,
            failureRecord: command.record("failed", "--reason <text>"),
          },
        ),
      ];
    }
    const round = state.active;
    if (!round) {
      const uncommented = state.rounds.find((r) => r.outcome === "kept" && !r.commented);
      if (uncommented)
        return [
          action(
            "comment",
            `Post this scoreboard on ${state.setup.ticket} and record that it was posted.`,
            command.record("commented", `--round ${uncommented.number}`),
            { text: commentText(state, uncommented) },
          ),
        ];
      const family = critiqueFamily(state);
      if (!sessionsDone(state, family)) return judgeActions(directory, events, family, command);
      if (state.critiqueCommit !== state.lastKept) {
        append(directory, events, {
          type: "critiqued",
          commit: state.lastKept,
          recommendations: panel(state, family).flatMap((s) => s.recommendations),
        });
        continue;
      }
      const recommendations = rankedRecommendations(state);
      const reason = stopReason({
        setup: state.setup,
        standings: state.standings,
        capture: state.captures[state.lastKept],
        stop: state.stop,
        plateau: state.plateau,
        rounds: state.rounds.length,
        cap: state.cap,
        recommendations,
      });
      if (reason) {
        append(directory, events, { type: "finishing", reason });
        continue;
      }
      return [
        action(
          "plan",
          "Select 1 to 5 untried recommendations and 1 to 3 judged target criteria from those recommendations. Record their IDs before launching implementation. Optionally target working units with --units for a local fix.",
          command.record(
            "plan",
            "--recs <comma-separated-ids> --targets <comma-separated-criterion-ids>",
          ),
          { recommendations },
        ),
      ];
    }
    if (state.stop || round.rejection) {
      revert(root, directory, events, state, round.rejection ?? "stopped");
      continue;
    }
    const id = `${roundId(round.number)}-impl`;
    if (!round.candidate) {
      let session = state.sessions[id];
      if (!session) {
        const directoryImpl = path.join(directory, "implement", roundId(round.number));
        const selected = state.recommendations.filter((r) => round.recs.includes(r.id));
        const brief = implementerBrief(root, directoryImpl, state, selected);
        session = { id, implementer: state.setup.implementer, brief };
        append(directory, events, { type: "session-staged", session });
      }
      const fields = {
        session: id,
        implementer: session.implementer,
        brief: session.brief,
        failureRecord: command.record("implement-failed", "--reason <text>"),
      };
      if (session.receipt)
        return [
          action(
            "recover-session",
            "Recover the implementer through Repo Config's Recover method and record its final commit or failure. Record lost only if it is confirmed gone.",
            command.record("implemented", "--commit <sha>"),
            {
              ...fields,
              receipt: session.receipt,
              lostRecord: command.record("lost", `--session ${quote(id)}`),
            },
          ),
        ];
      return [
        action(
          "launch-implementer",
          "Launch the configured implementer in its own worktree using this brief as its whole task. Record the launch receipt immediately, then record its final commit or failure when confirmed.",
          command.record("launched", `--session ${quote(id)} --receipt <receipt>`),
          { ...fields, completionRecord: command.record("implemented", "--commit <sha>") },
        ),
      ];
    }
    if (!state.captures[round.candidate])
      return [
        action(
          "capture",
          "Verify the evaluation boundary and capture candidate evidence.",
          command.call("capture"),
        ),
      ];
    const cmp = `${roundId(round.number)}-cmp`,
      ref = `${roundId(round.number)}-ref`;
    if (!sessionsDone(state, cmp)) return judgeActions(directory, events, cmp, command);
    if (!round.compared) {
      const comparison = score(state, cmp);
      const result = compareDecision(
        state.setup,
        round.targets,
        comparison,
        state.captures[state.lastKept],
        state.captures[round.candidate],
        round.units,
      );
      append(directory, events, { type: "compared", comparison, result });
      if (result.failed) append(directory, events, { type: "failed", reason: result.reason });
      else if (!result.pass) revert(root, directory, events, state, result.reason);
      continue;
    }
    if (!sessionsDone(state, ref)) return judgeActions(directory, events, ref, command);
    if (!round.anchored) {
      const standings = score(state, ref);
      const result = anchorDecision(state.setup, state.standings, standings);
      append(directory, events, {
        type: "anchored",
        standings,
        result,
      });
      if (result.failed) append(directory, events, { type: "failed", reason: result.reason });
      else if (!result.pass) revert(root, directory, events, state, result.reason);
      continue;
    }
    if (round.fullGate == null)
      return [
        action(
          "run-full-gate",
          `Run the full local gate and record its confirmed result: ${state.setup.checks.full}`,
          command.record("checked", "--result <pass|fail>"),
        ),
      ];
    if (!round.fullGate) revert(root, directory, events, state, "full-gate");
    else append(directory, events, { type: "kept", round: round.number });
  }
  throw new Error("automatic transitions did not settle");
}
