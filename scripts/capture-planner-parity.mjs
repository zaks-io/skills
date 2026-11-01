import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Capture from an isolated baseline checkout before changing consumer semantics.
const baseline = path.resolve(process.argv[2]);
const git = (args) => execFileSync("git", args, { cwd: baseline, encoding: "utf8" });
assert.equal(git(["rev-parse", "HEAD"]).trim(), "beb146d2c69ad501e21d281a3dd99aba7a5a59b1");
// A pinned HEAD proves nothing if the working tree differs from it.
assert.equal(
  git(["status", "--porcelain", "--untracked-files=all"]),
  "",
  "baseline checkout has local changes; capture only from a clean beb146d checkout",
);
const repo = "example/app";
const issue = (key, extra = {}) => ({
  issueKey: key,
  title: `Implement ${key}`,
  url: `https://linear.app/example/issue/${key}/implement`,
  labels: ["kind-slice", "ready-for-agent"],
  state: "Todo",
  stateType: "unstarted",
  footprint: [`src/${key}.mjs`],
  ...extra,
});
const pr = {
  number: 12,
  title: "Implement EXA-1",
  url: "https://github.com/example/app/pull/12",
  headSha: "head-1",
  headRefName: "codex/exa-1-implement",
  baseRefName: "main",
  state: "open",
  isDraft: true,
  changedFiles: 1,
  checks: { state: "SUCCESS" },
  reviewDiffFingerprint: "patch-id:one",
  linkedIssues: [{ issueKey: "EXA-1" }],
};
const evidence = {
  sessionId: "review-1",
  reviewedHeadSha: "head-1",
  reviewedDiffFingerprint: "patch-id:one",
  reviewVerdict: "APPROVE",
  independentReviewCount: 1,
};
const cases = [
  ["dispatch", {}],
  [
    "canonical-live-has-pr",
    {
      dispatches: [
        { issueKey: "EXA-1", receiptId: "task-1", hasPr: true, footprint: ["src/EXA-1.mjs"] },
      ],
    },
  ],
  [
    "legacy-returned-has-pr",
    { dispatches: [{ issueId: "EXA-1", id: "task-1", hasPr: true, files: ["src/EXA-1.mjs"] }] },
  ],
  [
    "legacy-live",
    {
      dispatches: [
        {
          issueId: "EXA-1",
          id: "task-1",
          session: "worker-1",
          status: "running",
          paths: ["src/EXA-1.mjs"],
        },
      ],
    },
  ],
  [
    "mixed-lists",
    {
      dispatches: [{ issueKey: "EXA-1", receiptId: "task-1", hasPr: true }],
      workers: [{ id: "task-2", issueId: "EXA-2", status: "running" }],
      activeWork: [{ issueKey: "EXA-3", receiptId: "task-3", status: "returned" }],
    },
  ],
  [
    "canonical-footprint-claim",
    {
      linearIssues: [
        issue("EXA-1", { footprint: undefined, fileFootprint: ["src/EXA-1.mjs"], claimed: true }),
      ],
    },
  ],
  [
    "legacy-scope",
    {
      scopeIssueIds: ["EXA-2"],
      linearIssues: [
        {
          identifier: "EXA-2",
          title: "Implement EXA-2",
          url: "https://linear.app/example/issue/EXA-2/implement",
          state: "Todo",
          labels: ["kind-slice", "ready-for-agent"],
          files: ["src/EXA-2.mjs"],
          dependencies: ["EXA-1"],
        },
      ],
    },
  ],
  ["review-clean", { reviewEvidenceByPr: { 12: evidence } }, true],
  [
    "review-aliases",
    {
      reviewEvidence: {
        12: {
          ...evidence,
          reviewedDiffFingerprint: undefined,
          reviewedReviewDiffFingerprint: "patch-id:one",
          reviewVerdict: undefined,
          codeReviewVerdict: "Ready to Merge",
        },
      },
    },
    true,
  ],
  [
    "review-blocking",
    {
      reviewEvidenceByPr: {
        12: { ...evidence, reviewVerdict: "NEEDS REVISION", blockingFindings: true },
      },
    },
    true,
  ],
  [
    "review-pending",
    {
      reviewRequestsByPr: {
        12: {
          sessionId: "review-1",
          headSha: "head-1",
          reviewDiffFingerprint: "patch-id:one",
          status: "running",
        },
      },
    },
    true,
  ],
  [
    "request-aliases",
    {
      reviewRequestByPr: {
        12: {
          receiptId: "review-task",
          reviewHeadSha: "head-1",
          reviewRelevantDiffFingerprint: "patch-id:one",
          status: "running",
        },
      },
    },
    true,
  ],
  [
    "request-unused-fingerprint",
    {
      reviewRequestByPr: {
        12: {
          receiptId: "review-task",
          headSha: "head-old",
          reviewedReviewDiffFingerprint: "patch-id:one",
          status: "running",
        },
      },
    },
    true,
  ],
  [
    "review-delta",
    {
      reviewEvidenceByPr: {
        12: { ...evidence, reviewedHeadSha: "head-0", reviewedDiffFingerprint: "patch-id:zero" },
      },
    },
    true,
  ],
  [
    "pr-map-alias",
    {
      pullRequests: [
        { id: "PR-12", url: pr.url, headSha: pr.headSha, headRefName: pr.headRefName },
      ],
      reviewEvidenceByPr: { "head-1": evidence },
    },
    true,
  ],
  [
    "github-derived",
    {},
    true,
    {
      latestReviews: {
        human: {
          authorType: "User",
          state: "APPROVED",
          headSha: "head-1",
          reviewDiffFingerprint: "patch-id:one",
        },
      },
    },
  ],
  [
    "hosted-aliases",
    {
      reviewEvidenceByPr: { 12: evidence },
      hostedReviewByPr: {
        12: {
          codeRabbitRequired: true,
          codeRabbitComplete: true,
          hostedReviewHeadSha: "head-1",
          hostedReviewDiffFingerprint: "patch-id:one",
          autoReview: "enabled",
          provider: "CodeRabbit",
        },
      },
    },
    true,
  ],
  [
    "scope-label-aliases",
    {
      reviewEvidenceByPr: {
        12: {
          ...evidence,
          tier: "high",
          diffMatchesScope: false,
          humanReviewPrLabel: "needs-human-merge",
          hasHumanReviewPrLabel: true,
        },
      },
    },
    true,
  ],
  [
    "check-aliases",
    {
      reviewEvidenceChecks: [
        {
          pr: "PR-12",
          ticket: "EXA-1",
          codeReviewVerdict: "APPROVE",
          evidenceLabel: true,
          currentReviewDiffFingerprint: "patch-id:two",
          reviewedReviewDiffFingerprint: "patch-id:one",
          checksGreen: true,
        },
      ],
    },
    true,
  ],
  [
    "canonical-ignored-claim",
    { linearIssues: [issue("EXA-1", { workerSession: "ignored", assignedWorker: "ignored" })] },
  ],
  [
    "unknown-local-verdict",
    { reviewEvidenceByPr: { 12: { ...evidence, reviewVerdict: "UNKNOWN" } } },
    true,
  ],
  [
    "dispatch-ordering-aliases",
    {
      startableTickets: [
        { issueKey: "EXA-1", footprint: ["src/EXA-1.mjs"], downstreamCount: 1, objectiveRank: 2 },
        { issueKey: "EXA-2", footprint: ["src/EXA-2.mjs"], downstreamCount: 5, objectiveRank: 1 },
      ],
    },
  ],
  [
    "pr-fallback-fingerprint-stale",
    {
      pullRequests: [{ number: 12, reviewRelevantDiffFingerprint: "patch-id:one" }],
      reviewEvidenceByPr: { 12: evidence },
    },
    true,
    { headSha: "head-2", reviewDiffFingerprint: "patch-id:two" },
  ],
  [
    "pr-fallback-fingerprint-only",
    {
      pullRequests: [{ number: 12, reviewRelevantDiffFingerprint: "patch-id:one" }],
      reviewEvidenceByPr: { 12: evidence },
    },
    true,
    { reviewDiffFingerprint: undefined },
  ],
];
const directory = path.resolve("test/fixtures/planner-parity");
mkdirSync(directory, { recursive: true });
// Scratch inputs live outside the fixture directory, which the parity test reads in full.
const scratch = mkdtempSync(path.join(tmpdir(), "ziw-parity-capture-"));
try {
  for (const [name, state, withPr = false, prExtra = {}] of cases) {
    const snapshot = {
      v: 3,
      repo,
      baseline: { branch: "main", headSha: "base-1" },
      worktrees: [],
      prs: withPr ? [{ ...pr, ...prExtra }] : [],
      linear: { issues: [issue("EXA-1"), issue("EXA-2"), issue("EXA-3")] },
    };
    const config = { mergeAuthority: "human", hostedReviewRiskTiers: [], branchPrefix: "codex/" };
    const { branchPrefix, ...oldConfig } = config;
    const input = path.join(scratch, `${name}.input.json`);
    const stateFile = path.join(scratch, `${name}.state.json`);
    writeFileSync(input, JSON.stringify({ snapshot, config: oldConfig }));
    writeFileSync(stateFile, JSON.stringify({ repo, ...state }));
    const output = JSON.parse(
      execFileSync(
        process.execPath,
        [
          path.join(baseline, "skills/ziw-orchestrate/scripts/tick-plan.mjs"),
          input,
          "--state",
          stateFile,
        ],
        { encoding: "utf8" },
      ),
    );
    writeFileSync(
      path.join(directory, `${name}.json`),
      `${JSON.stringify({ baseline: "beb146d2c69ad501e21d281a3dd99aba7a5a59b1", snapshot, config, state: { repo, ...state }, expected: { actions: output.actions, waits: output.waits, holds: output.holds } }, null, 2)}\n`,
    );
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`Captured ${cases.length} baseline planner cases.`);
