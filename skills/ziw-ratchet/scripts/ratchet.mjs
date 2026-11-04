#!/usr/bin/env node
import { realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { assert, fileHash, filesUnder, git, inside, readJson } from "./io.mjs";
import { initialize } from "./setup.mjs";
import { append, fold, loadEvents } from "./run-records.mjs";
import { capture } from "./evidence.mjs";
import { nextActions } from "./next-actions.mjs";
import { record } from "./record.mjs";
import { report } from "./report.mjs";

const usage = "node ratchet.mjs <init|tick|capture|record|report> --run <relative-dir> [options]";
const optionNames = [
  "run",
  "setup",
  "session",
  "receipt",
  "recs",
  "targets",
  "units",
  "commit",
  "reason",
  "result",
  "round",
  "wake",
  "rounds",
  "pr",
  "head",
];
function verifyRecords(root, directory, state) {
  assert(
    JSON.stringify(readJson(path.join(directory, "setup.json"))) === JSON.stringify(state.setup),
    "setup.json differs from the journal",
  );
  let manifest;
  if (state.manifestHash) {
    const file = path.join(directory, "manifest.json");
    assert(fileHash(file) === state.manifestHash, "approved manifest is missing or changed");
    manifest = readJson(file);
    assert(
      JSON.stringify(filesUnder(root, state.setup.references)) ===
        JSON.stringify(manifest.references),
      "approved references changed",
    );
  }
  for (const evidence of Object.values(state.captures)) {
    for (const [file, expected] of Object.entries(evidence.hashes))
      assert(
        fileHash(inside(evidence.directory, file)) === expected,
        `captured evidence changed: ${evidence.sha}/${file}`,
      );
  }
  return manifest;
}
export function main(args) {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      ...Object.fromEntries(optionNames.map((name) => [name, { type: "string" }])),
      help: { type: "boolean", short: "h" },
    },
  });
  if (parsed.values.help) return { usage };
  const [command, event, ...extra] = parsed.positionals;
  assert(
    ["init", "tick", "capture", "record", "report"].includes(command) &&
      !extra.length &&
      (command === "record" ? event : !event),
    usage,
  );
  for (const [name, value] of Object.entries(parsed.values))
    assert(typeof value !== "string" || value.trim(), `--${name} requires a nonempty value`);
  const root = git(process.cwd(), "rev-parse", "--show-toplevel");
  const directory = inside(root, parsed.values.run);
  if (command === "init") {
    assert(parsed.values.setup, "init requires --setup");
    return initialize(root, directory, path.resolve(process.cwd(), parsed.values.setup));
  }
  const events = loadEvents(directory);
  let state = fold(events);
  let manifest;
  try {
    manifest = verifyRecords(root, directory, state);
    assert(
      git(root, "symbolic-ref", "--short", "HEAD") === state.branch,
      "current branch differs from the run branch",
    );
    if (command === "tick") {
      const expected = state.active?.candidate ?? state.lastKept;
      assert(
        git(root, "rev-parse", "HEAD") === expected,
        "HEAD differs from the recorded candidate or last kept commit",
      );
    }
  } catch (error) {
    if (command !== "tick" || state.status === "done") throw error;
    if (state.status !== "failed")
      append(directory, events, { type: "failed", reason: error.message });
  }
  state = fold(events);
  if (command === "report") return report(state);
  if (command === "record") return record(root, directory, events, event, parsed.values);
  if (command === "capture") {
    assert(
      (state.status === "setup" && !state.captures[state.baseline]) ||
        (state.status === "running" &&
          state.active?.candidate &&
          !state.captures[state.active.candidate] &&
          !state.active.rejection),
      "capture is outside the current phase",
    );
    return capture(root, directory, events, manifest);
  }
  if (state.pause) append(directory, events, { type: "resumed" });
  let actions;
  try {
    actions = nextActions(root, directory, events);
  } catch (error) {
    append(directory, events, { type: "failed", reason: error.message });
    actions = nextActions(root, directory, events);
  }
  state = fold(events);
  return { status: state.status, round: state.active?.number ?? state.rounds.length, actions };
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const result = main(process.argv.slice(2));
    console.log(typeof result === "string" ? result.trimEnd() : JSON.stringify(result));
  } catch (error) {
    console.error(`ratchet: ${error.message}`);
    process.exitCode = 1;
  }
}
