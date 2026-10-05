import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { dispatchSelectionDecision } from "../skills/ziw-orchestrate/scripts/workflow-contract.mjs";

const planner = path.resolve("skills/ziw-orchestrate/scripts/tick-plan.mjs");
function plan({ linear = { issues: [] }, prs = [], state = {}, config = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-guardrails-"));
  try {
    const file = path.join(dir, "input.json");
    writeFileSync(
      file,
      JSON.stringify({ snapshot: { repo: "example/repo", prs, linear }, state, config }),
    );
    return JSON.parse(
      execFileSync(process.execPath, [planner, file, "--debug"], { encoding: "utf8" }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const reviewedPr = {
  number: 2,
  state: "open",
  headSha: "new-head",
  reviewDiffFingerprint: "same-diff",
  changedFiles: 1,
  checks: { state: "SUCCESS", failed: [], pending: [] },
};
for (const evidence of [
  { reviewedDiffFingerprint: "same-diff" },
  { reviewedDiffFingerprint: "same-diff", independentReviewCount: 1 },
  { reviewedDiffFingerprint: "same-diff", reviewVerdict: "Ready to Merge" },
  {
    reviewedDiffFingerprint: "same-diff",
    reviewVerdict: "Ready to Merge",
    independentReviewCount: 0,
  },
  {
    reviewedDiffFingerprint: "same-diff",
    reviewVerdict: "Ready to Merge",
    independentReviewCount: 1,
    hasReviewEvidence: false,
  },
  {
    reviewRelevantDiffFingerprint: "same-diff",
    reviewVerdict: "Ready to Merge",
    independentReviewCount: 1,
    hasReviewEvidence: true,
  },
]) {
  test(`fingerprint cannot invent completed review: ${JSON.stringify(evidence)}`, () => {
    const output = plan({
      prs: [reviewedPr],
      config: { mergeAuthority: "agent" },
      state: { reviewEvidenceByPr: { 2: evidence } },
    });
    assert.ok(!output.actions.some(({ kind }) => kind === "arm-auto-merge"));
    assert.ok(output.actions.some(({ kind }) => kind === "request-review"));
  });
}

test("an explicit completed clean review remains reusable after a rebase", () => {
  const output = plan({
    prs: [reviewedPr],
    config: { mergeAuthority: "agent" },
    state: {
      reviewEvidenceByPr: {
        2: {
          reviewedReviewDiffFingerprint: "same-diff",
          reviewedHeadSha: "old-head",
          reviewVerdict: "Approved",
          independentReviews: [{ reviewer: "independent" }],
        },
      },
    },
  });
  assert.ok(output.actions.some(({ kind }) => kind === "arm-auto-merge"));
});

const readyIssue = (identifier, extra = {}) => ({
  identifier,
  state: "Todo",
  labels: ["kind-slice", "ready-for-agent", "example/repo"],
  footprint: [`src/${identifier}.ts`],
  ...extra,
});
test("an existing PR blocks its ticket independently of file collisions", () => {
  const output = plan({
    prs: [
      {
        number: 7,
        state: "open",
        isDraft: true,
        title: "TEST-1 Existing work",
        headRefName: "feat/TEST-1",
        footprint: ["src/unrelated.ts"],
      },
    ],
    linear: { issues: [readyIssue("TEST-1")] },
    state: { startableTickets: [{ id: "TEST-1", footprint: ["src/new.ts"] }] },
  });
  assert.deepEqual(output.decisions.dispatch.selected, []);
  assert.equal(output.decisions.linearDag.nodes[0].openPr, true);
  assert.ok(output.holds.some(({ reason }) => reason === "DELIVERY_ALREADY_ACTIVE"));
});

test("started human work reserves shared files without consuming an agent slot", () => {
  const output = plan({
    linear: {
      issues: [readyIssue("TEST-2", { footprint: ["src/shared.ts"] }), readyIssue("TEST-3")],
      activeIssues: [
        readyIssue("TEST-1", {
          state: "In Progress",
          stateType: "started",
          assignee: "Human",
          footprint: ["src/shared.ts"],
        }),
      ],
    },
    config: { workerConcurrencyCap: 1 },
  });
  assert.deepEqual(output.capacity, { used: 0, headroom: 1, cap: 1 });
  assert.deepEqual(
    output.decisions.dispatch.selected.map(({ id }) => id),
    ["TEST-3"],
  );
  assert.ok(
    output.holds.some(
      ({ target, reason }) => target === "ticket:TEST-2" && reason === "FILE_COLLISION",
    ),
  );
});

test("two workers at the same base commit consume two slots", () => {
  const output = plan({
    config: { workerConcurrencyCap: 2 },
    state: {
      dispatches: [1, 2].map((number) => ({
        id: `TEST-${number}`,
        issueId: `TEST-${number}`,
        branch: `feat/TEST-${number}`,
        headSha: "same-base",
        state: "running",
      })),
      startableTickets: [{ id: "TEST-3", footprint: ["src/new.ts"] }],
    },
  });
  assert.deepEqual(output.capacity, { used: 2, headroom: 0, cap: 2 });
  assert.deepEqual(output.decisions.dispatch.selected, []);
});

test("default local routes obey the hard budget stop and preserve the configured path", () => {
  const base = {
    config: {
      workerConcurrencyCap: 2,
      defaultWorkerPath: "local-codex",
      localBudgetSoftStopPercent: 80,
      localBudgetHardStopPercent: 90,
    },
    state: {
      localBudgetUsagePercent: 99,
      startableTickets: [{ id: "TEST-1", footprint: ["src/demo.ts"] }],
    },
  };
  const stopped = plan(base);
  assert.deepEqual(stopped.decisions.dispatch.selected, []);
  const allowed = plan({ ...base, state: { ...base.state, localBudgetUsagePercent: 10 } });
  assert.equal(allowed.actions.find(({ kind }) => kind === "dispatch").owner, "local-codex");
});

test("default remote routes remain eligible above the local budget stop", () => {
  const output = plan({
    config: {
      defaultWorkerPath: "remote-cursor",
      localBudgetSoftStopPercent: 80,
      localBudgetHardStopPercent: 90,
    },
    state: {
      localBudgetUsagePercent: 99,
      startableTickets: [{ id: "TEST-1", footprint: ["src/demo.ts"] }],
    },
  });
  assert.equal(output.actions.find(({ kind }) => kind === "dispatch").owner, "remote-cursor");
});

test("default local routes obey per-tick limits even without ticket routing metadata", () => {
  const output = plan({
    config: {
      defaultWorkerPath: "local-codex",
      workerConcurrencyCap: 3,
      localStartsBelowSoftLimit: 1,
    },
    state: {
      startableTickets: [1, 2].map((id) => ({ id: `TEST-${id}`, footprint: [`src/${id}.ts`] })),
    },
  });
  assert.equal(output.decisions.dispatch.selected.length, 1);
  assert.equal(
    output.decisions.dispatch.deferred[0].reason,
    "configured per-tick local start limit is already allocated",
  );
});

test("configured budget limits hold a route whose worker kind is unknown", () => {
  for (const defaultWorkerPath of [undefined, "unknown-worker"]) {
    const output = dispatchSelectionDecision(
      { startableTickets: [{ id: "TEST-1", footprint: ["src/demo.ts"] }] },
      { defaultWorkerPath, localStartsBelowSoftLimit: 1 },
    );
    assert.deepEqual(output.selected, []);
  }
});

test("numeric changed-file counts are never interpreted as collision paths", () => {
  const output = dispatchSelectionDecision({
    pullRequests: [{ id: "pr-1", state: "open", changedFiles: 1 }],
    startableTickets: [{ id: "TEST-1", footprint: ["1"] }],
  });
  assert.equal(output.selected.length, 1);
});

test("explicit ticket sets cannot bypass repository or requested delivery scope", () => {
  const output = plan({
    linear: {
      candidateScope: { routeLabel: "example/repo", states: ["Todo"] },
      candidateIssueIds: ["TEST-1", "TEST-2"],
      issues: [
        readyIssue("TEST-1"),
        readyIssue("TEST-2"),
        readyIssue("TEST-3", { labels: ["kind-slice", "ready-for-agent", "example/other"] }),
      ],
    },
    state: {
      scopeIssueIds: ["TEST-1", "TEST-3"],
      startableTickets: [1, 2, 3].map((id) => ({ id: `TEST-${id}` })),
    },
  });
  assert.deepEqual(
    output.decisions.dispatch.selected.map(({ id }) => id),
    ["TEST-1"],
  );
  assert.deepEqual(
    output.holds.filter(({ reason }) => reason === "OUT_OF_SCOPE").map(({ target }) => target),
    ["ticket:TEST-2", "ticket:TEST-3"],
  );
});

test("out-of-repository started blockers do not reserve this repository's files", () => {
  const output = plan({
    linear: {
      candidateScope: { routeLabel: "example/repo", states: ["Todo"] },
      candidateIssueIds: ["TEST-1"],
      issues: [
        readyIssue("TEST-1", { footprint: ["src/shared.ts"] }),
        readyIssue("OTHER-1", {
          state: "In Progress",
          stateType: "started",
          labels: ["example/other"],
          footprint: ["src/shared.ts"],
        }),
      ],
      activeIssues: [
        readyIssue("OTHER-1", {
          state: "In Progress",
          stateType: "started",
          labels: ["example/other"],
          footprint: ["src/shared.ts"],
        }),
      ],
    },
  });
  assert.deepEqual(
    output.decisions.dispatch.selected.map(({ id }) => id),
    ["TEST-1"],
  );
  assert.deepEqual(output.decisions.activeDispatches, []);
});

test("unknown default routes remain compatible when no worker limits are configured", () => {
  const output = plan({
    config: { defaultWorkerPath: "local Codex worktree/session" },
    state: { startableTickets: [{ id: "TEST-1", footprint: ["src/new.ts"] }] },
  });
  assert.equal(
    output.actions.find(({ kind }) => kind === "dispatch").owner,
    "local Codex worktree/session",
  );
});

for (const evidence of [
  { reviewEvidenceCurrent: true, reviewedDiffFingerprint: "old-diff", independentReviewCount: 1 },
  { reviewEvidenceCurrent: true, reviewedDiffFingerprint: "same-diff", independentReviewCount: 0 },
  { reviewEvidenceCurrent: true, reviewedDiffFingerprint: "same-diff" },
]) {
  test(`explicit current boolean cannot replace completed current review: ${JSON.stringify(evidence)}`, () => {
    const output = plan({
      prs: [reviewedPr],
      config: { mergeAuthority: "agent" },
      state: { reviewEvidenceByPr: { 2: { ...evidence, reviewVerdict: "Approved" } } },
    });
    assert.ok(!output.actions.some(({ kind }) => kind === "arm-auto-merge"));
    assert.ok(output.actions.some(({ kind }) => kind === "request-review"));
  });
}

for (const extra of [
  { pr: { state: "closed" }, prs: [{ state: "open", number: 9 }] },
  { pr: { state: "open", number: 9 } },
  { claim: { state: "completed" }, activeClaim: true },
]) {
  test(`explicit ticket cannot override live delivery evidence: ${JSON.stringify(extra)}`, () => {
    const output = plan({
      linear: { issues: [readyIssue("TEST-1", extra)] },
      state: { startableTickets: [{ id: "TEST-1" }] },
    });
    assert.deepEqual(output.decisions.dispatch.selected, []);
    assert.ok(output.holds.some(({ reason }) => reason === "DELIVERY_ALREADY_ACTIVE"));
  });
}

test("unfinished human reservations keep an otherwise idle tick blocked", () => {
  const output = plan({
    linear: {
      candidateScope: { routeLabel: "example/repo", states: ["Todo"] },
      candidateIssueIds: [],
      issues: [],
      activeIssues: [
        readyIssue("TEST-1", { state: "In Progress", stateType: "started", assignee: "Human" }),
      ],
    },
  });
  assert.equal(output.wake.state, "blocked");
  assert.equal(output.capacity.used, 0);
  assert.ok(output.holds.some(({ target }) => target === "ticket:TEST-1"));
});

test("requested tickets limit PR and label actions while retaining global collision evidence", () => {
  const output = plan({
    prs: [
      { ...reviewedPr, number: 2, issueId: "TEST-2", footprint: ["src/shared.ts"] },
      { ...reviewedPr, number: 3, issueId: "TEST-1", footprint: ["src/other.ts"] },
    ],
    linear: {
      issues: [readyIssue("TEST-1"), readyIssue("TEST-4", { footprint: ["src/shared.ts"] })],
    },
    state: {
      scopeIssueIds: ["TEST-1", "TEST-4"],
      reviewEvidenceChecks: [
        {
          ticket: "TEST-2",
          reviewedDiffFingerprint: "same-diff",
          reviewDiffFingerprint: "same-diff",
          reviewVerdict: "Approved",
          independentReviewCount: 1,
        },
      ],
    },
  });
  assert.ok(output.actions.some(({ target }) => target === "pr:3"));
  assert.ok(!output.actions.some(({ target }) => target === "pr:2" || target === "ticket:TEST-2"));
  assert.ok(
    output.holds.some(
      ({ target, reason }) => target === "ticket:TEST-4" && reason === "FILE_COLLISION",
    ),
  );
});

test("unrouted tracker work is surfaced as an incomplete tick", () => {
  const output = plan({ linear: { issues: [], unroutedIssueIds: ["TEST-1"] } });
  assert.equal(output.wake.state, "incomplete");
  assert.deepEqual(output.warnings, [{ reason: "UNROUTED_TRACKER_ISSUES", count: 1 }]);
});

for (const staleField of ["reviewedDiffFingerprint", "reviewedReviewDiffFingerprint"]) {
  test(`fresh current-head GitHub approval replaces stale ${staleField}`, () => {
    const output = plan({
      prs: [
        { ...reviewedPr, latestReviews: { reviewer: { state: "APPROVED", headSha: "new-head" } } },
      ],
      config: { mergeAuthority: "agent" },
      state: {
        reviewEvidenceByPr: {
          2: { [staleField]: "old-diff", reviewVerdict: "Approved", independentReviewCount: 1 },
        },
      },
    });
    assert.ok(output.actions.some(({ kind }) => kind === "arm-auto-merge"));
    assert.ok(!output.actions.some(({ kind }) => kind === "request-review"));
  });
}

test("a fresh GitHub approval preserves explicit blocking findings", () => {
  const output = plan({
    prs: [
      { ...reviewedPr, latestReviews: { reviewer: { state: "APPROVED", headSha: "new-head" } } },
    ],
    config: { mergeAuthority: "agent" },
    state: {
      reviewEvidenceByPr: { 2: { reviewedDiffFingerprint: "old-diff", blockingFindings: true } },
    },
  });
  assert.ok(!output.actions.some(({ kind }) => kind === "arm-auto-merge"));
});

for (const reviewVerdict of ["NEEDS REVISION", "DO NOT MERGE"]) {
  test(`GitHub approval preserves a current internal ${reviewVerdict} verdict`, () => {
    const output = plan({
      prs: [
        { ...reviewedPr, latestReviews: { reviewer: { state: "APPROVED", headSha: "new-head" } } },
      ],
      config: { mergeAuthority: "agent" },
      state: {
        reviewEvidenceByPr: {
          2: { reviewedDiffFingerprint: "same-diff", reviewVerdict, independentReviewCount: 1 },
        },
      },
    });
    assert.ok(!output.actions.some(({ kind }) => kind === "arm-auto-merge"));
    assert.ok(output.actions.some(({ kind }) => kind === "route-fix"));
  });
}
