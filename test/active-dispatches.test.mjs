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
        activeIssues: [{ identifier: "MAIN-7", stateType: "started", footprint: ["src/hot.ts"] }],
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
          { identifier: "MAIN-3", stateType: "started", assignee: "Isaac" },
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
        activeIssues: [{ identifier: "MAIN-4", stateType: "started" }],
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
