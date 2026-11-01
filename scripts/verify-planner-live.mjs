import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readJson } from "../skills/ziw-orchestrate/scripts/planner-input.mjs";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const scripts = path.join(root, "skills/ziw-orchestrate/scripts");
const configFile = "docs/agents/workflow/planner.json";
const config = readJson(path.join(root, configFile), "config");
const directory = mkdtempSync(path.join(tmpdir(), "ziw-live-parity-"));
const run = (script, args) =>
  execFileSync(process.execPath, [path.join(scripts, script), ...args], { encoding: "utf8" });
try {
  run("planner-state.mjs", ["init", "--repo", config.repo, "--state", config.stateFile]);
  const snapshot = run("tick-snapshot.mjs", ["--config", configFile]);
  const snapshotFile = path.join(directory, "snapshot.json");
  writeFileSync(snapshotFile, snapshot);
  const expected = JSON.parse(
    run("tick-plan.mjs", [snapshotFile, "--config", configFile, "--state", config.stateFile]),
  );
  const actual = JSON.parse(run("tick.mjs", ["--config", configFile]));
  const enrichment = new Set(
    "issueKey ticketUrl title footprint outOfScope branch brief record prNumber prUrl base headSha previousReviewSessionId previousReviewReceiptId instruction skill".split(
      " ",
    ),
  );
  const strip = (actions) =>
    actions.map((action) =>
      Object.fromEntries(
        Object.entries(action).filter(
          ([name]) =>
            !enrichment.has(name) &&
            (name !== "targetState" ||
              expected.actions.some(
                (decision) =>
                  decision.kind === action.kind &&
                  decision.target === action.target &&
                  "targetState" in decision,
              )),
        ),
      ),
    );
  assert.deepEqual(strip(actual.actions), strip(expected.actions));
  assert.deepEqual(actual.waits, expected.waits);
  assert.deepEqual(actual.holds, expected.holds);
  console.log(
    JSON.stringify(
      {
        repo: config.repo,
        sources: JSON.parse(snapshot).sources,
        actions: actual.actions.length,
        waits: actual.waits.length,
        holds: actual.holds.length,
        result: "live single tick matches three-command pipeline",
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
