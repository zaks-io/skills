import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { migratePlannerState } from "../skills/ziw-orchestrate/scripts/planner-state.mjs";

function migrate(t, patch) {
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-conversion-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "state.json");
  writeFileSync(file, JSON.stringify({ v: 2, repo: "example/app", ...patch }));
  return migratePlannerState({ file, repo: "example/app", dryRun: true }).state;
}
for (const field of ["id", "identifier", "issueId", "ticket", "key"])
  test(`legacy issue ${field} and dependency aliases become typed references`, (t) => {
    const state = migrate(t, {
      linearIssues: [
        {
          [field]: "EXA-1",
          url: "https://linear.app/example/issue/EXA-1/title",
          dependencies: ["EXA-2"],
        },
      ],
    });
    assert.equal(state.linearIssues[0].issueKey, "EXA-1");
    assert.deepEqual(state.linearIssues[0].blockedBy, [{ issueKey: "EXA-2" }]);
    assert.equal(state.linearIssues[0][field], undefined);
  });
for (const field of ["fileFootprint", "files", "paths", "packages"])
  test(`canonical ${field} reserves its paths through footprint`, (t) => {
    const state = migrate(t, {
      dispatches: [{ sessionId: "S", issueKey: "EXA-1", [field]: ["src/a"] }],
    });
    assert.deepEqual(state.dispatches[0].footprint, ["src/a"]);
    assert.equal(state.dispatches[0][field], undefined);
  });
for (const field of ["session", "workerSession", "agentSession"])
  test(`legacy ${field} retains a worker's runtime identity`, (t) => {
    const state = migrate(t, { workers: [{ issueId: "EXA-1", [field]: "S", status: "running" }] });
    assert.equal(state.dispatches[0].sessionId, "S");
    assert.equal(state.dispatches[0][field], undefined);
  });
test("canonical ignored claim metadata cannot create new reservations", (t) => {
  const state = migrate(t, {
    linearIssues: [{ issueKey: "EXA-1", workerSession: "ignored", assignedWorker: "ignored" }],
  });
  assert.equal(state.linearIssues[0].activeClaim, undefined);
  assert.equal(state.linearIssues[0].sessionId, undefined);
  assert.equal(state.linearIssues[0].workerSession, undefined);
});
test("worker lists retain baseline source order and explicit sources", (t) => {
  const state = migrate(
    t,
    Object.fromEntries(
      ["dispatches", "ledgerDispatches", "workers", "activeWork"].map((name, index) => [
        name,
        [
          {
            sessionId: `S${index}`,
            issueKey: `EXA-${index + 1}`,
            ...(index === 0 ? { source: "explicit" } : {}),
          },
        ],
      ]),
    ),
  );
  assert.deepEqual(
    state.dispatches.map(({ source }) => source),
    ["explicit", "ledger", "worker-observation", "local-active-work"],
  );
});
for (const alias of [
  "012",
  "sha",
  "codex/exa-1",
  "https://github.com/example/app/pull/12",
  "PR-12",
])
  test(`PR map alias ${alias} resolves using saved PR identity`, (t) => {
    const state = migrate(t, {
      pullRequests: [
        {
          id: "PR-12",
          url: "https://github.com/example/app/pull/12",
          headSha: "sha",
          headRefName: "codex/exa-1",
        },
      ],
      reviewEvidence: {
        [alias]: {
          codeReviewVerdict: "ready_to_merge",
          reviewedReviewDiffFingerprint: "patch-id:x",
          independentReviews: ["R"],
        },
      },
    });
    assert.equal(state.pullRequests[0].number, 12);
    assert.equal(state.pullRequests[0].legacyPrAliases, undefined);
    assert.deepEqual(state.reviewEvidenceByPr[12], {
      reviewVerdict: "APPROVE",
      reviewedDiffFingerprint: "patch-id:x",
      independentReviewCount: 1,
    });
  });
for (const [verdict, expected] of [
  ["approved", "APPROVE"],
  ["ready for pr", "APPROVE"],
  ["ready to merge", "APPROVE"],
  ["ready_to_merge", "APPROVE"],
  ["do not merge", "NEEDS REVISION"],
])
  test(`local verdict ${verdict} retains its baseline meaning`, (t) => {
    assert.equal(
      migrate(t, { reviewEvidenceByPr: { 12: { reviewVerdict: verdict } } }).reviewEvidenceByPr[12]
        .reviewVerdict,
      expected,
    );
  });
test("request coverage aliases normalize while caller-inert fields drop", (t) => {
  const state = migrate(t, {
    reviewRequestByPr: {
      12: {
        sessionId: "R",
        reviewHeadSha: "head",
        reviewedDiffFingerprint: "patch-id:x",
        currentReviewDiffFingerprint: "ignored",
        status: "running",
      },
    },
  });
  assert.deepEqual(state.reviewRequestsByPr[12], {
    sessionId: "R",
    headSha: "head",
    reviewDiffFingerprint: "patch-id:x",
    status: "running",
  });
});
test("hosted policy aliases preserve gates, counts and provider output", (t) => {
  const state = migrate(t, {
    hostedReviewByPr: {
      12: {
        codeRabbitRequired: true,
        codeRabbitComplete: true,
        codeRabbitSkipped: false,
        hostedReviewedDiffFingerprint: "patch-id:x",
        autoReview: "enabled",
        provider: "CodeRabbit",
        tier: "high",
        diffMatchesScope: false,
        humanReviewPrLabel: "needs-human-merge",
        hasHumanReviewPrLabel: true,
        pullRequestLabels: ["risk-schema"],
        unresolvedThreads: 2,
      },
    },
  });
  assert.deepEqual(state.hostedReviewByPr[12], {
    hostedReviewRequired: true,
    hostedReviewComplete: true,
    hostedReviewSkipped: false,
    hostedReviewDiffFingerprint: "patch-id:x",
    autoReviewMode: "enabled",
    hostedReviewProvider: "CodeRabbit",
    riskTier: "high",
    scopeMatches: false,
    humanMergePrLabel: "needs-human-merge",
    humanMergePrLabelApplied: true,
    prLabels: ["risk-schema"],
    unresolvedThreads: 2,
  });
});
test("evidence checks use their own coverage and label semantics", (t) => {
  const state = migrate(t, {
    reviewEvidenceChecks: [
      {
        pr: "PR-12",
        ticket: "EXA-1",
        currentReviewDiffFingerprint: "patch-id:x",
        reviewedReviewDiffFingerprint: "patch-id:x",
        codeReviewVerdict: "APPROVE",
        reviewHeadSha: "ignored",
        evidenceLabel: "review-evidence",
        checksGreen: true,
      },
    ],
  });
  assert.deepEqual(state.reviewEvidenceChecks[0], {
    prNumber: 12,
    issueKey: "EXA-1",
    reviewDiffFingerprint: "patch-id:x",
    reviewedDiffFingerprint: "patch-id:x",
    hasReviewEvidence: true,
    requiredChecksPassed: true,
  });
});
test("provider review states survive local normalization and PASS conformance disappears", (t) => {
  const latestReviews = { bot: { state: "COMMENTED", authorType: "Bot", commitSha: "head" } };
  const state = migrate(t, {
    pullRequests: [{ number: 12, headRefOid: "head", draft: true, latestReviews }],
    reviewEvidenceByPr: {
      12: { conformanceVerdict: "PASS", conformanceHeadSha: "head", reviewVerdict: "UNKNOWN" },
    },
    worktrees: [{ worktree: "/work/app", branch: "codex/exa-1" }],
    previews: [{ id: "preview-1", prId: 12 }],
    startableTickets: [{ id: "EXA-1", downstreamCount: 2, objectiveRank: 1 }],
  });
  assert.deepEqual(state.pullRequests[0].latestReviews, latestReviews);
  assert.equal(state.pullRequests[0].headSha, "head");
  assert.equal(state.pullRequests[0].isDraft, true);
  assert.deepEqual(state.reviewEvidenceByPr[12], {});
  assert.equal(state.worktrees[0].path, "/work/app");
  assert.equal(state.previews[0].previewId, "preview-1");
  assert.equal(state.previews[0].prNumber, 12);
  assert.equal(state.startableTickets[0].unlockCount, 2);
  assert.equal(state.startableTickets[0].priority, 1);
});
