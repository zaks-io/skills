import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "skills", "ziw-orchestrate", "scripts", "tick-plan.mjs");

function runPlan(input) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-plan-"));
  const file = path.join(dir, "input.json");
  writeFileSync(file, JSON.stringify(input), "utf8");
  return JSON.parse(execFileSync("node", [script, file], { encoding: "utf8" }));
}

test("tick-plan counts draft PRs before dispatching", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/example",
      prs: [
        {
          number: 12,
          state: "open",
          isDraft: true,
          headSha: "abc123",
          checks: { state: "SUCCESS", failed: [], pending: [] },
        },
      ],
    },
    config: { activePrPreviewCap: 1 },
    state: {
      startableTickets: [{ id: "ZAK-1", footprint: ["src/a.ts"] }],
    },
  });

  assert.equal(output.nextAction, "drain-active-work");
  assert.equal(output.footprint.prs, 1);
  assert.equal(output.decisions.dispatch.selected.length, 0);
});

test("tick-plan applies human merge label only with current review evidence", () => {
  const withoutEvidence = runPlan({
    snapshot: {
      repo: "zaks-io/example",
      prs: [
        {
          number: 12,
          state: "open",
          isDraft: false,
          headSha: "abc123",
          checks: { state: "SUCCESS", failed: [], pending: [] },
        },
      ],
    },
    config: { mergeAuthority: "human" },
  });
  const withEvidence = runPlan({
    snapshot: {
      repo: "zaks-io/example",
      prs: [
        {
          number: 12,
          state: "open",
          isDraft: false,
          headSha: "abc123",
          checks: { state: "SUCCESS", failed: [], pending: [] },
        },
      ],
    },
    config: { mergeAuthority: "human" },
    state: {
      reviewEvidenceByPr: {
        12: {
          hasReviewEvidence: true,
          reviewedHeadSha: "ABC123",
          reviewVerdict: "Ready to Merge",
        },
      },
    },
  });

  assert.equal(withoutEvidence.decisions.humanMergeLabels[0].action, "LEAVE_UNCHANGED");
  assert.equal(withEvidence.decisions.humanMergeLabels[0].action, "APPLY_HUMAN_MERGE_PR_LABEL");
});

test("tick-plan selects only non-colliding dispatch work", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/example",
      prs: [
        {
          number: 12,
          state: "open",
          headSha: "abc123",
          footprint: ["packages/ui"],
        },
      ],
    },
    config: { activePrPreviewCap: 3 },
    state: {
      startableTickets: [
        { id: "ZAK-1", footprint: ["packages/ui/button.ts"] },
        { id: "ZAK-2", footprint: ["apps/web/routes/home.tsx"] },
      ],
    },
  });

  assert.deepEqual(output.decisions.dispatch.selected, [
    { id: "ZAK-2", footprint: ["apps/web/routes/home.tsx"] },
  ]);
  assert.deepEqual(output.decisions.dispatch.deferred, [
    {
      id: "ZAK-1",
      conflictsWith: "PR-12",
      reason: "predicted file footprint collides with active or selected work",
    },
  ]);
});

test("tick-plan includes Linear DAG starts from snapshot issues", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/example",
      linear: {
        issues: [
          { identifier: "LIN-1", labels: ["kind-slice", "ready-for-agent"], state: "Todo" },
          {
            identifier: "LIN-2",
            labels: ["kind-slice", "ready-for-agent"],
            state: "Todo",
            blockedBy: ["LIN-1"],
          },
        ],
      },
    },
    config: { readinessLabels: ["ready-for-agent"] },
  });

  assert.deepEqual(output.decisions.linearDag.starts, ["LIN-1"]);
  assert.deepEqual(output.decisions.linearDag.readyStarts, ["LIN-1"]);
  assert.equal(output.counts.startableTickets, 1);
  assert.equal(output.counts.linearDagStarts, 1);
});

test("tick-plan keeps missing-estimate issues out of Linear DAG starts", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/example",
      linear: {
        issues: [
          { identifier: "LIN-1", labels: ["kind-slice", "ready-for-agent"], state: "Todo" },
          {
            identifier: "LIN-2",
            estimate: 2,
            labels: ["kind-slice", "ready-for-agent"],
            state: "Todo",
          },
        ],
      },
    },
    config: { estimateRequired: true, readinessLabels: ["ready-for-agent"] },
  });

  assert.deepEqual(output.decisions.linearDag.starts, ["LIN-2"]);
  assert.deepEqual(output.decisions.linearDag.missingEstimates, [{ ticket: "LIN-1" }]);
  assert.equal(output.counts.startableTickets, 1);
});

test("tick-plan uses Linear DAG starts as fallback startable queue", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/example",
      prs: [
        {
          number: 12,
          state: "open",
          headSha: "abc123",
        },
      ],
      linear: {
        issues: [
          { identifier: "LIN-1", labels: ["kind-slice", "ready-for-agent"], state: "Todo" },
          { identifier: "LIN-2", labels: ["kind-slice", "needs-info"], state: "Todo" },
          { identifier: "LIN-3", labels: ["kind-slice", "ready-for-agent"], state: "Backlog" },
        ],
      },
    },
    config: { activePrPreviewCap: 3, readinessLabels: ["ready-for-agent"] },
  });

  assert.equal(output.nextAction, "REQUEST_FILE_FOOTPRINT");
  assert.equal(output.counts.startableTickets, 1);
  assert.deepEqual(output.decisions.dispatch.deferred, [
    { id: "LIN-1", reason: "missing predicted file footprint" },
  ]);
});

test("tick-plan dispatches Linear DAG starts with snapshot-derived footprints", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/example",
      prs: [],
      linear: {
        issues: [
          {
            identifier: "LIN-1",
            footprint: ["apps/api/src/index.ts"],
            labels: ["kind-slice", "ready-for-agent"],
            state: "Todo",
          },
        ],
      },
    },
    config: { activePrPreviewCap: 3, readinessLabels: ["ready-for-agent"] },
  });

  assert.equal(output.nextAction, "dispatch-selected-work");
  assert.deepEqual(output.decisions.dispatch.selected, [
    { id: "LIN-1", footprint: ["apps/api/src/index.ts"] },
  ]);
});

test("tick-plan fails loud when a queried Linear queue has zero live issues", () => {
  assert.throws(
    () =>
      runPlan({
        snapshot: { repo: "zaks-io/example", linear: { issues: [] } },
      }),
    /zero live issues/,
  );
  assert.throws(
    () =>
      runPlan({
        snapshot: {
          repo: "zaks-io/example",
          linear: { issues: [{ identifier: "LIN-1", state: "Done" }] },
        },
      }),
    /zero live issues/,
  );
});

test("tick-plan does not fail when no Linear queue was queried", () => {
  const output = runPlan({
    snapshot: { repo: "zaks-io/example", prs: [] },
  });
  assert.equal(output.counts.startableTickets, 0);
});
