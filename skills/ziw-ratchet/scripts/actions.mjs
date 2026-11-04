import path from "node:path";
import { fileURLToPath } from "node:url";
import { quote } from "./io.mjs";
import { append, fold } from "./run-records.mjs";
import { sessionIds, stageJudge } from "./sessions.mjs";

export function commands(root, directory) {
  const cli = `node ${quote(fileURLToPath(new URL("./ratchet.mjs", import.meta.url)))}`;
  const run = `--run ${quote(path.relative(root, directory))}`;
  return {
    call: (command) => `${cli} ${command} ${run}`,
    record: (event, options = "") => `${cli} record ${event} ${run}${options ? " " + options : ""}`,
  };
}
export function action(kind, instruction, record, fields = {}) {
  return { kind, instruction, ...fields, record };
}
export function judgeActions(directory, events, family, command) {
  let state = fold(events);
  for (const [index, judge] of state.setup.judges.entries()) {
    const id = `${family}-${judge}`;
    if (!state.sessions[id])
      append(directory, events, {
        type: "session-staged",
        session: stageJudge(directory, state, family, judge, index),
      });
  }
  state = fold(events);
  return sessionIds(state, family).flatMap((id) => {
    const session = state.sessions[id];
    if (session.verdicts) return [];
    const fields = { session: id, judge: session.judge, brief: session.brief };
    if (session.receipt)
      return [
        action(
          "recover-session",
          "Recover this session through Repo Config's Recover method, then record its completed judge files. Record lost only if the session is confirmed gone.",
          command.record("judged", `--session ${quote(id)}`),
          {
            ...fields,
            receipt: session.receipt,
            lostRecord: command.record("lost", `--session ${quote(id)}`),
          },
        ),
      ];
    return [
      action(
        "launch-judge",
        "Launch a fresh judge session through Repo Config using this brief as its whole task. Record the confirmed launch receipt immediately.",
        command.record("launched", `--session ${quote(id)} --receipt <receipt>`),
        fields,
      ),
    ];
  });
}
