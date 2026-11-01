import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const scripts = path.resolve("skills/ziw-orchestrate/scripts");
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-typed-resume-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const state = path.join(dir, "state.json");
  const snapshot = {
    v: 3,
    repo: "example/app",
    prs: [],
    linear: {
      issues: [1, 2].map((number) => ({
        issueKey: `EXA-${number}`,
        title: `Fix search ${number}`,
        state: "Todo",
        stateType: "unstarted",
        labels: ["kind-slice", "ready-for-agent", "risk-normal"],
        footprint: [`src/search-${number}.ts`],
        updatedAt: "2026-11-01T00:00:00Z",
      })),
    },
  };
  const command = (args) =>
    spawnSync(
      process.execPath,
      [path.join(scripts, "planner-state.mjs"), ...args, "--repo", "example/app", "--state", state],
      { encoding: "utf8" },
    );
  const success = (args) => {
    const result = command(args);
    assert.equal(result.status, 0, result.stderr);
    return result;
  };
  success(["init", "--scope", "EXA-1", "--worker-cap", "1"]);
  const read = () => JSON.parse(readFileSync(state, "utf8"));
  const plan = () => {
    const input = path.join(dir, "input.json");
    writeFileSync(
      input,
      JSON.stringify({
        snapshot,
        config: {
          readyState: "Todo",
          workerConcurrencyCap: 2,
          mergeAuthority: "human",
          hostedReviewRiskTiers: [],
        },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [path.join(scripts, "tick-plan.mjs"), input, "--state", state],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { state, snapshot, read, plan, command, success };
}
const launch = [
  "worker",
  "--issue",
  "EXA-1",
  "--branch",
  "actual/fix-search",
  "--footprint",
  "src/search-1.ts",
  "--session",
  "S1",
  "--run",
  "W1",
  "--status",
  "running",
];
const returned = [
  "worker",
  "--session",
  "S1",
  "--run",
  "W1",
  "--status",
  "returned",
  "--pr",
  "42",
  "--head",
  "h1",
  "--pr-url",
  "https://github.com/example/app/pull/42",
];
const review = [
  "review-request",
  "--pr",
  "42",
  "--session",
  "R1",
  "--head",
  "h1",
  "--fingerprint",
  "patch-id:fp1",
];

test("typed commands resume selected delivery and review in fresh processes", (t) => {
  const f = fixture(t);
  assert.equal(f.plan().actions[0].target, "ticket:EXA-1");
  f.success([...launch, "--worktree", "/tmp/actual-search"]);
  f.snapshot.linear.issues[0].state = "In Progress";
  assert.ok(!f.plan().actions.some((action) => action.kind === "dispatch"));
  f.success(returned);
  assert.deepEqual(f.read().scopeIssues, [{ issueKey: "EXA-1" }]);
  assert.equal(f.read().workerLimit, 1);
  assert.equal(f.read().dispatches[0].branch, "actual/fix-search");
  assert.equal(f.read().dispatches[0].worktree, "/tmp/actual-search");
  f.snapshot.prs = [
    {
      number: 42,
      issueKey: "EXA-1",
      state: "open",
      isDraft: true,
      headSha: "h1",
      reviewDiffFingerprint: "patch-id:fp1",
      changedFiles: 1,
      checks: { state: "SUCCESS", failed: [], pending: [] },
    },
  ];
  assert.ok(f.plan().actions.some((action) => action.kind === "request-review"));
  f.success(review);
  assert.ok(!f.plan().actions.some((action) => action.kind === "request-review"));
  f.success([
    "review-result",
    "--pr",
    "42",
    "--session",
    "R1",
    "--verdict",
    "APPROVE",
    "--count",
    "1",
  ]);
  assert.equal(f.read().reviewRequestsByPr[42].status, "completed");
  assert.equal(f.plan().actions[0].kind, "mark-ready");
  assert.deepEqual(f.read().dispatches[0].footprint, ["src/search-1.ts"]);
  assert.equal(f.read().actionRecords, undefined);
});

test("init can restore default scope and cap without losing a worker", (t) => {
  const f = fixture(t);
  f.success(launch);
  f.success(["init", "--scope", "default", "--worker-cap", "default"]);
  assert.equal(f.read().scopeIssues, undefined);
  assert.equal(f.read().workerLimit, undefined);
  assert.equal(f.read().dispatches[0].sessionId, "S1");
  assert.equal(f.plan().capacity.cap, 2);
});

test("returned workers require a confirmed PR, head and matching repository URL", (t) => {
  const f = fixture(t);
  f.success(launch);
  const before = readFileSync(f.state, "utf8");
  for (const flags of [
    ["--head", "h1", "--pr-url", "https://github.com/example/app/pull/42"],
    ["--pr", "42", "--pr-url", "https://github.com/example/app/pull/42"],
    ["--pr", "42", "--head", "h1"],
    ["--pr", "42", "--head", "h1", "--pr-url", "https://github.com/other/app/pull/42"],
    ["--pr", "42", "--head", "h1", "--pr-url", "https://github.com/example/app/pull/43"],
  ]) {
    const result = f.command([
      "worker",
      "--session",
      "S1",
      "--run",
      "W1",
      "--status",
      "returned",
      ...flags,
    ]);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(readFileSync(f.state, "utf8"), before);
  }
  f.success(returned);
});

test("typed preparation records the confirmed ticket revision and owner", (t) => {
  const f = fixture(t);
  const issue = f.snapshot.linear.issues[0];
  issue.state = "Backlog";
  issue.labels = ["kind-slice", "needs-info"];
  f.success([
    "preparation",
    "--issue",
    "EXA-1",
    "--outcome",
    "needs-human",
    "--reason",
    "Which search behavior?",
    "--updated-at",
    issue.updatedAt,
  ]);
  assert.equal(f.read().preparations[0].outcome, "needs-human");
  assert.equal(f.plan().holds[0].reason, "HUMAN_DECISION_REQUIRED");
  const before = readFileSync(f.state, "utf8");
  const invalid = f.command([
    "preparation",
    "--issue",
    "EXA-1",
    "--outcome",
    "ready",
    "--updated-at",
    issue.updatedAt,
  ]);
  assert.equal(invalid.status, 1);
  assert.equal(readFileSync(f.state, "utf8"), before);
});

test("typed merge results require tracker reconciliation on success and allow failed checks to be retried", (t) => {
  const f = fixture(t);
  const flags = [
    "merge-result",
    "--pr",
    "42",
    "--head",
    "h1",
    "--merge-commit",
    "m1",
    "--issue",
    "EXA-1",
  ];
  const before = readFileSync(f.state, "utf8");
  assert.equal(f.command([...flags, "--check", "passed"]).status, 1);
  assert.equal(readFileSync(f.state, "utf8"), before);
  f.success([...flags, "--check", "failed"]);
  assert.equal(f.read().mergeResultsByPr[42].postMergeCheck, "failed");
  f.success([...flags, "--check", "passed", "--tracker-updated-at", "2026-11-01T12:00:00Z"]);
  assert.equal(f.read().mergeResultsByPr[42].postMergeCheck, "passed");
  assert.equal(f.read().mergeResultsByPr[42].trackerUpdatedAt, "2026-11-01T12:00:00Z");
});

test("review retries reject stale reviewer reports without partially changing state", (t) => {
  const f = fixture(t);
  f.success(review);
  f.success(["review-request", "--pr", "42", "--session", "R1", "--status", "failed"]);
  f.success([
    "review-request",
    "--pr",
    "42",
    "--session",
    "R2",
    "--head",
    "h1",
    "--fingerprint",
    "patch-id:fp1",
  ]);
  const before = readFileSync(f.state, "utf8");
  const stale = f.command([
    "review-result",
    "--pr",
    "42",
    "--session",
    "R1",
    "--verdict",
    "APPROVE",
    "--count",
    "1",
  ]);
  assert.equal(stale.status, 1);
  assert.equal(readFileSync(f.state, "utf8"), before);
  f.success([
    "review-result",
    "--pr",
    "42",
    "--session",
    "R2",
    "--verdict",
    "APPROVE",
    "--count",
    "1",
  ]);
});
