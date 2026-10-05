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

for (const headRefName of ["codex/zak-12-entry-browsing", "codex/phase-2-zak-12-entry-browsing"]) {
  test(`prefixed PR branch prevents duplicate delivery through planner: ${headRefName}`, () => {
    const output = plan({
      prs: [
        {
          number: 21,
          title: "ZAK-12 entry browsing",
          headRefName,
          headSha: "pr-head",
          isDraft: true,
          changedFiles: 1,
          footprint: ["src/keys.ts"],
        },
      ],
      linear: {
        candidateScope: { routeLabel: "example/repo", states: [] },
        candidateIssueIds: ["ZAK-12"],
        issues: [readyIssue("ZAK-12", { footprint: ["src/entries.ts"] })],
      },
    });
    assert.ok(!output.actions.some(({ kind }) => kind === "dispatch"));
    assert.ok(
      output.holds.some(
        ({ target, reason }) => target === "ticket:ZAK-12" && reason === "DELIVERY_ALREADY_ACTIVE",
      ),
    );
  });
}

test("review and installation worktrees keep truthful reservations without fabricated ticket holds", () => {
  const worktree = "/home/dev/.t3/worktrees/context-server/review-main-2855565";
  const output = plan({
    state: {
      worktrees: [
        {
          path: worktree,
          branch: null,
          headSha: "unmerged",
          dirty: true,
          mergedIntoBaseline: false,
        },
        {
          path: "/tmp/context-review-synthetic-skills",
          branch: "chore/install-workflow-skills-2026-10-04",
          headSha: "skills-head",
          dirty: true,
          mergedIntoBaseline: false,
        },
      ],
      dispatches: [
        { id: "TEST-5", issueId: "TEST-5", worktree, headSha: "unmerged", state: "running" },
      ],
    },
    config: { workerConcurrencyCap: 2 },
  });
  assert.deepEqual(output.capacity, { cap: 2, used: 1, headroom: 1 });
  assert.equal(output.decisions.activeDispatches.length, 2);
  assert.ok(
    !output.holds.some(
      ({ target }) => target === "ticket:MAIN-2855565" || target === "ticket:SKILLS-2026",
    ),
  );
  assert.ok(
    output.holds.some(({ target }) => target === "worktree:/tmp/context-review-synthetic-skills"),
  );
});

test("ambiguous branch evidence cannot auto-merge through a low-only policy", () => {
  const output = plan({
    prs: [{ ...reviewedPr, headRefName: "codex/zak-12-revert-zak-9" }],
    linear: {
      issues: [],
      issueMetadata: [
        { identifier: "ZAK-12", labels: [] },
        { identifier: "ZAK-9", labels: ["risk-docs"] },
      ],
    },
    state: {
      reviewEvidenceByPr: {
        2: {
          reviewedDiffFingerprint: "same-diff",
          reviewVerdict: "Approved",
          independentReviewCount: 1,
        },
      },
    },
    config: { mergeAuthority: "agent", lowRiskLabels: ["risk-docs"], autoMergeRiskTiers: ["low"] },
  });
  assert.ok(!output.actions.some(({ kind }) => kind === "arm-auto-merge"));
});

test("branch-only worktree holds have a single worktree prefix", () => {
  const output = plan({ state: { worktrees: [{ branch: "chore/setup", dirty: true }] } });
  assert.equal(output.holds[0].target, "worktree:chore/setup");
});

const trackerUuid = "11111111-2222-4333-8444-555555555555";
for (const keyField of ["identifier", "ticket", "key"]) {
  for (const source of ["worker", "pr"]) {
    test(`unresolved UUID with explicit ${keyField} on ${source} retains delivery and scope`, () => {
      const receipt = {
        issueId: trackerUuid,
        [keyField]: "ZAK-12",
        footprint: ["src/keys.ts"],
        state: "running",
      };
      const output = plan({
        linear: {
          candidateScope: { routeLabel: "example/repo", states: [] },
          candidateIssueIds: ["ZAK-12"],
          issues: [readyIssue("ZAK-12", { footprint: ["src/entries.ts"] })],
        },
        state: source === "worker" ? { dispatches: [receipt] } : { scopeIssueIds: ["ZAK-12"] },
        prs:
          source === "pr"
            ? [{ ...receipt, state: "open", number: 22, isDraft: true, changedFiles: 1 }]
            : [],
        config: { workerConcurrencyCap: 2 },
      });
      assert.ok(!output.actions.some(({ kind }) => kind === "dispatch"));
      assert.ok(
        output.holds.some(
          ({ target, reason }) =>
            target === "ticket:ZAK-12" && reason === "DELIVERY_ALREADY_ACTIVE",
        ),
      );
      assert.equal(output.capacity.used, source === "worker" ? 1 : 0);
      if (source === "pr")
        assert.ok(
          output.actions.some(({ target, kind }) => target === "pr:22" && kind === "repair-draft"),
        );
    });
  }
}

for (const source of ["worker", "pr"]) {
  test(`a generic receipt ID cannot hide UUID-only ${source} delivery`, () => {
    const receipt = {
      issueId: trackerUuid,
      id: "dispatch-1",
      state: "running",
      footprint: ["src/keys.ts"],
    };
    const output = plan({
      state: {
        startableTickets: [{ id: trackerUuid, footprint: ["src/entries.ts"] }],
        ...(source === "worker" ? { dispatches: [receipt] } : { scopeIssueIds: [trackerUuid] }),
      },
      prs:
        source === "pr"
          ? [{ ...receipt, state: "open", number: 22, isDraft: true, changedFiles: 1 }]
          : [],
      config: { workerConcurrencyCap: 2 },
    });
    assert.ok(!output.actions.some(({ kind }) => kind === "dispatch"));
    assert.ok(
      output.holds.some(
        ({ target, reason }) =>
          target === `ticket:${trackerUuid}` && reason === "DELIVERY_ALREADY_ACTIVE",
      ),
    );
    assert.equal(output.capacity.used, source === "worker" ? 1 : 0);
    if (source === "pr")
      assert.ok(
        output.actions.some(({ target, kind }) => target === "pr:22" && kind === "repair-draft"),
      );
  });
}

for (const field of ["issueId", "identifier", "ticket", "key"]) {
  for (const source of ["worker", "pr"]) {
    test(`explicit UUID ${field} on ${source} prevents duplicate delivery through the planner`, () => {
      const receipt = { [field]: trackerUuid, state: "running", footprint: ["src/keys.ts"] };
      const output = plan({
        linear: {
          candidateScope: { routeLabel: "example/repo", states: [] },
          candidateIssueIds: ["ZAK-12"],
          issues: [readyIssue("ZAK-12", { id: trackerUuid, footprint: ["src/entries.ts"] })],
        },
        state: source === "worker" ? { dispatches: [receipt] } : { scopeIssueIds: ["ZAK-12"] },
        prs:
          source === "pr"
            ? [{ ...receipt, state: "open", number: 22, isDraft: true, changedFiles: 1 }]
            : [],
        config: { workerConcurrencyCap: 2 },
      });
      assert.ok(!output.actions.some(({ kind }) => kind === "dispatch"));
      assert.ok(
        output.holds.some(
          ({ target, reason }) =>
            target === "ticket:ZAK-12" && reason === "DELIVERY_ALREADY_ACTIVE",
        ),
      );
      assert.equal(output.capacity.used, source === "worker" ? 1 : 0);
      if (source === "pr") assert.ok(output.actions.some(({ target }) => target === "pr:22"));
    });
  }
}

test("UUID and key receipts for one explicit session coalesce and retain tracker and live footprints", () => {
  const output = plan({
    linear: { issues: [readyIssue("ZAK-12", { id: trackerUuid })] },
    state: {
      dispatches: [
        {
          issueId: trackerUuid,
          sessionId: "same-worker",
          state: "running",
          footprint: ["src/uuid.ts"],
        },
        {
          issueId: "ZAK-12",
          sessionId: "same-worker",
          state: "running",
          footprint: ["src/key.ts"],
        },
      ],
    },
    config: { workerConcurrencyCap: 2 },
  });
  assert.equal(output.capacity.used, 1);
  assert.equal(output.decisions.activeDispatches.length, 1);
  assert.deepEqual(output.decisions.activeDispatches[0].footprint.toSorted(), [
    "src/ZAK-12.ts",
    "src/key.ts",
    "src/uuid.ts",
  ]);
  assert.ok(!output.actions.some(({ kind }) => kind === "dispatch"));
});

for (const source of ["worker", "pr"]) {
  test(`generic UUID-shaped ${source} id does not establish an issue association`, () => {
    const receipt = { id: trackerUuid, state: "running", footprint: ["src/keys.ts"] };
    const output = plan({
      linear: { issues: [readyIssue("ZAK-12", { id: trackerUuid })] },
      state: source === "worker" ? { dispatches: [receipt] } : {},
      prs: source === "pr" ? [{ ...receipt, number: 22, state: "open", isDraft: true }] : [],
      config: { workerConcurrencyCap: 2 },
    });
    assert.equal(
      output.holds.some(
        ({ target, reason }) => target === "ticket:ZAK-12" && reason === "DELIVERY_ALREADY_ACTIVE",
      ),
      false,
    );
    if (source === "worker") {
      assert.equal(output.capacity.used, 1);
      assert.ok(!output.actions.some(({ kind }) => kind === "dispatch"));
      assert.match(JSON.stringify(output), /WORKER_ISSUE_UNRESOLVED/);
    } else {
      assert.ok(
        output.actions.some(
          ({ target, kind }) => target === "ticket:ZAK-12" && kind === "dispatch",
        ),
      );
    }
  });
}

test("UUID matching absorbs a returned worker into its PR and retains tracker risk", () => {
  const output = plan({
    linear: {
      issues: [
        readyIssue("ZAK-12", {
          id: trackerUuid,
          labels: ["kind-slice", "ready-for-agent", "example/repo", "risk-schema"],
        }),
      ],
    },
    state: {
      dispatches: [
        { issueId: trackerUuid, returned: true, state: "returned", footprint: ["src/worker.ts"] },
      ],
    },
    prs: [
      {
        number: 22,
        issueId: "ZAK-12",
        state: "open",
        isDraft: true,
        changedFiles: 1,
        footprint: ["src/pr.ts"],
      },
    ],
  });
  assert.equal(output.capacity.used, 0);
  assert.deepEqual(output.decisions.activeDispatches, []);
  assert.ok(!output.actions.some(({ kind }) => kind === "dispatch"));
});

test("a different explicit UUID never claims the candidate through a misleading branch", () => {
  const output = plan({
    linear: { issues: [readyIssue("ZAK-12", { id: trackerUuid })] },
    state: {
      dispatches: [
        {
          issueId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          branch: "feat/zak-12",
          footprint: ["src/other.ts"],
          state: "running",
        },
      ],
    },
    config: { workerConcurrencyCap: 2 },
  });
  assert.ok(output.actions.some(({ kind }) => kind === "dispatch"));
});

test("a worker session UUID in generic id cannot hide its ticket branch", () => {
  const output = plan({
    linear: { issues: [readyIssue("ZAK-12", { id: trackerUuid })] },
    state: {
      dispatches: [
        {
          id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          branch: "codex/zak-12-entry",
          state: "running",
          footprint: ["src/other.ts"],
        },
      ],
    },
    config: { workerConcurrencyCap: 2 },
  });
  assert.ok(!output.actions.some(({ kind }) => kind === "dispatch"));
  assert.ok(
    output.holds.some(
      ({ target, reason }) => target === "ticket:ZAK-12" && reason === "DELIVERY_ALREADY_ACTIVE",
    ),
  );
});

test("reusing a worker receipt UUID for another ticket cannot crash the tick", () => {
  const sessionUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const output = plan({
    linear: { issues: [readyIssue("ZAK-13")] },
    state: {
      dispatches: [
        { id: sessionUuid, issueId: "ZAK-12", state: "completed" },
        { id: sessionUuid, issueId: "ZAK-13", state: "running", footprint: ["src/other.ts"] },
      ],
    },
  });
  assert.equal(output.capacity.used, 1);
  assert.ok(!output.actions.some(({ kind }) => kind === "dispatch"));
  assert.ok(output.holds.some(({ target }) => target === "ticket:ZAK-13"));
});
