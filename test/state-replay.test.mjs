import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { recordPlannerState } from "../skills/ziw-orchestrate/scripts/planner-state.mjs";

const repo = "example/app";
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

function fixture(t, initial = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-replay-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "state.json");
  const input = path.join(directory, "input.json");
  writeFileSync(file, JSON.stringify({ repo, ...initial }));
  const save = (observation) => recordPlannerState({ file, repo, observation });
  const read = () => JSON.parse(readFileSync(file));
  const plan = (headSha = "h1", fingerprint = "patch-id:fp1") => {
    writeFileSync(
      input,
      JSON.stringify({
        snapshot: {
          v: 3,
          repo,
          worktrees: [],
          linear: { issues: [] },
          prs: [42, 98, 99].map((number) => ({
            number,
            state: "open",
            isDraft: true,
            headSha,
            reviewDiffFingerprint: fingerprint,
            changedFiles: 1,
            checks: { state: "SUCCESS", failed: [], pending: [] },
          })),
        },
        config: { mergeAuthority: "human", hostedReviewRiskTiers: [] },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [path.resolve("skills/ziw-orchestrate/scripts/tick-plan.mjs"), input, "--state", file],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { file, save, read, plan };
}

test("old approval replay cannot replace a newer blocking verdict", (t) => {
  const { file, save, plan } = fixture(t);
  save({ reviewRequestsByPr: { 42: request } });
  save({ reviewEvidenceByPr: { 42: evidence } });
  save({ reviewRequestsByPr: { 42: { ...request, sessionId: "R2" } } });
  save({
    reviewEvidenceByPr: { 42: { ...evidence, sessionId: "R2", reviewVerdict: "NEEDS REVISION" } },
  });
  const before = readFileSync(file, "utf8");
  assert.throws(() => save({ reviewRequestsByPr: { 42: request } }), /superseded/);
  assert.throws(() => save({ reviewEvidenceByPr: { 42: evidence } }), /superseded/);
  assert.equal(readFileSync(file, "utf8"), before);
  const action = plan().actions.find((entry) => entry.target === "pr:42");
  assert.equal(action.kind, "route-fix");
});

test("old launch replay cannot replace a pending review of a newer diff", (t) => {
  const { file, save, plan } = fixture(t);
  save({ reviewRequestsByPr: { 42: request } });
  save({
    reviewRequestsByPr: {
      42: { ...request, sessionId: "R2", headSha: "h2", reviewDiffFingerprint: "patch-id:fp2" },
    },
  });
  const before = readFileSync(file, "utf8");
  assert.throws(() => save({ reviewRequestsByPr: { 42: request } }), /superseded/);
  assert.equal(readFileSync(file, "utf8"), before);
  const result = plan("h2", "patch-id:fp2");
  assert.equal(
    result.actions.some((entry) => entry.target === "pr:42" && entry.kind === "request-review"),
    false,
  );
  assert.equal(
    result.waits.some((entry) => entry.target === "pr:42" && entry.reason === "REVIEW_IN_FLIGHT"),
    true,
  );
});

test("legacy review aliases retain unrelated pending reviews and approvals", (t) => {
  const { save, read, plan } = fixture(t, {
    reviewRequestByPr: { 99: { ...request, sessionId: "R99" } },
    reviewEvidence: { 98: { ...evidence, sessionId: "R98" } },
  });
  const before = plan();
  save({ reviewRequestsByPr: { 42: request } });
  save({ reviewEvidenceByPr: { 42: evidence } });
  const after = plan();
  for (const target of ["pr:98", "pr:99"]) {
    assert.deepEqual(
      after.actions.filter((entry) => entry.target === target),
      before.actions.filter((entry) => entry.target === target),
    );
    assert.deepEqual(
      after.waits.filter((entry) => entry.target === target),
      before.waits.filter((entry) => entry.target === target),
    );
  }
  assert.equal(read().reviewRequestByPr, undefined);
  assert.equal(read().reviewEvidence, undefined);
  assert.equal(read().reviewRequestsByPr[99].sessionId, "R99");
  assert.equal(read().reviewEvidenceByPr[98].sessionId, "R98");
});

test("conflicting alias and canonical records are never silently overwritten", (t) => {
  const { file, save } = fixture(t, {
    reviewRequestByPr: { 42: request },
    reviewRequestsByPr: { 42: { ...request, sessionId: "different" } },
  });
  const before = readFileSync(file, "utf8");
  assert.throws(() => save(), /conflicting entries/);
  assert.equal(readFileSync(file, "utf8"), before);
});

test("an older identity-less pending review accepts verified enrichment and its result", (t) => {
  const { save, read, plan } = fixture(t, {
    reviewRequestsByPr: {
      42: { reviewDiffFingerprint: "patch-id:fp1", status: "running" },
    },
  });
  save({ reviewRequestsByPr: { 42: request } });
  save({ reviewEvidenceByPr: { 42: evidence } });
  assert.equal(read().reviewRequestsByPr[42].status, "completed");
  assert.equal(plan().actions.find((entry) => entry.target === "pr:42").kind, "mark-ready");
});

test("legacy enrichment cannot replace a known head or session", (t) => {
  for (const extra of [{ headSha: "other-head" }, { sessionId: "known-session" }]) {
    const { file, save } = fixture(t, {
      reviewRequestsByPr: {
        42: { reviewDiffFingerprint: "patch-id:fp1", status: "running", ...extra },
      },
    });
    const before = readFileSync(file, "utf8");
    assert.throws(() => save({ reviewRequestsByPr: { 42: request } }));
    assert.equal(readFileSync(file, "utf8"), before);
  }
});

test("superseded worker launches and results cannot replace a newer completed run", (t) => {
  const { file, save, read } = fixture(t);
  const worker = {
    issueKey: "EXA-1",
    sessionId: "S1",
    runId: "W1",
    branch: "agent/exa-1",
    footprint: ["src/a.ts"],
    status: "running",
  };
  save({ dispatches: [worker] });
  save({ dispatches: [{ sessionId: "S1", runId: "W1", status: "returned", headSha: "h1" }] });
  save({ dispatches: [{ sessionId: "S1", runId: "W2", status: "running" }] });
  save({ dispatches: [{ sessionId: "S1", runId: "W2", status: "returned", headSha: "h2" }] });
  const before = readFileSync(file, "utf8");
  assert.deepEqual(read().dispatches[0].previousRunIds, ["W1"]);
  assert.throws(() => save({ dispatches: [worker] }), /superseded/);
  assert.throws(
    () =>
      save({ dispatches: [{ sessionId: "S1", runId: "W1", status: "returned", headSha: "h1" }] }),
    /superseded/,
  );
  assert.equal(readFileSync(file, "utf8"), before);
});

test("the supported state lifecycle field still protects an active worker run", (t) => {
  const { file, save, read } = fixture(t, {
    dispatches: [
      {
        issueKey: "EXA-1",
        sessionId: "S1",
        runId: "W2",
        state: "running",
        branch: "agent/exa-1",
        footprint: ["src/a.ts"],
      },
    ],
  });
  const before = readFileSync(file, "utf8");
  assert.throws(
    () => save({ dispatches: [{ sessionId: "S1", runId: "W1", status: "running" }] }),
    /saved run/,
  );
  assert.equal(readFileSync(file, "utf8"), before);
  save({
    dispatches: [{ sessionId: "S1", runId: "W2", status: "running", footprint: ["src/b.ts"] }],
  });
  assert.equal(read().dispatches[0].status, "running");
  assert.deepEqual(read().dispatches[0].footprint, ["src/a.ts", "src/b.ts"]);
});

for (const learnedAt of ["request", "result", "completed-request"]) {
  test(`review identities learned at ${learnedAt} survive partial observations and supersession`, (t) => {
    const { file, save, read, plan } = fixture(t);
    const { sessionId, ...receiptRequest } = request;
    receiptRequest.receiptId = "T1";
    const { sessionId: ignored, ...receiptEvidence } = evidence;
    receiptEvidence.receiptId = "T1";
    save({ reviewRequestsByPr: { 42: receiptRequest } });
    if (learnedAt === "request") {
      save({ reviewRequestsByPr: { 42: { ...request, receiptId: "T1" } } });
      save({ reviewRequestsByPr: { 42: request } });
      save({ reviewEvidenceByPr: { 42: evidence } });
    } else {
      save({
        reviewEvidenceByPr: {
          42: { ...receiptEvidence, ...(learnedAt === "result" ? { sessionId } : {}) },
        },
      });
      if (learnedAt === "completed-request")
        save({ reviewRequestsByPr: { 42: { ...request, receiptId: "T1" } } });
    }
    assert.equal(read().reviewRequestsByPr[42].sessionId, "R1");
    assert.equal(read().reviewRequestsByPr[42].receiptId, "T1");
    save({ reviewEvidenceByPr: { 42: receiptEvidence } });
    save({ reviewEvidenceByPr: { 42: evidence } });
    save({ reviewRequestsByPr: { 42: { ...request, sessionId: "R2" } } });
    save({
      reviewEvidenceByPr: { 42: { ...evidence, sessionId: "R2", reviewVerdict: "NEEDS REVISION" } },
    });
    const before = readFileSync(file, "utf8");
    for (const old of [receiptRequest, request])
      assert.throws(() => save({ reviewRequestsByPr: { 42: old } }), /superseded/);
    for (const old of [receiptEvidence, evidence])
      assert.throws(() => save({ reviewEvidenceByPr: { 42: old } }), /superseded/);
    assert.equal(readFileSync(file, "utf8"), before);
    assert.equal(plan().actions.find((entry) => entry.target === "pr:42").kind, "route-fix");
  });
}

test("a completed worker retains an identifier learned from a replayed launch", (t) => {
  const { file, save, read, plan } = fixture(t);
  const worker = {
    issueKey: "EXA-1",
    sessionId: "S1",
    runId: "W1",
    branch: "agent/exa-1",
    footprint: ["src/a.ts"],
    status: "running",
  };
  save({ dispatches: [worker] });
  save({ dispatches: [{ sessionId: "S1", runId: "W1", status: "returned" }] });
  save({ dispatches: [{ ...worker, receiptId: "T1" }] });
  assert.equal(read().dispatches[0].status, "returned");
  assert.equal(read().dispatches[0].receiptId, "T1");
  save({ dispatches: [{ sessionId: "S1", runId: "W2", status: "running" }] });
  save({ dispatches: [{ sessionId: "S1", runId: "W2", status: "returned" }] });
  const before = readFileSync(file, "utf8");
  const { sessionId, ...oldReceipt } = worker;
  assert.throws(() => save({ dispatches: [{ ...oldReceipt, receiptId: "T1" }] }), /superseded/);
  assert.equal(readFileSync(file, "utf8"), before);
  assert.equal(read().dispatches.length, 1);
  assert.equal(plan().capacity.used, 0);
});
