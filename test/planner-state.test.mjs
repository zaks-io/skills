import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { recordPlannerState } from "../skills/ziw-orchestrate/scripts/planner-state.mjs";

const script = path.resolve("skills/ziw-orchestrate/scripts/planner-state.mjs");
const repo = "example/app";
const worker = {
  issueKey: "EXA-1",
  sessionId: "S1",
  runId: "W1",
  branch: "agent/exa-1",
  footprint: ["src/a.ts"],
  status: "running",
};
const request = {
  sessionId: "R1",
  headSha: "h1",
  reviewDiffFingerprint: "patch-id:fp1",
  status: "running",
};
const evidence = {
  sessionId: "R1",
  reviewedHeadSha: "h1",
  reviewedDiffFingerprint: "patch-id:fp1",
  reviewVerdict: "APPROVE",
  independentReviewCount: 1,
};

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-state-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "state.json");
  const save = (observation) => recordPlannerState({ file, repo, observation });
  const read = () => JSON.parse(readFileSync(file, "utf8"));
  save();
  return { directory, file, save, read };
}

test("initialization and repeated receipts preserve unrelated workers and reviews", (t) => {
  const { file, save, read } = fixture(t);
  const other = {
    ...worker,
    issueKey: "EXA-2",
    sessionId: "S2",
    runId: "W2",
    branch: "agent/exa-2",
  };
  writeFileSync(
    file,
    JSON.stringify({
      repo,
      dispatches: [other],
      reviewEvidenceByPr: { 99: { reviewVerdict: "APPROVE" } },
    }),
  );
  save({ dispatches: [worker] });
  save({ dispatches: [worker] });
  const before = read();
  save();
  assert.deepEqual(read(), before);
  assert.equal(read().dispatches.length, 2);
  assert.deepEqual(read().dispatches[0], other);
  assert.deepEqual(read().reviewEvidenceByPr[99], { reviewVerdict: "APPROVE" });
});

for (const sessionId of [null, ""]) {
  test(`CLI records observations beside a legacy PR with sessionId ${JSON.stringify(sessionId)}`, (t) => {
    const { file, read } = fixture(t);
    writeFileSync(
      file,
      JSON.stringify({
        repo,
        pullRequests: [{ number: 42, title: "Existing PR", sessionId }],
      }),
    );
    const result = spawnSync(
      process.execPath,
      [script, "--repo", repo, "--state", file, "--record", "-"],
      { input: JSON.stringify({ dispatches: [worker] }), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(read(), {
      repo,
      pullRequests: [{ number: 42, title: "Existing PR" }],
      dispatches: [worker],
    });
  });
}

test("receipts gain session IDs and observations retain issue and footprint", (t) => {
  const { save, read } = fixture(t);
  const { sessionId, ...receipt } = worker;
  save({ dispatches: [{ ...receipt, receiptId: "T1" }] });
  save({
    dispatches: [{ receiptId: "T1", sessionId, runId: "W1", status: "returned", prNumber: 42 }],
  });
  assert.deepEqual(read().dispatches, [
    { ...worker, receiptId: "T1", status: "returned", prNumber: 42 },
  ]);
});

test("replaying a launch receipt does not resurrect its completed run", (t) => {
  const { save, read } = fixture(t);
  save({ dispatches: [worker] });
  save({ dispatches: [{ sessionId: "S1", runId: "W1", status: "returned", prNumber: 42 }] });
  const completed = read();
  save({ dispatches: [worker] });
  assert.deepEqual(read(), completed);
});

test("confirmed follow-up runs clear lifecycle flags and reject older results", (t) => {
  const { file, save, read } = fixture(t);
  writeFileSync(
    file,
    JSON.stringify({ repo, workers: [{ ...worker, status: "returned", returned: true }] }),
  );
  save({
    dispatches: [{ sessionId: "S1", runId: "W2", status: "running", footprint: ["src/b.ts"] }],
  });
  assert.equal(read().workers[0].returned, undefined);
  assert.deepEqual(read().workers[0].footprint, ["src/a.ts", "src/b.ts"]);
  const before = readFileSync(file, "utf8");
  assert.throws(
    () => save({ dispatches: [{ sessionId: "S1", runId: "W1", status: "returned" }] }),
    /superseded/,
  );
  assert.equal(readFileSync(file, "utf8"), before);
});

for (const [name, observation] of [
  ["unknown status", { dispatches: [{ sessionId: "S1", runId: "W1", status: "unknown" }] }],
  ["missing run", { dispatches: [{ sessionId: "S1", status: "returned" }] }],
  [
    "new run before completion",
    { dispatches: [{ sessionId: "S1", runId: "W2", status: "running" }] },
  ],
  ["changed issue", { dispatches: [{ ...worker, issueKey: "EXA-2" }] }],
  ["changed branch", { dispatches: [{ ...worker, branch: "another" }] }],
  ["missing identity", { dispatches: [{ status: "returned" }] }],
  ["missing reservation", { dispatches: [{ sessionId: "S2", status: "running" }] }],
  ["unknown worker field", { dispatches: [{ ...worker, footprit: [] }] }],
  ["lifecycle shortcut", { dispatches: [{ ...worker, occupiesWorkerSlot: false }] }],
  ["policy injection", { mergeAuthority: "agent" }],
])
  test(`invalid observation leaves state unchanged: ${name}`, (t) => {
    const { file, save, directory } = fixture(t);
    save({ dispatches: [worker] });
    const before = readFileSync(file, "utf8");
    assert.throws(() => save(observation));
    assert.equal(readFileSync(file, "utf8"), before);
    assert.deepEqual(readdirSync(directory), ["state.json"]);
  });

test("review result completes its matching request and replay is idempotent", (t) => {
  const { save, read } = fixture(t);
  save({ reviewRequestsByPr: { 42: request, 99: { ...request, sessionId: "R99" } } });
  save({ reviewEvidenceByPr: { 42: evidence } });
  const completed = read();
  assert.equal(completed.reviewRequestsByPr[42].status, "completed");
  assert.equal(completed.reviewEvidenceByPr[42].blockingFindings, false);
  assert.equal(completed.reviewRequestsByPr[99].status, "running");
  save({ reviewEvidenceByPr: { 42: evidence } });
  save({ reviewRequestsByPr: { 42: request } });
  assert.deepEqual(read(), completed);
});

test("new review evidence replaces old blocking flags", (t) => {
  const { save, read } = fixture(t);
  save({ reviewRequestsByPr: { 42: request } });
  save({ reviewEvidenceByPr: { 42: { ...evidence, reviewVerdict: "NEEDS REVISION" } } });
  assert.equal(read().reviewEvidenceByPr[42].blockingFindings, true);
  save({ reviewRequestsByPr: { 42: { ...request, sessionId: "R2" } } });
  save({ reviewEvidenceByPr: { 42: { ...evidence, sessionId: "R2" } } });
  assert.equal(read().reviewEvidenceByPr[42].blockingFindings, false);
});

test("confirmed review failure releases its request without creating approval", (t) => {
  const { save, read } = fixture(t);
  save({ reviewRequestsByPr: { 42: request } });
  save({ reviewRequestsByPr: { 42: { ...request, status: "failed" } } });
  assert.equal(read().reviewRequestsByPr[42].status, "failed");
  assert.equal(read().reviewEvidenceByPr, undefined);
});

for (const [name, observation] of [
  ["duplicate reviewer", { reviewRequestsByPr: { 42: { ...request, sessionId: "R2" } } }],
  ["null review session", { reviewRequestsByPr: { 42: { ...request, sessionId: null } } }],
  ["empty review session", { reviewRequestsByPr: { 42: { ...request, sessionId: "" } } }],
  ["wrong review session", { reviewEvidenceByPr: { 42: { ...evidence, sessionId: "R2" } } }],
  ["wrong review head", { reviewEvidenceByPr: { 42: { ...evidence, reviewedHeadSha: "h2" } } }],
  [
    "wrong review diff",
    { reviewEvidenceByPr: { 42: { ...evidence, reviewedDiffFingerprint: "patch-id:fp2" } } },
  ],
  ["author QA", { reviewEvidenceByPr: { 42: { ...evidence, independentReviewCount: 0 } } }],
  ["missing verdict", { reviewEvidenceByPr: { 42: { reviewedHeadSha: "h1" } } }],
  [
    "contradictory blocker",
    { reviewEvidenceByPr: { 42: { ...evidence, blockingFindings: true } } },
  ],
])
  test(`review update rejects ${name} without a partial write`, (t) => {
    const { save, file } = fixture(t);
    save({ reviewRequestsByPr: { 42: request } });
    const before = readFileSync(file, "utf8");
    assert.throws(() => save({ dispatches: [worker], ...observation }));
    assert.equal(readFileSync(file, "utf8"), before);
  });

test("hosted requests clear stale completion and preserve unrelated PRs", (t) => {
  const { file, save, read } = fixture(t);
  writeFileSync(
    file,
    JSON.stringify({
      repo,
      hostedReviewByPr: { 42: { hostedReviewComplete: true }, 99: { autoReviewMode: "enabled" } },
    }),
  );
  save({
    hostedReviewByPr: {
      42: { hostedReviewPending: true, hostedReviewDiffFingerprint: "patch-id:new" },
    },
  });
  assert.equal(read().hostedReviewByPr[42].hostedReviewComplete, false);
  assert.deepEqual(read().hostedReviewByPr[99], { autoReviewMode: "enabled" });
});

test("scope replacement and default restoration preserve worker reservations", (t) => {
  const { save, read } = fixture(t);
  save({ dispatches: [worker], scopeIssues: [{ issueKey: "EXA-1" }] });
  save({ scopeIssues: null });
  assert.equal(read().scopeIssues, undefined);
  assert.deepEqual(read().dispatches, [worker]);
});

test("another repository, a lock, and a symlink cannot replace existing state", (t) => {
  const { file, save, directory } = fixture(t);
  const before = readFileSync(file, "utf8");
  assert.throws(() => recordPlannerState({ file, repo: "other/app" }), /another repo/);
  writeFileSync(`${file}.lock`, "another writer");
  assert.throws(() => save(), /lock/);
  assert.equal(readFileSync(`${file}.lock`, "utf8"), "another writer");
  const link = path.join(directory, "link.json");
  symlinkSync(file, link);
  assert.throws(() => recordPlannerState({ file: link, repo }), /regular file/);
  assert.equal(readFileSync(file, "utf8"), before);
});

test("CLI accepts stdin, works through a symlink, and does not print invalid input", (t) => {
  const { file, directory } = fixture(t);
  const link = path.join(directory, "planner-state.mjs");
  symlinkSync(script, link);
  const run = (input) =>
    spawnSync(process.execPath, [link, "--repo", repo, "--state", file, "--record", "-"], {
      input,
      encoding: "utf8",
    });
  const good = run(JSON.stringify({ dispatches: [worker] }));
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(readFileSync(file)).dispatches.length, 1);
  const bad = run('{"private-marker-should-not-print":');
  assert.equal(bad.status, 1);
  assert.doesNotMatch(bad.stderr + bad.stdout, /private-marker-should-not-print/);
  assert.match(bad.stderr, /invalid JSON/);
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage:/);
});
