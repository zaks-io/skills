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
    { identifier: "LIN-1", labels: ["kind-slice", "ready-for-agent"], state: "Todo" },
    {
      identifier: "LIN-2",
      blockedBy: ["LIN-1"],
      labels: ["kind-slice", "ready-for-agent"],
      state: "Todo",
    },
    {
      identifier: "LIN-3",
      blockedBy: ["LIN-2"],
      labels: ["kind-slice", "ready-for-agent"],
      state: "Todo",
    },
  ]);

  assert.deepEqual(output.frontier, ["LIN-1"]);
  assert.deepEqual(output.starts, ["LIN-1"]);
  assert.deepEqual(output.readyStarts, ["LIN-1"]);
  assert.deepEqual(output.layers, [["LIN-1"], ["LIN-2"], ["LIN-3"]]);
  assert.deepEqual(output.cycles, []);
});

test("linearDagStart separates scoped roots from externally blocked starts", () => {
  const output = linearDagStart([
    {
      identifier: "LIN-1",
      blockedBy: ["EXT-1"],
      labels: ["kind-slice", "ready-for-agent"],
      state: "Todo",
    },
    {
      identifier: "LIN-2",
      blockedBy: ["LIN-1"],
      labels: ["kind-slice", "ready-for-agent"],
      state: "Todo",
    },
  ]);

  assert.deepEqual(output.roots, ["LIN-1"]);
  assert.deepEqual(output.frontier, []);
  assert.deepEqual(output.starts, []);
  assert.deepEqual(output.missingBlockers, [{ ticket: "LIN-1", blocker: "EXT-1" }]);
});

test("linearDagStart keeps graph frontier separate from startable starts", () => {
  const output = linearDagStart(
    [
      { identifier: "LIN-1", labels: ["kind-slice", "ready-for-agent"], state: "Todo" },
      { identifier: "LIN-2", labels: ["kind-slice", "needs-info"], state: "Todo" },
      { identifier: "LIN-3", labels: ["kind-epic", "ready-for-agent"], state: "Todo" },
      { identifier: "LIN-4", labels: ["kind-slice", "ready-for-agent"], state: "Backlog" },
    ],
    { readinessLabels: ["ready-for-agent"] },
  );

  assert.deepEqual(output.frontier, ["LIN-1", "LIN-2", "LIN-3", "LIN-4"]);
  assert.deepEqual(output.starts, ["LIN-1"]);
  assert.deepEqual(output.readyStarts, ["LIN-1", "LIN-3"]);
  assert.deepEqual(
    Object.fromEntries(output.nodes.map((node) => [node.id, node.startableBlockers])),
    {
      "LIN-1": [],
      "LIN-2": ["missing readiness label"],
      "LIN-3": ["not kind-slice"],
      "LIN-4": ["not in configured startable state"],
    },
  );
});

test("linearDagStart ignores non-agent readiness labels from broad config", () => {
  const output = linearDagStart(
    [
      { identifier: "LIN-1", labels: ["kind-slice", "ready-for-human"], state: "Todo" },
      { identifier: "LIN-2", labels: ["kind-slice", "ready-for-agent"], state: "Todo" },
    ],
    { readinessLabels: ["needs-info", "ready-for-agent", "ready-for-human"] },
  );

  assert.deepEqual(output.starts, ["LIN-2"]);
  assert.deepEqual(
    Object.fromEntries(output.nodes.map((node) => [node.id, node.startableBlockers])),
    {
      "LIN-1": ["missing readiness label"],
      "LIN-2": [],
    },
  );
});

test("linearDagStart excludes claimed issues and open PRs from starts", () => {
  const output = linearDagStart([
    {
      identifier: "LIN-1",
      assignee: "Cursor",
      labels: ["kind-slice", "ready-for-agent"],
      stateType: "unstarted",
    },
    {
      identifier: "LIN-2",
      labels: ["kind-slice", "ready-for-agent"],
      prOpen: true,
      stateType: "unstarted",
    },
    {
      identifier: "LIN-3",
      labels: ["kind-slice", "ready-for-agent"],
      stateType: "unstarted",
    },
  ]);

  assert.deepEqual(output.frontier, ["LIN-1", "LIN-2", "LIN-3"]);
  assert.deepEqual(output.starts, ["LIN-3"]);
});

test("linearDagStart blocks missing required estimates", () => {
  const output = linearDagStart(
    [
      { identifier: "LIN-1", labels: ["kind-slice", "ready-for-agent"], state: "Todo" },
      {
        identifier: "LIN-2",
        estimate: 0,
        labels: ["kind-slice", "ready-for-agent"],
        state: "Todo",
      },
      {
        identifier: "LIN-3",
        labels: ["kind-epic", "ready-for-agent"],
        state: "Todo",
      },
    ],
    { estimateRequired: true, readinessLabels: ["ready-for-agent"] },
  );

  assert.deepEqual(output.starts, ["LIN-2"]);
  assert.deepEqual(output.missingEstimates, [{ ticket: "LIN-1" }]);
  assert.deepEqual(
    Object.fromEntries(
      output.nodes.map((node) => [
        node.id,
        {
          estimate: node.estimate,
          hasEstimate: node.hasEstimate,
          requiresEstimate: node.requiresEstimate,
          blockers: node.startableBlockers,
        },
      ]),
    ),
    {
      "LIN-1": {
        estimate: null,
        hasEstimate: false,
        requiresEstimate: true,
        blockers: ["missing required estimate"],
      },
      "LIN-2": {
        estimate: 0,
        hasEstimate: true,
        requiresEstimate: true,
        blockers: [],
      },
      "LIN-3": {
        estimate: null,
        hasEstimate: false,
        requiresEstimate: false,
        blockers: ["not kind-slice"],
      },
    },
  );
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
      issues: [
        { identifier: "LIN-1", labels: ["kind-slice", "ready-for-agent"], stateType: "unstarted" },
        {
          identifier: "LIN-2",
          blockedBy: ["LIN-1"],
          labels: ["kind-slice", "ready-for-agent"],
          stateType: "unstarted",
        },
      ],
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
