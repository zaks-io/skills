import assert from "node:assert/strict";
import test from "node:test";

import {
  completedByMergedPullRequest,
  deriveActiveDispatches,
  issuesWithDeliveryEvidence,
  reconcileActiveDelivery,
} from "../skills/ziw-orchestrate/scripts/active-dispatches.mjs";
import { activeWorkerCapacity } from "../skills/ziw-orchestrate/scripts/workflow-contract.mjs";

test("active dispatches combine ledger aliases and deduplicate them", () => {
  const dispatches = deriveActiveDispatches({
    state: {
      dispatches: [{ issueId: "MAIN-1", state: "running" }],
      ledgerDispatches: [
        { issueId: "MAIN-1", state: "running" },
        { issueId: "MAIN-2", state: "running" },
      ],
    },
  });

  assert.deepEqual(
    dispatches.map((dispatch) => dispatch.issueId),
    ["MAIN-1", "MAIN-2"],
  );
});

test("deduplication enriches ledger dispatches with live footprint evidence", () => {
  const [dispatch] = deriveActiveDispatches({
    snapshot: {
      linear: {
        activeIssues: [{ identifier: "MAIN-7", workerSession: "bc-7", footprint: ["src/hot.ts"] }],
      },
    },
    state: {
      dispatches: [{ issueId: "MAIN-7", state: "running" }],
    },
  });

  assert.deepEqual(dispatch.footprint, ["src/hot.ts"]);
  assert.equal(dispatch.source, "ledger+linear-active-claim");
});

test("terminal Linear assignments are not active claims", () => {
  const dispatches = deriveActiveDispatches({
    snapshot: {
      linear: {
        activeIssues: [
          { identifier: "MAIN-1", stateType: "completed", assignee: "Isaac" },
          { identifier: "MAIN-2", stateType: "canceled", assignee: "Isaac" },
          { identifier: "MAIN-3", workerSession: "bc-3", assignee: "Isaac" },
        ],
      },
    },
  });

  assert.deepEqual(
    dispatches.map((dispatch) => dispatch.issueId),
    ["MAIN-3"],
  );
});

test("dependency bot PRs do not suppress active issue claims", () => {
  const dispatches = deriveActiveDispatches({
    snapshot: {
      linear: {
        activeIssues: [{ identifier: "MAIN-4", workerSession: "bc-4" }],
      },
    },
    pullRequests: [
      {
        number: 4,
        state: "open",
        author: { login: "dependabot[bot]" },
        headRefName: "dependabot/npm/main-4-package",
      },
    ],
  });

  assert.deepEqual(
    dispatches.map((dispatch) => dispatch.issueId),
    ["MAIN-4"],
  );
});

test("unknown worktree merge state consumes capacity conservatively", () => {
  const dispatches = deriveActiveDispatches({
    snapshot: {
      baseline: { branch: "main" },
      worktrees: [
        {
          path: "/tmp/main-5",
          branch: "main-5-work",
          dirty: null,
          mergedIntoBaseline: null,
        },
      ],
    },
  });

  assert.deepEqual(
    dispatches.map(({ issueId, source }) => ({ issueId, source })),
    [{ issueId: "MAIN-5", source: "local-worktree-unmerged" }],
  );
});

test("detached worktrees are not mistaken for a missing baseline branch", () => {
  const dispatches = deriveActiveDispatches({
    snapshot: {
      baseline: { branch: null },
      worktrees: [
        {
          path: "/tmp/detached-work",
          branch: null,
          headSha: "abc123",
          dirty: null,
          mergedIntoBaseline: null,
        },
      ],
    },
  });

  assert.deepEqual(
    dispatches.map(({ id, source }) => ({ id, source })),
    [{ id: "/tmp/detached-work", source: "local-worktree-unmerged" }],
  );
});

test("merged PR evidence matches exact heads without hiding a reused branch", () => {
  const mergedPullRequests = [{ headRefName: "main-6-work", headSha: "merged-head" }];

  assert.equal(
    completedByMergedPullRequest(
      { branch: "main-6-work", headSha: "merged-head" },
      mergedPullRequests,
    ),
    true,
  );
  assert.equal(
    completedByMergedPullRequest(
      { branch: "main-6-work", headSha: "new-head" },
      mergedPullRequests,
    ),
    false,
  );
});

test("completed and stale dispatch receipts do not consume worker slots", () => {
  const dispatches = deriveActiveDispatches({
    state: {
      dispatches: [
        { id: "MAIN-7", status: "completed" },
        { id: "MAIN-8", status: "stale" },
        { id: "MAIN-9", status: "running" },
      ],
    },
  });

  assert.deepEqual(
    dispatches.map((dispatch) => dispatch.id),
    ["MAIN-9"],
  );
});

test("started tracker work reserves files without inventing a live worker", () => {
  const dispatches = deriveActiveDispatches({
    snapshot: {
      linear: {
        activeIssues: [{ identifier: "MAIN-10", stateType: "started", footprint: ["src/hot.ts"] }],
        issues: [{ identifier: "MAIN-11", state: { type: "started" }, footprint: ["src/cold.ts"] }],
      },
    },
  });

  assert.deepEqual(
    dispatches.map(({ issueId, footprint, occupiesWorkerSlot }) => ({
      issueId,
      footprint,
      occupiesWorkerSlot,
    })),
    [
      { issueId: "MAIN-10", footprint: ["src/hot.ts"], occupiesWorkerSlot: false },
      { issueId: "MAIN-11", footprint: ["src/cold.ts"], occupiesWorkerSlot: false },
    ],
  );
  assert.deepEqual(activeWorkerCapacity({ dispatches }, { cap: 3 }), {
    cap: 3,
    headroom: 3,
    used: 0,
  });
});

test("live worker receipts upgrade started reservations and retain their footprints", () => {
  const dispatches = deriveActiveDispatches({
    snapshot: {
      linear: {
        activeIssues: [{ identifier: "MAIN-10", stateType: "started", footprint: ["src/hot.ts"] }],
      },
    },
    state: { dispatches: [{ issueId: "MAIN-10", sessionId: "worker-10", state: "running" }] },
  });

  assert.equal(dispatches.length, 1);
  assert.deepEqual(dispatches[0].footprint, ["src/hot.ts"]);
  assert.equal(dispatches[0].occupiesWorkerSlot, true);
  assert.equal(activeWorkerCapacity({ dispatches }).used, 1);
});

test("persisted reservations retain their explicit non-worker status", () => {
  const dispatches = deriveActiveDispatches({
    state: {
      dispatches: [{ issueId: "MAIN-10", occupiesWorkerSlot: false, footprint: ["src/hot.ts"] }],
      activeWork: [{ issueId: "MAIN-11", occupiesWorkerSlot: false, footprint: ["src/cold.ts"] }],
    },
  });

  assert.equal(dispatches.length, 2);
  assert.equal(activeWorkerCapacity({ dispatches }).used, 0);
});

test("workers and PRs sharing a baseline commit remain separate delivery identities", () => {
  const dispatches = deriveActiveDispatches({
    state: {
      dispatches: [
        { issueId: "MAIN-10", branch: "main-10-one", sessionId: "worker-10", headSha: "baseline" },
        { issueId: "MAIN-11", branch: "main-11-two", sessionId: "worker-11", headSha: "baseline" },
      ],
    },
    pullRequests: [
      { issueId: "MAIN-12", headRefName: "main-12-three", headSha: "baseline", state: "open" },
    ],
  });

  assert.deepEqual(
    dispatches.map((dispatch) => dispatch.issueId),
    ["MAIN-10", "MAIN-11"],
  );
  assert.equal(activeWorkerCapacity({ dispatches }).used, 2);
});

test("explicitly different sessions for the same issue consume distinct worker slots", () => {
  const dispatches = deriveActiveDispatches({
    state: {
      dispatches: [{ issueId: "MAIN-10", sessionId: "worker-one", branch: "main-10-work" }],
      ledgerDispatches: [{ issueId: "MAIN-10", sessionId: "worker-two", branch: "main-10-work" }],
    },
    snapshot: {
      linear: {
        activeIssues: [{ identifier: "MAIN-10", stateType: "started", footprint: ["src/hot.ts"] }],
      },
    },
  });

  assert.equal(dispatches.length, 2);
  assert.deepEqual(
    dispatches.map((dispatch) => dispatch.sessionId),
    ["worker-one", "worker-two"],
  );
  assert.equal(activeWorkerCapacity({ dispatches }).used, 2);
});

test("unidentified worktrees sharing a commit retain both file reservations", () => {
  const dispatches = deriveActiveDispatches({
    snapshot: {
      worktrees: [
        { path: "/tmp/feature-one", branch: "feature-one", headSha: "baseline" },
        { path: "/tmp/feature-two", branch: "feature-two", headSha: "baseline" },
      ],
    },
  });

  assert.equal(dispatches.length, 2);
  assert.equal(activeWorkerCapacity({ dispatches }).used, 0);
});

test("delivery evidence enriches matching issues without replacing metadata or matching ID prefixes", () => {
  const issues = [
    {
      identifier: "MAIN-1",
      state: "Todo",
      activeClaim: false,
      footprint: ["src/one.ts"],
      project: { id: "project" },
      openPr: { state: "closed" },
    },
    { identifier: "MAIN-10", state: "Todo", activeClaim: false },
    { identifier: "MAIN-2", state: "Todo", activeClaim: false },
    { identifier: "MAIN-3", state: "Todo", activeClaim: false },
    { identifier: "MAIN-4", state: "Todo", activeClaim: false },
  ];
  const enriched = issuesWithDeliveryEvidence(issues, {
    pullRequests: [
      { title: "MAIN-10: feature", state: "open" },
      { headRefName: "main-2-old-work", state: "closed" },
      { headRefName: "main-3-dependency", state: "open", author: "dependabot[bot]" },
    ],
    dispatches: [{ issueId: "MAIN-4", state: "running", occupiesWorkerSlot: false }],
  });

  assert.equal(enriched[0].activeClaim, false);
  assert.equal(enriched[0].openPr, false);
  assert.equal(enriched[1].openPr, true);
  assert.equal(enriched[2].openPr, false);
  assert.equal(enriched[3].openPr, false);
  assert.equal(enriched[4].activeClaim, true);
  assert.deepEqual(enriched[0].project, issues[0].project);
  assert.deepEqual(enriched[0].footprint, ["src/one.ts"]);
  assert.equal(issues[4].activeClaim, false);
});

test("delivery enrichment canonicalizes PR collection and closed-object evidence", () => {
  const [live, closed] = issuesWithDeliveryEvidence([
    { identifier: "MAIN-1", openPr: false, prs: [{ state: "open" }] },
    { identifier: "MAIN-2", openPr: { state: "closed" }, pullRequests: [{ state: "merged" }] },
  ]);

  assert.equal(live.openPr, true);
  assert.equal(closed.openPr, false);
});

test("all-issue metadata enriches PR risk labels without adding unscoped reservations or footprints", () => {
  const result = reconcileActiveDelivery({
    issuesForPrMetadata: [
      {
        identifier: "MAIN-15",
        stateType: "started",
        workerSession: "other-worker",
        labels: ["risk-high"],
        footprint: ["other/project"],
      },
      { identifier: "MAIN-16", stateType: "started", footprint: ["other/worktree"] },
    ],
    snapshot: { worktrees: [{ path: "/tmp/main-16", branch: "main-16-feature" }] },
    pullRequests: [{ number: 15, headRefName: "main-15-feature", state: "open" }],
  });

  assert.deepEqual(result.pullRequests[0].issueLabels, ["risk-high"]);
  assert.deepEqual(result.pullRequests[0].footprint, []);
  assert.equal(result.dispatches.length, 1);
  assert.equal(result.dispatches[0].source, "local-worktree-unmerged");
  assert.deepEqual(result.dispatches[0].footprint, []);
  assert.equal(activeWorkerCapacity({ dispatches: result.dispatches }).used, 0);
});

test("PR identity prefers explicit links over title mentions and accepts only leading-key title fallback", () => {
  const issues = [1, 2, 3, 4].map((number) => ({ identifier: `MAIN-${number}` }));
  const enriched = issuesWithDeliveryEvidence(issues, {
    pullRequests: [
      { title: "Refactor unrelated code near MAIN-1", state: "open" },
      { title: "MAIN-2: update", headRefName: "main-3-feature", state: "open" },
      { title: "MAIN-4: feature", state: "open" },
    ],
  });

  assert.deepEqual(
    enriched.map((issue) => issue.openPr),
    [false, false, true, true],
  );
});
