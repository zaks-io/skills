import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  migratePlannerState,
  recordPlannerState,
} from "../skills/ziw-orchestrate/scripts/planner-state.mjs";
import { planTick } from "../skills/ziw-orchestrate/scripts/tick-plan.mjs";

const repo = "example/app";
const script = path.resolve("skills/ziw-orchestrate/scripts/planner-state.mjs");
function fixture(t, state = { repo }) {
  const directory = fs.mkdtempSync(path.join(tmpdir(), "ziw-migration-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "state.json");
  const bytes = ` ${JSON.stringify(state)}\n`;
  fs.writeFileSync(file, bytes);
  return {
    file,
    bytes,
    backup: `${file}.pre-v3.json`,
    migrate: (options = {}) => migratePlannerState({ file, repo, ...options }),
  };
}
// beb146d dispatch actions predate the selected footprint. The named correction below
// also preserves live draft status instead of a legacy adapter's invented false default.
const decisions = ({ actions, waits, holds }) => ({
  actions: actions.map(({ footprint, ...action }) =>
    action.kind === "dispatch" ? action : { ...action, ...(footprint ? { footprint } : {}) },
  ),
  waits,
  holds,
});
for (const name of fs
  .readdirSync("test/fixtures/planner-parity")
  .filter((name) => name.endsWith(".json"))) {
  test(`beb146d parity: ${name}`, (t) => {
    const input = JSON.parse(
      fs.readFileSync(path.join("test/fixtures/planner-parity", name), "utf8"),
    );
    assert.equal(input.baseline, "beb146d2c69ad501e21d281a3dd99aba7a5a59b1");
    const { migrate } = fixture(t, input.state);
    const state = migrate().state;
    const expected = ["pr-map-alias.json", "pr-fallback-fingerprint-only.json"].includes(name)
      ? {
          ...input.expected,
          // A partial saved PR cannot make the live draft merge-ready. Keep the
          // captured baseline fixtures unchanged and correct only that decision.
          actions: [
            ...input.expected.actions.filter((action) => action.kind === "dispatch"),
            {
              target: "pr:12",
              kind: "mark-ready",
              owner: "orchestrator",
              reason: "REVIEW_CLEAN",
            },
          ],
        }
      : input.expected;
    assert.deepEqual(decisions(planTick({ ...input, state })), expected);
  });
}

test("migration preserves original backup bytes, marks canonical state, and is idempotent", (t) => {
  const original = {
    repo,
    dispatches: [
      { issueKey: "EXA-1", sessionId: "S", hasPr: true, runId: "W2", previousRunIds: ["W1"] },
    ],
    reviewRequestsByPr: {
      12: {
        sessionId: "R2",
        previousRequests: [{ sessionId: "R1", receiptId: "T1" }],
        headSha: "head",
        reviewDiffFingerprint: "patch-id:x",
        status: "running",
      },
    },
  };
  const { file, bytes, backup, migrate } = fixture(t, original);
  const first = migrate();
  assert.equal(first.state.v, 3);
  assert.equal(first.state.dispatches[0].hasPr, undefined);
  assert.equal(first.state.dispatches[0].returned, undefined);
  assert.deepEqual(first.state.dispatches[0].previousRunIds, ["W1"]);
  assert.deepEqual(
    first.state.reviewRequestsByPr[12].previousRequests,
    original.reviewRequestsByPr[12].previousRequests,
  );
  assert.equal(fs.readFileSync(backup, "utf8"), bytes);
  const migrated = fs.readFileSync(file, "utf8");
  assert.equal(migrate().alreadyV3, true);
  assert.equal(fs.readFileSync(file, "utf8"), migrated);
  assert.equal(fs.readFileSync(backup, "utf8"), bytes);
});

test("dry run returns converted JSON and writes nothing", (t) => {
  const { file, bytes, backup, migrate } = fixture(t);
  assert.equal(migrate({ dryRun: true }).state.v, 3);
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
  assert.equal(fs.existsSync(backup), false);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ["state.json"]);
});

for (const [name, state, pattern] of [
  [
    "conflicting receipt",
    { dispatches: [{ id: "old", receiptId: "different", issueId: "EXA-1", state: "running" }] },
    /state\/dispatches\/0\/id/,
  ],
  [
    "conflicting issue",
    { dispatches: [{ id: "task", issueId: "EXA-1", ticket: "EXA-2", state: "running" }] },
    /state\/dispatches\/0/,
  ],
  [
    "ambiguous PR alias",
    {
      pullRequests: [
        { number: 12, headSha: "same" },
        { number: 13, headSha: "same" },
      ],
      reviewEvidenceByPr: { same: { reviewVerdict: "APPROVE" } },
    },
    /state\/reviewEvidenceByPr\/same/,
  ],
  [
    "contradictory evidence",
    {
      reviewEvidenceByPr: { 12: { reviewVerdict: "APPROVE", codeReviewVerdict: "NEEDS REVISION" } },
    },
    /state\/reviewEvidenceByPr\/12/,
  ],
  [
    "conflicting session",
    { workers: [{ issueId: "EXA-1", sessionId: "one", session: "two" }] },
    /state\/workers\/0\/session/,
  ],
  [
    "conflicting PR number",
    { workers: [{ issueId: "EXA-1", sessionId: "S", prNumber: 12, prId: 13 }] },
    /state\/workers\/0\/prId/,
  ],
  [
    "conflicting scope with alias first",
    { scopeIssueIds: ["EXA-1"], scopeIssues: [{ issueKey: "EXA-2" }] },
    /state\/scopeIssueIds/,
  ],
  [
    "conflicting scope with canonical first",
    { scopeIssues: [{ issueKey: "EXA-2" }], scopeIssueIds: ["EXA-1"] },
    /state\/scopeIssueIds/,
  ],
  [
    "mixed maps",
    {
      reviewEvidenceByPr: { 12: { reviewVerdict: "APPROVE" } },
      reviewEvidence: { 13: { reviewVerdict: "APPROVE" } },
    },
    /caller-dependent/,
  ],
  [
    "missing conformance head",
    { reviewEvidenceByPr: { 12: { conformance: "FAIL" } } },
    /state\/reviewEvidenceByPr\/12\/conformance/,
  ],
])
  test(`refusal preserves bytes and writes no backup: ${name}`, (t) => {
    const { file, bytes, backup, migrate } = fixture(t, { repo, ...state });
    assert.throws(migrate, pattern);
    assert.equal(fs.readFileSync(file, "utf8"), bytes);
    assert.equal(fs.existsSync(backup), false);
  });

test("anonymous live records aggregate all paths and operator recovery choices", (t) => {
  const { file, bytes, backup, migrate } = fixture(t, {
    repo,
    dispatches: [
      { issueId: "EXA-1", branch: "codex/exa-1", footprint: ["src/a.mjs"], status: "running" },
    ],
    workers: [{ issueId: "EXA-2", status: "running" }],
  });
  assert.throws(migrate, (error) => {
    for (const pattern of [
      /state\/dispatches\/0/,
      /state\/workers\/0/,
      /EXA-1/,
      /codex\/exa-1/,
      /src\/a.mjs/,
      /recover its runtime identity/,
      /confirm the worker or review has ended/,
    ])
      assert.match(error.message, pattern);
    return true;
  });
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
  assert.equal(fs.existsSync(backup), false);
});

test("a legacy worktree that reserves a ticket by issue reference is refused, not freed", (t) => {
  const { file, bytes, backup, migrate } = fixture(t, {
    repo,
    worktrees: [
      {
        worktree: "/tmp/existing",
        issueId: "EXA-1",
        branch: "work-in-progress",
        footprint: ["src/other.mjs"],
      },
      { worktree: "/tmp/unlinked", branch: "codex/unlinked", footprint: ["src/free.mjs"] },
    ],
  });
  assert.throws(migrate, (error) => {
    assert.match(error.message, /state\/worktrees\/0: worktree reserves EXA-1 by issue reference/);
    assert.doesNotMatch(error.message, /state\/worktrees\/1/);
    return true;
  });
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
  assert.equal(fs.existsSync(backup), false);
});

for (const conformance of ["FAIL", "FAILED", "UNVERIFIABLE"])
  test(`${conformance} migrates to a blocking review`, (t) => {
    const { migrate } = fixture(t, {
      repo,
      reviewEvidenceByPr: {
        12: {
          conformance,
          conformanceHeadSha: "head",
          reviewVerdict: "APPROVE",
          independentReviewCount: 1,
        },
      },
    });
    const state = migrate().state;
    const plan = planTick({
      snapshot: {
        v: 3,
        repo,
        linear: { issues: [] },
        prs: [{ number: 12, headSha: "head", changedFiles: 1, checks: { state: "SUCCESS" } }],
      },
      config: { hostedReviewRiskTiers: [] },
      state,
    });
    assert.ok(plan.actions.some((action) => action.kind === "route-fix"));
  });

test("a conformance failure on a PR survives a clean review map overlay", (t) => {
  const { migrate } = fixture(t, {
    repo,
    pullRequests: [
      { number: 12, headSha: "head", conformance: "FAIL", conformanceHeadSha: "head" },
    ],
    reviewEvidenceByPr: {
      12: {
        sessionId: "R",
        reviewedHeadSha: "head",
        reviewVerdict: "APPROVE",
        blockingFindings: false,
        independentReviewCount: 1,
      },
    },
  });
  const state = migrate().state;
  assert.equal(state.reviewEvidenceByPr[12].sessionId, "R");
  const plan = planTick({
    snapshot: {
      v: 3,
      repo,
      linear: { issues: [] },
      prs: [
        {
          number: 12,
          headSha: "head",
          changedFiles: 1,
          checks: { state: "SUCCESS" },
        },
      ],
    },
    config: { hostedReviewRiskTiers: [] },
    state,
  });
  assert.ok(plan.actions.some((action) => action.kind === "route-fix"));
});

for (const backupKind of ["identical", "conflicting", "symlink", "directory"])
  test(`existing backup: ${backupKind}`, (t) => {
    const { file, bytes, backup, migrate } = fixture(t);
    if (backupKind === "symlink") fs.symlinkSync(file, backup);
    else if (backupKind === "directory") fs.mkdirSync(backup);
    else fs.writeFileSync(backup, backupKind === "identical" ? bytes : "different");
    if (backupKind === "identical") assert.equal(migrate().state.v, 3);
    else {
      assert.throws(migrate, /backup/);
      assert.equal(fs.readFileSync(file, "utf8"), bytes);
    }
  });

for (const operation of ["writeFileSync", "renameSync"])
  test(`${operation} failure leaves original state and supports retry after backup`, (t) => {
    const { file, bytes, backup, migrate } = fixture(t);
    const original = fs[operation];
    fs[operation] = (...args) => {
      if (operation === "renameSync" || (typeof args[0] === "number" && fs.existsSync(backup)))
        throw new Error("simulated write failure");
      return original(...args);
    };
    syncBuiltinESMExports();
    try {
      assert.throws(migrate, /simulated/);
    } finally {
      fs[operation] = original;
      syncBuiltinESMExports();
    }
    assert.equal(fs.readFileSync(file, "utf8"), bytes);
    // A partially flushed backup is deliberately never overwritten.
    if (operation === "renameSync") assert.equal(migrate().state.v, 3);
  });

test("repo mismatch and locked state refuse before publication", (t) => {
  const { file, bytes, backup, migrate } = fixture(t, { repo: "other/repo" });
  assert.throws(migrate, /another repo/);
  fs.writeFileSync(`${file}.lock`, "");
  assert.throws(migrate, /cannot lock state/);
  assert.throws(() => recordPlannerState({ file, repo }), /cannot lock state/);
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
  assert.equal(fs.existsSync(backup), false);
});

test("already-v3 CLI validates and writes nothing", (t) => {
  const { file, bytes, backup } = fixture(t, { v: 3, repo });
  const result = spawnSync(process.execPath, [script, "migrate", "--repo", repo, "--state", file], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "already v3\n");
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
  assert.equal(fs.existsSync(backup), false);
});

test("unrepresentable worktree and preview entries refuse together with their context", (t) => {
  const { file, bytes, backup, migrate } = fixture(t, {
    repo,
    worktrees: [{ branch: "codex/branch-only", footprint: ["src/tree.mjs"] }],
    previews: [{ active: true }],
  });
  assert.throws(migrate, (error) => {
    for (const pattern of [
      /state\/worktrees\/0\/path/,
      /codex\/branch-only/,
      /src\/tree.mjs/,
      /state\/previews\/0/,
    ])
      assert.match(error.message, pattern);
    return true;
  });
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
  assert.equal(fs.existsSync(backup), false);
});
