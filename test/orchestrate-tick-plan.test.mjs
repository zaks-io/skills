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

test("tick-plan synthesizes active Linear claims before capacity selection", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [],
      worktrees: [
        {
          path: "/tmp/main-313",
          branch: "main-313-add-stripe-ingress",
        },
      ],
      linear: {
        activeIssues: [
          {
            identifier: "MAIN-313",
            state: "In Progress",
            stateType: "started",
            footprint: ["apps/stripe-ingest"],
          },
          {
            identifier: "MAIN-317",
            state: "In Review",
            stateType: "started",
            footprint: ["apps/web/routing"],
          },
          {
            identifier: "MAIN-319",
            state: "In Progress",
            stateType: "started",
            footprint: ["apps/web/e2e"],
          },
        ],
        issues: [
          {
            identifier: "MAIN-320",
            footprint: ["docs/specs"],
            labels: ["kind-slice", "ready-for-agent"],
            state: "Todo",
          },
        ],
      },
    },
    config: { activePrPreviewCap: 3, readinessLabels: ["ready-for-agent"] },
  });

  assert.equal(output.nextAction, "drain-active-work");
  assert.deepEqual(output.footprint, { dispatches: 3, previews: 0, prs: 0, total: 3 });
  assert.equal(output.counts.synthesizedDispatches, 3);
  assert.equal(output.decisions.dispatch.selected.length, 0);
  assert.deepEqual(
    output.decisions.activeDispatches.map(({ id, source }) => ({ id, source })),
    [
      { id: "MAIN-313", source: "linear-active-claim+local-worktree" },
      { id: "MAIN-317", source: "linear-active-claim" },
      { id: "MAIN-319", source: "linear-active-claim" },
    ],
  );
});

test("tick-plan deduplicates the same active claim and ledger entry against an open PR", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [
        {
          number: 190,
          state: "open",
          headRefName: "main-313-stripe-ingress",
        },
      ],
      linear: {
        activeIssues: [
          { identifier: "MAIN-313", stateType: "started", footprint: ["apps/stripe-ingest"] },
          { identifier: "MAIN-317", stateType: "started", footprint: ["apps/web/routing"] },
        ],
        issues: [
          {
            identifier: "MAIN-320",
            footprint: ["docs/specs"],
            labels: ["kind-slice", "ready-for-agent"],
            state: "Todo",
          },
        ],
      },
    },
    config: { activePrPreviewCap: 3, readinessLabels: ["ready-for-agent"] },
    state: {
      dispatches: [
        { id: "MAIN-313", issueId: "MAIN-313", state: "running" },
        { id: "stale", issueId: "MAIN-999", state: "stopped" },
      ],
      activeWork: [
        { id: "MAIN-313", issueId: "MAIN-313", state: "running" },
        { id: "MAIN-318", issueId: "MAIN-318", state: "running" },
      ],
    },
  });

  assert.deepEqual(output.footprint, { dispatches: 2, previews: 0, prs: 1, total: 3 });
  assert.deepEqual(
    output.decisions.activeDispatches.map(({ id, source }) => ({ id, source })),
    [
      { id: "MAIN-318", source: "local-active-work" },
      { id: "MAIN-317", source: "linear-active-claim" },
    ],
  );
});

test("tick-plan preserves live footprints when enriching ledger dispatches", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [],
      linear: {
        activeIssues: [
          {
            identifier: "MAIN-313",
            stateType: "started",
            footprint: ["apps/stripe-ingest"],
          },
        ],
        issues: [
          {
            identifier: "MAIN-320",
            state: "Todo",
            stateType: "unstarted",
            labels: ["kind-slice", "ready-for-agent"],
            footprint: ["apps/stripe-ingest/routes"],
          },
        ],
      },
    },
    config: { activePrPreviewCap: 3, readinessLabels: ["ready-for-agent"] },
    state: {
      dispatches: [{ issueId: "MAIN-313", state: "running" }],
    },
  });

  assert.deepEqual(output.decisions.activeDispatches[0].footprint, ["apps/stripe-ingest"]);
  assert.deepEqual(output.decisions.dispatch.selected, []);
  assert.deepEqual(output.decisions.dispatch.deferred, [
    {
      id: "MAIN-320",
      conflictsWith: "MAIN-313",
      reason: "predicted file footprint collides with active or selected work",
    },
  ]);
});

test("tick-plan enriches open PR footprints from matching Linear claims", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [{ number: 313, state: "open", headRefName: "main-313-stripe-ingest" }],
      linear: {
        activeIssues: [
          {
            identifier: "MAIN-313",
            stateType: "started",
            footprint: ["apps/stripe-ingest"],
          },
        ],
        issues: [
          {
            identifier: "MAIN-320",
            state: "Todo",
            stateType: "unstarted",
            labels: ["kind-slice", "ready-for-agent"],
            footprint: ["apps/stripe-ingest/routes"],
          },
        ],
      },
    },
    config: { activePrPreviewCap: 3, readinessLabels: ["ready-for-agent"] },
  });

  assert.deepEqual(output.decisions.dispatch.selected, []);
  assert.equal(output.decisions.dispatch.deferred[0].conflictsWith, "PR-313");
});

test("tick-plan drains active Linear claims when the scoped queue is empty", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [],
      linear: {
        activeIssues: [
          { identifier: "MAIN-313", stateType: "started", footprint: ["apps/stripe-ingest"] },
        ],
        issues: [],
      },
    },
    config: { activePrPreviewCap: 1 },
  });

  assert.equal(output.nextAction, "drain-active-work");
  assert.equal(output.footprint.dispatches, 1);
});

test("tick-plan does not let a closed PR suppress an active claim", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [
        {
          number: 190,
          state: "closed",
          open: false,
          headRefName: "main-313-stripe-ingress",
        },
      ],
      linear: {
        activeIssues: [{ identifier: "MAIN-313", stateType: "started" }],
        issues: [{ identifier: "MAIN-313", state: "In Progress", stateType: "started" }],
      },
    },
  });

  assert.deepEqual(
    output.decisions.activeDispatches.map(({ id }) => id),
    ["MAIN-313"],
  );
  assert.equal(output.footprint.dispatches, 1);
  assert.equal(output.counts.openPrs, 0);
});

test("tick-plan treats an issue-linked local worktree as an unreturned dispatch", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      baseline: { branch: "main" },
      prs: [],
      worktrees: [
        {
          path: "/tmp/main-320",
          branch: "main-320-close-integration-seams",
          mergedIntoBaseline: false,
        },
      ],
      linear: {
        activeIssues: [],
        issues: [
          {
            identifier: "MAIN-320",
            footprint: ["docs/specs"],
            labels: ["kind-slice", "ready-for-agent"],
            state: "Todo",
          },
        ],
      },
    },
    config: { activePrPreviewCap: 1, readinessLabels: ["ready-for-agent"] },
  });

  assert.equal(output.nextAction, "drain-active-work");
  assert.deepEqual(output.footprint, { dispatches: 1, previews: 0, prs: 0, total: 1 });
  assert.deepEqual(output.decisions.activeDispatches, [
    {
      id: "MAIN-320",
      issueId: "MAIN-320",
      source: "local-worktree-unmerged",
      branch: "main-320-close-integration-seams",
      worktree: "/tmp/main-320",
      footprint: ["docs/specs"],
    },
  ]);
});

test("tick-plan counts an unmerged local worktree without an issue key", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      baseline: { branch: "main" },
      prs: [],
      worktrees: [
        {
          path: "/tmp/routing-fix",
          branch: "codex/routing-fix",
          headSha: "work-head",
          mergedIntoBaseline: false,
        },
      ],
    },
    config: { activePrPreviewCap: 1 },
  });

  assert.equal(output.footprint.dispatches, 1);
  assert.deepEqual(output.decisions.activeDispatches, [
    {
      id: "codex/routing-fix",
      issueId: null,
      source: "local-worktree-unmerged",
      branch: "codex/routing-fix",
      worktree: "/tmp/routing-fix",
      footprint: [],
    },
  ]);
});

test("tick-plan ignores clean worktrees already merged into the baseline", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      baseline: { branch: "main" },
      prs: [],
      worktrees: [
        {
          path: "/tmp/main-101-old-fix",
          branch: "main-101-old-fix",
          headSha: "merged-head",
          dirty: false,
          mergedIntoBaseline: true,
        },
      ],
    },
    config: { activePrPreviewCap: 1 },
  });

  assert.equal(output.footprint.dispatches, 0);
  assert.deepEqual(output.decisions.activeDispatches, []);
});

test("tick-plan ignores a clean worktree completed by a squash-merged PR", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      baseline: { branch: "main" },
      prs: [],
      worktrees: [
        {
          path: "/tmp/main-101-squash-merged",
          branch: "main-101-old-fix",
          headSha: "pre-squash-head",
          dirty: false,
          mergedIntoBaseline: false,
          completedByMergedPr: true,
        },
      ],
    },
    config: { activePrPreviewCap: 1 },
  });

  assert.equal(output.footprint.dispatches, 0);
  assert.deepEqual(output.decisions.activeDispatches, []);
});

test("tick-plan deduplicates an unmerged worktree against an open PR by branch", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      baseline: { branch: "main" },
      prs: [{ number: 190, state: "open", headRefName: "codex/routing-fix" }],
      worktrees: [
        {
          path: "/tmp/routing-fix",
          branch: "codex/routing-fix",
          headSha: "work-head",
          mergedIntoBaseline: false,
        },
      ],
    },
    config: { activePrPreviewCap: 2 },
  });

  assert.equal(output.footprint.dispatches, 0);
  assert.equal(output.footprint.prs, 1);
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
    snapshot: {
      repo: "zaks-io/example",
      prs: [],
      linear: { skipped: "no --linear-team or Linear credential; use tracker tooling" },
    },
  });
  assert.equal(output.counts.startableTickets, 0);
});
