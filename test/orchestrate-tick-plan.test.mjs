import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "skills", "ziw-orchestrate", "scripts", "tick-plan.mjs");

function runPlan(input) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-plan-"));
  const file = path.join(dir, "input.json");
  writeFileSync(file, JSON.stringify(input), "utf8");
  return JSON.parse(execFileSync("node", [script, file, "--debug"], { encoding: "utf8" }));
}

function runCompactPlan(input) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-compact-plan-"));
  const file = path.join(dir, "input.json");
  writeFileSync(file, JSON.stringify(input), "utf8");
  return JSON.parse(execFileSync("node", [script, file], { encoding: "utf8" }));
}

test("tick-plan advances PRs and fills worker slots in the same tick", () => {
  const output = runCompactPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      generatedAt: "2026-07-22T21:02:00Z",
      baseline: { branch: "main", headSha: "main-head" },
      prs: [
        {
          number: 247,
          state: "open",
          headSha: "pr-head",
          isDraft: false,
          checks: { state: "SUCCESS", failed: [], pending: [] },
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
        },
      ],
    },
    config: {
      mergeAuthority: "agent",
      requireConformanceEvidence: false,
      workerConcurrencyCap: 2,
    },
    state: {
      reviewEvidenceByPr: {
        247: {
          hasReviewEvidence: true,
          reviewedHeadSha: "pr-head",
          reviewVerdict: "Ready to Merge",
        },
      },
      startableTickets: [{ id: "MAIN-256", footprint: ["apps/web"] }],
    },
  });

  assert.deepEqual(output.capacity, { cap: 2, headroom: 2, used: 0 });
  assert.deepEqual(
    output.actions.map(({ target, kind }) => ({ target, kind })),
    [
      { target: "ticket:MAIN-256", kind: "dispatch" },
      { target: "pr:247", kind: "arm-auto-merge" },
    ],
  );
  assert.equal(output.wake.state, "act-now");
});

test("tick-plan reuses a current GitHub approval and merges without another review", () => {
  const output = runCompactPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [
        {
          number: 241,
          state: "open",
          headSha: "approved-head",
          changedFiles: 3,
          checks: { state: "SUCCESS", failed: [], pending: [] },
          latestReviews: {
            reviewer: { state: "APPROVED", headSha: "approved-head" },
          },
        },
      ],
      linear: { issues: [] },
    },
    config: { mergeAuthority: "agent", requireConformanceEvidence: false },
  });

  assert.deepEqual(
    output.actions.map(({ target, kind }) => ({ target, kind })),
    [{ target: "pr:241", kind: "arm-auto-merge" }],
  );
});

test("tick-plan reuses review when only the base changed and the reviewed diff is equivalent", () => {
  const output = runCompactPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [
        {
          number: 242,
          state: "open",
          headSha: "rebased-head",
          reviewDiffFingerprint: "same-reviewed-diff",
          changedFiles: 2,
          checks: { state: "SUCCESS", failed: [], pending: [] },
        },
      ],
    },
    config: { mergeAuthority: "agent" },
    state: {
      reviewEvidenceByPr: {
        242: {
          reviewedHeadSha: "old-head",
          reviewedDiffFingerprint: "same-reviewed-diff",
          reviewVerdict: "Ready to Merge",
        },
      },
    },
  });

  assert.equal(output.actions[0].kind, "arm-auto-merge");
  assert.equal(
    output.actions.some((action) => action.kind === "request-review"),
    false,
  );
});

test("optional hosted review state never parks an otherwise merge-ready PR", () => {
  const output = runCompactPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [
        {
          number: 243,
          state: "open",
          headSha: "approved-head",
          changedFiles: 2,
          checks: { state: "SUCCESS", failed: [], pending: [] },
          latestReviews: { reviewer: { state: "APPROVED", headSha: "approved-head" } },
        },
      ],
    },
    config: { mergeAuthority: "agent" },
    state: {
      hostedReviewByPr: {
        243: { recommended: true, hostedReviewPending: true, hostedReviewHeadSha: "approved-head" },
      },
    },
  });

  assert.equal(output.actions[0].kind, "arm-auto-merge");
  assert.equal(
    output.waits.some((wait) => wait.signal === "hosted-review"),
    false,
  );
});

test("tick-plan does not repeat a review request for the same head", () => {
  const output = runCompactPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [
        {
          number: 242,
          state: "open",
          headSha: "stable-head",
          changedFiles: 2,
          checks: { state: "SUCCESS", failed: [], pending: [] },
        },
      ],
      linear: { issues: [] },
    },
    config: { requireConformanceEvidence: false },
    state: { reviewRequestsByPr: { 242: { headSha: "stable-head", status: "pending" } } },
  });

  assert.equal(
    output.actions.some((action) => action.kind === "request-review"),
    false,
  );
  assert.deepEqual(output.waits, [
    { target: "pr:242", signal: "review", reason: "REVIEW_IN_FLIGHT" },
  ]);
});

test("tick-plan never routes a conformance gap into another code review", () => {
  const output = runCompactPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [
        {
          number: 243,
          state: "open",
          headSha: "reviewed-head",
          changedFiles: 1,
          checks: { state: "SUCCESS", failed: [], pending: [] },
          latestReviews: {
            reviewer: { state: "APPROVED", headSha: "reviewed-head" },
          },
        },
      ],
      linear: { issues: [] },
    },
    config: { mergeAuthority: "agent", requireConformanceEvidence: true },
  });

  assert.equal(
    output.actions.some((action) => action.kind === "request-review"),
    false,
  );
  assert.deepEqual(output.actions, [
    {
      target: "pr:243",
      kind: "verify-conformance",
      owner: "orchestrator",
      reason: "CONFORMANCE_REQUIRED",
    },
  ]);
});

test("tick-plan reconciles an empty PR instead of reviewing it", () => {
  const output = runCompactPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [
        {
          number: 244,
          state: "open",
          headSha: "empty-head",
          changedFiles: 0,
          checks: { state: "SUCCESS", failed: [], pending: [] },
        },
      ],
      linear: { issues: [] },
    },
  });

  assert.deepEqual(output.actions, [
    {
      target: "pr:244",
      kind: "reconcile-empty-pr",
      owner: "orchestrator",
      reason: "EMPTY_DIFF",
    },
  ]);
});

test("tick-plan does not re-arm auto-merge on every tick", () => {
  const output = runCompactPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [
        {
          number: 245,
          state: "open",
          headSha: "approved-head",
          changedFiles: 2,
          autoMergeArmed: true,
          checks: { state: "SUCCESS", failed: [], pending: [] },
          latestReviews: {
            reviewer: { state: "APPROVED", headSha: "approved-head" },
          },
        },
      ],
      linear: { issues: [] },
    },
    config: { mergeAuthority: "agent", requireConformanceEvidence: false },
  });

  assert.deepEqual(output.actions, []);
  assert.deepEqual(output.waits, [
    { target: "pr:245", signal: "merge", reason: "AUTO_MERGE_ARMED" },
  ]);
});

test("tick-plan hash ignores collection time and declares parallel execution", () => {
  const base = {
    repo: "zaks-io/mainstay",
    prs: [],
    linear: { issues: [] },
  };
  const first = runCompactPlan({ snapshot: { ...base, generatedAt: "2026-07-22T01:00:00Z" } });
  const second = runCompactPlan({ snapshot: { ...base, generatedAt: "2026-07-22T01:05:00Z" } });

  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.deepEqual(first.execution, {
    completion: "attempt-all-actions",
    mode: "parallel",
    lanes: ["dispatch", "pr"],
  });
  assert.equal(Number.isInteger(first.usage.elapsedMs), true);
  assert.equal(first.usage.outputBytes > 0, true);
  assert.equal(first.usage.estimatedOutputTokens > 0, true);
});

test("published tick-plan is self-contained", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-published-plan-"));
  try {
    const publishedSkill = path.join(dir, "ziw-orchestrate");
    cpSync(path.join(root, "skills", "ziw-orchestrate"), publishedSkill, { recursive: true });
    const input = path.join(dir, "input.json");
    writeFileSync(input, JSON.stringify({ snapshot: { repo: "zaks-io/example", prs: [] } }));

    const output = JSON.parse(
      execFileSync("node", [path.join(publishedSkill, "scripts", "tick-plan.mjs"), input], {
        encoding: "utf8",
      }),
    );

    assert.deepEqual(output.capacity, { cap: 3, headroom: 3, used: 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tick-plan repairs draft PRs without withholding worker dispatch", () => {
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
    config: { workerConcurrencyCap: 1 },
    state: {
      startableTickets: [{ id: "ZAK-1", footprint: ["src/a.ts"] }],
    },
  });

  assert.equal(output.nextAction, "dispatch-selected-work");
  assert.equal(output.footprint.prs, 1);
  assert.equal(output.decisions.dispatch.selected.length, 1);
  assert.deepEqual(
    output.actions.map((action) => action.kind),
    ["dispatch", "repair-draft"],
  );
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
    config: { workerConcurrencyCap: 3 },
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
    config: { workerConcurrencyCap: 3, readinessLabels: ["ready-for-agent"] },
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
    config: { workerConcurrencyCap: 3, readinessLabels: ["ready-for-agent"] },
  });

  assert.equal(output.nextAction, "dispatch-selected-work");
  assert.deepEqual(output.decisions.dispatch.selected, [
    { id: "LIN-1", footprint: ["apps/api/src/index.ts"] },
  ]);
  assert.deepEqual(output.decisions.trackerStateUpdates, [
    { ticket: "LIN-1", targetState: "In Progress", timing: "before-dispatch" },
  ]);
});

test("tick-plan uses the configured in-progress state before dispatch", () => {
  const output = runPlan({
    snapshot: { repo: "zaks-io/example", prs: [] },
    config: { workerConcurrencyCap: 1, inProgressState: "Started" },
    state: {
      startableTickets: [{ id: "ZAK-1", footprint: ["src/a.ts"] }],
    },
  });

  assert.deepEqual(output.decisions.trackerStateUpdates, [
    { ticket: "ZAK-1", targetState: "Started", timing: "before-dispatch" },
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
            workerSession: "bc-313",
            footprint: ["apps/stripe-ingest"],
          },
          {
            identifier: "MAIN-317",
            state: "In Review",
            stateType: "started",
            workerSession: "bc-317",
            footprint: ["apps/web/routing"],
          },
          {
            identifier: "MAIN-319",
            state: "In Progress",
            stateType: "started",
            workerSession: "bc-319",
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
    config: { workerConcurrencyCap: 3, readinessLabels: ["ready-for-agent"] },
  });

  assert.equal(output.nextAction, "wait-for-signal");
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
          { identifier: "MAIN-313", workerSession: "bc-313", footprint: ["apps/stripe-ingest"] },
          { identifier: "MAIN-317", workerSession: "bc-317", footprint: ["apps/web/routing"] },
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
    config: { workerConcurrencyCap: 3, readinessLabels: ["ready-for-agent"] },
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
            workerSession: "bc-313",
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
    config: { workerConcurrencyCap: 3, readinessLabels: ["ready-for-agent"] },
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
            workerSession: "bc-313",
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
    config: { workerConcurrencyCap: 3, readinessLabels: ["ready-for-agent"] },
  });

  assert.deepEqual(output.decisions.dispatch.selected, []);
  assert.equal(output.decisions.dispatch.deferred[0].conflictsWith, "PR-313");
});

test("tick-plan waits for active workers when the scoped queue is empty", () => {
  const output = runPlan({
    snapshot: {
      repo: "zaks-io/mainstay",
      prs: [],
      linear: {
        activeIssues: [
          { identifier: "MAIN-313", workerSession: "bc-313", footprint: ["apps/stripe-ingest"] },
        ],
        issues: [],
      },
    },
    config: { workerConcurrencyCap: 1 },
  });

  assert.equal(output.nextAction, "wait-for-signal");
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
        activeIssues: [{ identifier: "MAIN-313", workerSession: "bc-313" }],
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

test("tick-plan treats an abandoned local worktree as a collision but not a worker", () => {
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
    config: { workerConcurrencyCap: 1, readinessLabels: ["ready-for-agent"] },
  });

  assert.equal(output.nextAction, "DEFER_FOR_FILE_CONTENTION");
  assert.deepEqual(output.capacity, { cap: 1, headroom: 1, used: 0 });
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
    config: { workerConcurrencyCap: 1 },
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
    config: { workerConcurrencyCap: 1 },
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
    config: { workerConcurrencyCap: 1 },
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
    config: { workerConcurrencyCap: 2 },
  });

  assert.equal(output.footprint.dispatches, 0);
  assert.equal(output.footprint.prs, 1);
});

test("tick-plan reports delivered when a successful Linear query is empty", () => {
  const output = runCompactPlan({
    snapshot: { repo: "zaks-io/example", linear: { issues: [] } },
  });

  assert.equal(output.wake.state, "delivered");
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
