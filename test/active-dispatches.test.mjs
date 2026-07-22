import assert from "node:assert/strict";
import test from "node:test";

import {
  completedByMergedPullRequest,
  deriveActiveDispatches,
} from "../skills/ziw-orchestrate/scripts/active-dispatches.mjs";

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
