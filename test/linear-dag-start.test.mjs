import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  extractLinearIssues,
  linearDagStart,
} from "../skills/ziw-orchestrate/scripts/linear-dag-start.mjs";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "skills", "ziw-orchestrate", "scripts", "linear-dag-start.mjs");
const tickPlanScript = path.join(root, "skills", "ziw-orchestrate", "scripts", "tick-plan.mjs");

function writeJson(input) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-dag-"));
  const file = path.join(dir, "input.json");
  writeFileSync(file, JSON.stringify(input), "utf8");
  return file;
}

test("linearDagStart returns DAG starts and topological layers", () => {
  const output = linearDagStart([
    { identifier: "LIN-1" },
    { identifier: "LIN-2", blockedBy: ["LIN-1"] },
    { identifier: "LIN-3", blockedBy: ["LIN-2"] },
  ]);

  assert.deepEqual(output.starts, ["LIN-1"]);
  assert.deepEqual(output.readyStarts, ["LIN-1"]);
  assert.deepEqual(output.layers, [["LIN-1"], ["LIN-2"], ["LIN-3"]]);
  assert.deepEqual(output.cycles, []);
});

test("linearDagStart separates scoped roots from externally blocked starts", () => {
  const output = linearDagStart([
    { identifier: "LIN-1", blockedBy: ["EXT-1"] },
    { identifier: "LIN-2", blockedBy: ["LIN-1"] },
  ]);

  assert.deepEqual(output.roots, ["LIN-1"]);
  assert.deepEqual(output.starts, []);
  assert.deepEqual(output.missingBlockers, [{ ticket: "LIN-1", blocker: "EXT-1" }]);
});

test("linearDagStart filters ready starts when config names readiness", () => {
  const output = linearDagStart(
    [
      { identifier: "LIN-1", labels: ["ready-for-agent"], state: "Todo" },
      { identifier: "LIN-2", labels: ["needs-info"], state: "Todo" },
    ],
    { readinessLabels: ["ready-for-agent"] },
  );

  assert.deepEqual(output.starts, ["LIN-1", "LIN-2"]);
  assert.deepEqual(output.readyStarts, ["LIN-1"]);
});

test("linearDagStart reports dependency cycles", () => {
  const output = linearDagStart([
    { identifier: "LIN-1", blockedBy: ["LIN-2"] },
    { identifier: "LIN-2", blockedBy: ["LIN-1"] },
  ]);

  assert.deepEqual(output.starts, []);
  assert.deepEqual(output.layers, []);
  assert.deepEqual(output.cycles, ["LIN-1", "LIN-2"]);
});

test("linear-dag-start CLI accepts tick-snapshot envelopes", () => {
  const input = writeJson({
    linear: {
      issues: [{ identifier: "LIN-1" }, { identifier: "LIN-2", blockedBy: ["LIN-1"] }],
    },
  });

  const output = JSON.parse(execFileSync("node", [script, input], { encoding: "utf8" }));

  assert.deepEqual(output.starts, ["LIN-1"]);
});

test("extractLinearIssues handles planner envelopes", () => {
  assert.deepEqual(
    extractLinearIssues({
      snapshot: { linear: { issues: [{ identifier: "LIN-1" }] } },
    }),
    [{ identifier: "LIN-1" }],
  );
});

test("tick-plan fails fast when input is missing", () => {
  const result = spawnSync("node", [tickPlanScript], { encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected exactly one input/);
});
