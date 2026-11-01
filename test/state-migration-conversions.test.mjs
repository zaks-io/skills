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
  // beb146d ORed codeRabbitSkipped into hostedReviewSkipped, so false changed nothing.
  assert.deepEqual(state.hostedReviewByPr[12], {
    hostedReviewRequired: true,
    hostedReviewComplete: true,
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
      12: { conformanceVerdict: "PASS", reviewVerdict: "UNKNOWN" },
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

test("a false hosted alias cannot mask a hosted review completed live", (t) => {
  const state = migrate(t, { hostedReviewByPr: { 12: { codeRabbitComplete: false } } });
  assert.deepEqual(state.hostedReviewByPr[12], {});
});

function refusal(t, patch) {
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-conversion-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "state.json");
  writeFileSync(file, JSON.stringify({ v: 2, repo: "example/app", ...patch }));
  let message;
  assert.throws(
    () => migratePlannerState({ file, repo: "example/app", dryRun: true }),
    (error) => {
      message = error.message;
      return true;
    },
  );
  return message;
}

for (const [field, alias, canonicalValue, aliasValue] of [
  ["riskTier", "tier", "high", "low"],
  ["scopeMatches", "diffMatchesScope", false, true],
])
  test(`an evidence ${alias} that disagrees with a saved PR ${field} is refused`, (t) => {
    const message = refusal(t, {
      pullRequests: [{ number: 12, [field]: canonicalValue }],
      reviewEvidenceByPr: { 12: { [alias]: aliasValue } },
    });
    assert.match(message, new RegExp(`PR 12: .*disagree on ${field}`));
  });

test("layers that agree through an alias migrate", (t) => {
  const state = migrate(t, {
    pullRequests: [{ number: 12, riskTier: "high" }],
    reviewEvidenceByPr: { 12: { tier: "high" } },
  });
  assert.equal(state.reviewEvidenceByPr[12].riskTier, "high");
});

test("a later duplicate PR record clears an earlier fingerprint fallback", (t) => {
  const state = migrate(t, {
    pullRequests: [
      { number: 12, reviewRelevantDiffFingerprint: "patch-id:one" },
      { number: 12, reviewRelevantDiffFingerprint: null },
    ],
    reviewDiffByPr: { 12: "patch-id:two" },
  });
  assert.equal(state.reviewDiffByPr[12], "patch-id:two");
  assert.ok(state.pullRequests.every((pr) => !("reviewRelevantDiffFingerprint" in pr)));
});

for (const map of ["hostedReviewByPr", "reviewEvidenceByPr"])
  test(`a ${map} hostedReviewedDiffFingerprint that a live bot review outranked is refused`, (t) => {
    const message = refusal(t, {
      [map]: { 12: { hostedReviewedDiffFingerprint: "patch-id:old" } },
    });
    assert.match(message, new RegExp(`state/${map}/12/hostedReviewedDiffFingerprint`));
  });

test("a hostedReviewedDiffFingerprint on a saved PR record still migrates", (t) => {
  const state = migrate(t, {
    pullRequests: [{ number: 12, hostedReviewedDiffFingerprint: "patch-id:old" }],
  });
  assert.equal(state.pullRequests[0].hostedReviewDiffFingerprint, "patch-id:old");
});

test("a request reviewedReviewDiffFingerprint stays inert because beb146d never read it", (t) => {
  const state = migrate(t, {
    reviewRequestByPr: {
      12: {
        sessionId: "R",
        headSha: "head-old",
        reviewedReviewDiffFingerprint: "patch-id:one",
        status: "running",
      },
    },
  });
  assert.deepEqual(state.reviewRequestsByPr[12], {
    sessionId: "R",
    headSha: "head-old",
    status: "running",
  });
});

for (const [map, hidden] of [
  ["hostedReviewByPr", "unknown"],
  ["reviewEvidenceByPr", null],
])
  test(`a ${map} verdict of ${hidden} that hid a saved PR verdict is refused`, (t) => {
    const message = refusal(t, {
      pullRequests: [{ number: 12, reviewVerdict: "NEEDS REVISION" }],
      [map]: { 12: { reviewVerdict: hidden } },
    });
    assert.match(message, new RegExp(`PR 12: .*unrecognized verdict in state/${map}/12`));
  });

test("evidence outranks hosted when checking for a hidden verdict", (t) => {
  const message = refusal(t, {
    hostedReviewByPr: { 12: { reviewVerdict: "APPROVE" } },
    reviewEvidenceByPr: { 12: { reviewVerdict: "unknown" } },
  });
  assert.match(message, /unrecognized verdict in state\/reviewEvidenceByPr\/12/);
});

test("an unrecognized verdict that a higher layer replaces still migrates", (t) => {
  const state = migrate(t, {
    pullRequests: [{ number: 12, reviewVerdict: "unknown" }],
    reviewEvidenceByPr: { 12: { reviewVerdict: "APPROVE" } },
  });
  assert.equal(state.reviewEvidenceByPr[12].reviewVerdict, "APPROVE");
  assert.equal(state.pullRequests[0].reviewVerdict, undefined);
});

for (const [conformance, head] of [
  ["PASS", "head-old"],
  ["UNVERIFIABLE", "head-1"],
  ["UNVERIFIABLE", undefined],
])
  for (const location of ["pullRequests", "hostedReviewByPr", "reviewEvidenceByPr"])
    test(`${location} ${conformance} conformance ${head ? "with" : "without"} a head is refused`, (t) => {
      const record = { conformance, ...(head ? { conformanceHeadSha: head } : {}) };
      const message = refusal(t, {
        ...(location === "pullRequests"
          ? { pullRequests: [{ number: 12, ...record }] }
          : { [location]: { 12: record } }),
      });
      assert.match(message, /\/conformance: beb146d gated merge/);
    });

test("conformance on requests and checks stays inert because beb146d never read it there", (t) => {
  const failure = { conformance: "FAIL", conformanceVerdict: "PASS", conformanceHeadSha: "head" };
  const state = migrate(t, {
    reviewRequestsByPr: { 12: { sessionId: "R", status: "running", headSha: "head", ...failure } },
    reviewEvidenceChecks: [{ prNumber: 12, reviewVerdict: "APPROVE", ...failure }],
  });
  assert.deepEqual(state.reviewRequestsByPr[12], {
    sessionId: "R",
    status: "running",
    headSha: "head",
  });
  assert.deepEqual(state.reviewEvidenceChecks[0], { prNumber: 12, reviewVerdict: "APPROVE" });
  assert.equal(state.reviewEvidenceByPr?.[12], undefined);
});

test("layers that disagree on conformance are refused", (t) => {
  const message = refusal(t, {
    pullRequests: [{ number: 12, conformance: "FAIL", conformanceHeadSha: "head" }],
    reviewEvidenceByPr: { 12: { conformance: "PASS" } },
  });
  assert.match(message, /\/conformance: beb146d gated merge/);
});
