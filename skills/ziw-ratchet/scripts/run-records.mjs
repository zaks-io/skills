import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { assert } from "./io.mjs";

export function append(directory, events, event) {
  const record = { ...event, sequence: events.length + 1 };
  appendFileSync(path.join(directory, "journal.jsonl"), JSON.stringify(record) + "\n");
  events.push(record);
  return record;
}
export function loadEvents(directory) {
  let contents;
  try {
    contents = readFileSync(path.join(directory, "journal.jsonl"), "utf8");
  } catch (error) {
    throw new Error(`missing journal: ${error.message}`);
  }
  assert(contents.endsWith("\n"), "journal has an incomplete record");
  const events = contents
    .trim()
    .split("\n")
    .map((line, index) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        throw new Error(`invalid journal record ${index + 1}`);
      }
      assert(event.sequence === index + 1, `inconsistent journal sequence ${index + 1}`);
      return event;
    });
  fold(events);
  return events;
}

export function fold(events) {
  events = structuredClone(events);
  assert(events[0]?.type === "initialized", "journal requires an initialized record");
  const first = events[0];
  for (const key of ["setup", "baseline", "branch", "runId", "references", "minimum"])
    assert(first[key] != null, `initialized record missing ${key}`);
  const state = {
    ...first,
    status: "setup",
    cap: first.setup.cap,
    sessions: {},
    captures: {},
    rounds: [],
    tried: [],
    plateau: 0,
    keeps: 0,
    lastKept: first.baseline,
    recommendations: [],
    active: null,
  };
  for (const event of events.slice(1)) {
    const round = state.active;
    switch (event.type) {
      case "session-staged":
        assert(!state.sessions[event.session.id], `duplicate session ${event.session.id}`);
        state.sessions[event.session.id] = event.session;
        break;
      case "launched": {
        const session = state.sessions[event.session];
        assert(
          session && !session.receipt && !session.verdicts,
          `inconsistent launch ${event.session}`,
        );
        session.receipt = event.receipt;
        break;
      }
      case "lost":
        assert(
          state.sessions[event.session]?.receipt,
          `lost session has no receipt: ${event.session}`,
        );
        delete state.sessions[event.session].receipt;
        break;
      case "judged": {
        const session = state.sessions[event.session];
        assert(
          session?.receipt && !session.verdicts,
          `inconsistent verdict record ${event.session}`,
        );
        session.verdicts = event.verdicts;
        session.recommendations = event.recommendations;
        break;
      }
      case "captured":
        assert(!state.captures[event.sha], `duplicate capture ${event.sha}`);
        state.captures[event.sha] = event;
        break;
      case "calibrated":
        assert(state.status === "setup", "duplicate calibration");
        state.baselineStanding = state.standings = event.standings;
        state.recommendations = event.recommendations;
        state.critiqueCommit = state.baseline;
        state.calibration = event.summary;
        state.status = "awaiting-approval";
        break;
      case "critiqued":
        assert(
          state.status === "running" && !round && event.commit === state.lastKept,
          "critique outside current kept commit",
        );
        state.recommendations = event.recommendations;
        state.critiqueCommit = event.commit;
        break;
      case "approved":
        assert(state.status === "awaiting-approval", "approval outside calibration");
        state.status = "running";
        state.manifestHash = event.manifestHash;
        break;
      case "plan":
        assert(
          state.status === "running" && !round && event.round === state.rounds.length + 1,
          "inconsistent round plan",
        );
        state.active = {
          number: event.round,
          recs: event.recs,
          targets: event.targets,
          units: event.units,
        };
        break;
      case "implemented":
        assert(round && !round.candidate, "implementation outside planned round");
        round.candidate = event.commit;
        round.changes = event.changes;
        break;
      case "implement-failed":
      case "boundary-violation":
      case "capture-failed":
        assert(round, `${event.type} outside round`);
        round.rejection = {
          "implement-failed": "implement-failed",
          "boundary-violation": "boundary",
          "capture-failed": "capture-failed",
        }[event.type];
        round.detail = event.reason;
        break;
      case "compared":
      case "anchored":
        assert(round && round.candidate, `${event.type} outside candidate round`);
        assert(state.captures[round.candidate], `${event.type} missing captured evidence`);
        if (event.type === "anchored")
          assert(round.compared?.result.pass, "anchor missing passing comparison");
        assert(!round[event.type], `duplicate ${event.type}`);
        round[event.type] = event;
        break;
      case "checked":
        assert(round?.anchored && round.fullGate == null, "full gate outside anchored round");
        round.fullGate = event.result === "pass";
        break;
      case "kept":
      case "reverted":
        assert(round && event.round === round.number, "decision outside round");
        state.tried.push(...round.recs);
        state.rounds.push({ ...round, outcome: event.type, reason: event.reason });
        if (event.type === "kept") {
          assert(
            round.candidate &&
              round.compared?.result.pass &&
              round.anchored?.result.pass &&
              round.fullGate === true,
            "keep missing evidence",
          );
          state.lastKept = round.candidate;
          state.standings = round.anchored.standings;
          state.keeps++;
          state.plateau = 0;
        } else state.plateau++;
        state.active = null;
        break;
      case "commented": {
        const completed = state.rounds.find((r) => r.number === event.round);
        assert(
          completed?.outcome === "kept" && !completed.commented,
          "comment outside uncommented keep",
        );
        completed.commented = true;
        break;
      }
      case "finishing":
        assert(
          ["setup", "awaiting-approval", "running"].includes(state.status) && !round,
          "finish outside settled run",
        );
        state.status = "finishing";
        state.stopReason = event.reason;
        break;
      case "failed":
        state.status = "failed";
        state.stopReason = event.reason;
        break;
      case "stop":
        state.stop = true;
        break;
      case "cap":
        assert(Number.isSafeInteger(event.rounds) && event.rounds > state.cap, "cap must increase");
        state.cap = event.rounds;
        if (state.status === "finishing" && state.stopReason === "cap") {
          state.status = "running";
          delete state.stopReason;
          for (const id of Object.keys(state.sessions))
            if (id.startsWith("fin-")) delete state.sessions[id];
        }
        break;
      case "paused":
        state.pause = event;
        break;
      case "resumed":
        delete state.pause;
        break;
      case "published":
        assert(
          state.status === "finishing" && event.head === state.lastKept,
          "inconsistent publication",
        );
        state.status = "done";
        state.pr = event.pr;
        break;
      case "reported":
        assert(["failed", "finishing"].includes(state.status), "report outside finish");
        state.reported = true;
        if (state.status === "finishing") state.status = "done";
        break;
      default:
        throw new Error(`unknown journal event: ${event.type}`);
    }
  }
  return state;
}
