import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateCanonicalState } from "../skills/ziw-orchestrate/scripts/planner-input-validator.mjs";

const scripts = path.resolve("skills/ziw-orchestrate/scripts");
const repo = "example/app";
const pr = {
  id: "PR-42",
  sessionId: null,
  url: "https://github.com/example/app/pull/42",
  headSha: "h1",
  headRefName: "agent/example",
  reviewDiffFingerprint: "patch-id:fp1",
  isDraft: true,
  changedFiles: 1,
  checks: { state: "SUCCESS", failed: [], pending: [] },
};
const request = {
  sessionId: "R1",
  status: "running",
  headSha: "h1",
  reviewDiffFingerprint: "patch-id:fp1",
};
const evidence = {
  sessionId: "R1",
  reviewedHeadSha: "h1",
  reviewedDiffFingerprint: "patch-id:fp1",
  reviewVerdict: "APPROVE",
  independentReviewCount: 1,
};

function fixture(t, state) {
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-legacy-state-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "state.json");
  const input = path.join(directory, "input.json");
  writeFileSync(file, JSON.stringify({ repo, ...state }));
  writeFileSync(
    input,
    JSON.stringify({
      snapshot: { v: 3, repo, prs: [], worktrees: [], linear: { issues: [] } },
      config: { mergeAuthority: "human", hostedReviewRiskTiers: [] },
    }),
  );
  const record = (observation) =>
    spawnSync(
      process.execPath,
      [
        path.join(scripts, "planner-state.mjs"),
        "--repo",
        repo,
        "--state",
        file,
        ...(observation ? ["--record", "-"] : []),
      ],
      { encoding: "utf8", input: observation ? JSON.stringify(observation) : undefined },
    );
  const read = () => JSON.parse(readFileSync(file));
  const plan = () => {
    const result = spawnSync(
      process.execPath,
      [path.join(scripts, "tick-plan.mjs"), input, "--state", file],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { file, record, read, plan };
}

test("the recorder accepts a PR identified only by a legacy ID", (t) => {
  const { record, read } = fixture(t, {
    pullRequests: [{ id: "PR-42", sessionId: null }],
  });
  const result = record({ scopeIssues: null });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(validateCanonicalState(read()), true);
  assert.equal(read().pullRequests[0].number, 42);
});

for (const alias of [pr.id, pr.url, pr.headSha, pr.headRefName]) {
  test(`legacy PR recovery preserves review evidence keyed by ${alias}`, (t) => {
    const otherEvidence = { ...evidence, sessionId: "R99", reviewVerdict: "NEEDS REVISION" };
    const hosted = { hostedReviewPending: true, hostedReviewDiffFingerprint: "patch-id:fp1" };
    const { record, read, plan } = fixture(t, {
      pullRequests: [
        pr,
        {
          ...pr,
          id: "PR-99",
          url: "https://github.com/example/app/pull/99",
          headSha: "h99",
          headRefName: "agent/other",
        },
      ],
      reviewRequestByPr: { [alias]: request },
      reviewEvidence: { 99: otherEvidence },
      hostedReviewByPr: { [alias]: hosted },
    });
    const before = plan();
    const initialized = record();
    assert.equal(initialized.status, 0, initialized.stderr);
    const saved = read();
    assert.equal(validateCanonicalState(saved), true);
    assert.deepEqual(
      saved.pullRequests.map((item) => item.number),
      [42, 99],
    );
    for (const item of saved.pullRequests) {
      assert.equal("legacyPrAliases" in item, false);
      assert.equal("sessionId" in item, false);
    }
    assert.deepEqual(saved.reviewRequestsByPr, { 42: request });
    assert.deepEqual(saved.reviewEvidenceByPr, { 99: otherEvidence });
    assert.deepEqual(saved.hostedReviewByPr, { 42: hosted });
    const after = plan();
    for (const key of ["capacity", "actions", "waits", "holds"])
      assert.deepEqual(after[key], before[key]);
    const completed = record({ reviewEvidenceByPr: { 42: evidence } });
    assert.equal(completed.status, 0, completed.stderr);
    assert.equal(read().reviewRequestsByPr[42].status, "completed");
    assert.equal(plan().actions.find((action) => action.target === "pr:42").kind, "mark-ready");
    const replay = record();
    assert.equal(replay.status, 0, replay.stderr);
    assert.deepEqual(read().reviewEvidenceByPr[99], otherEvidence);
  });
}

for (const [name, state, error] of [
  [
    "numeric alias pointing to another PR",
    {
      pullRequests: [{ ...pr, id: "123", prNumber: 42 }],
      reviewEvidenceByPr: { 123: evidence },
    },
    /unknown or ambiguous/,
  ],
  [
    "numeric alias colliding with a PR number",
    {
      pullRequests: [{ ...pr, id: "123", prNumber: 42 }, { number: 123 }],
      reviewEvidenceByPr: { 123: evidence },
    },
    /unknown or ambiguous/,
  ],
  ...["9007199254740993", "100000000000000000000000"].map((key) => [
    `unsafe numeric key ${key}`,
    { pullRequests: [pr], reviewEvidenceByPr: { [key]: evidence } },
    /unknown or ambiguous/,
  ]),
  [
    "unknown",
    { pullRequests: [pr], reviewEvidenceByPr: { missing: evidence } },
    /unknown or ambiguous/,
  ],
  [
    "ambiguous",
    {
      pullRequests: [pr, { ...pr, id: "PR-99", url: "https://github.com/example/app/pull/99" }],
      reviewEvidenceByPr: { [pr.headRefName]: evidence },
    },
    /unknown or ambiguous/,
  ],
  [
    "conflicting",
    {
      pullRequests: [pr],
      reviewEvidenceByPr: {
        [pr.id]: evidence,
        42: { ...evidence, reviewVerdict: "NEEDS REVISION" },
      },
    },
    /contradictory evidence/,
  ],
]) {
  test(`legacy PR recovery rejects ${name} evidence references without writing`, (t) => {
    const { file, record } = fixture(t, state);
    const before = readFileSync(file, "utf8");
    const result = record();
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
    assert.equal(readFileSync(file, "utf8"), before);
  });
}

for (const [id, key] of [
  ["42", "42"],
  ["PR-42", "42"],
  ["PR-42", "99"],
]) {
  test(`legacy PR ${id} preserves unambiguous numeric evidence key ${key}`, (t) => {
    const { record, read } = fixture(t, {
      pullRequests: [{ ...pr, id, prNumber: 42 }],
      reviewEvidenceByPr: { [key]: evidence },
    });
    const result = record();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(read().reviewEvidenceByPr, { [key]: evidence });
  });
}
