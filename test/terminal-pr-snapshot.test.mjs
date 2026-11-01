import { migrateFixtureState } from "./helpers/planner-fixtures.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateInput } from "../skills/ziw-orchestrate/scripts/planner-input-validator.mjs";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "skills/ziw-orchestrate/scripts/tick-snapshot.mjs");
const issueUuid = "11111111-2222-4333-8444-555555555555";
const headSha = "a".repeat(40);
const mergeCommitSha = "b".repeat(40);
const terminal = (overrides = {}) => ({
  number: 7,
  title: "Ship the fix",
  body: "Closes https://linear.app/example/issue/SKI-7/fix",
  html_url: "https://github.com/example/repo/pull/7",
  state: "closed",
  merged: true,
  merged_at: "2026-11-01T10:00:00Z",
  merge_commit_sha: mergeCommitSha,
  head: { sha: headSha, ref: "fix" },
  base: { ref: "main" },
  ...overrides,
});

function collect(t, state, fixture = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-terminal-pr-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, "requests.jsonl");
  const stateFile = path.join(dir, "state.json");
  const fixtureFile = path.join(dir, "fixture.json");
  const gh = path.join(dir, "gh");
  writeFileSync(stateFile, JSON.stringify({ v: 3, repo: "example/repo", ...state }));
  writeFileSync(fixtureFile, JSON.stringify({ response: terminal(), ...fixture }));
  writeFileSync(
    gh,
    `#!/usr/bin/env node
const { readFileSync, appendFileSync } = require("node:fs");
const fixture = JSON.parse(readFileSync(${JSON.stringify(fixtureFile)}, "utf8"));
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
const endpoint = args.find(arg => arg.startsWith("repos/"));
if (args[1] === "graphql") {
  const nodes = fixture.openPrs ?? [];
  process.stdout.write(JSON.stringify({ data: { repository: {
    defaultBranchRef: { name: "main", target: { oid: ${JSON.stringify(headSha)} } },
    pullRequests: { totalCount: nodes.length, pageInfo: { hasNextPage: false }, nodes }
  } } }));
} else if (endpoint?.includes("/files")) {
  process.stdout.write("[[]]");
} else if (endpoint?.includes("/compare/")) {
  process.exit(1);
} else if (/^repos\\/example\\/repo\\/pulls\\/[1-9]\\d*$/.test(endpoint)) {
  if (fixture.error) { process.stderr.write(fixture.error); process.exit(1); }
  process.stdout.write(fixture.raw ?? JSON.stringify(fixture.response));
} else {
  process.stderr.write("unexpected gh request");
  process.exit(2);
}
`,
  );
  chmodSync(gh, 0o755);
  const result = spawnSync(
    process.execPath,
    [script, "--repo", "example/repo", "--no-local-worktrees", "--state", stateFile],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` },
    },
  );
  return {
    result,
    lookupCalls: () =>
      readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse)
        .filter((args) => /^repos\/example\/repo\/pulls\/[1-9]\d*$/.test(args[1])),
  };
}

function snapshot(result) {
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(validateInput(output), true, JSON.stringify(validateInput.errors));
  return output;
}

test("collector observes a manually merged PR from a returned worker receipt", (t) => {
  const { result, lookupCalls } = collect(t, {
    dispatches: [{ sessionId: "worker", prNumber: 7, issueKey: "SKI-7", returned: true }],
  });
  const output = snapshot(result);
  assert.deepEqual(output.prs, [
    {
      number: 7,
      title: "Ship the fix",
      url: "https://github.com/example/repo/pull/7",
      state: "merged",
      open: false,
      closed: true,
      merged: true,
      headSha,
      headRefName: "fix",
      baseRefName: "main",
      mergeCommitSha,
      mergedAt: "2026-11-01T10:00:00Z",
      linkedIssues: [{ issueKey: "SKI-7" }],
    },
  ]);
  assert.deepEqual(lookupCalls(), [["api", "repos/example/repo/pulls/7"]]);
  assert.deepEqual(output.footprint, {
    openPrCount: 0,
    productPrCount: 0,
    draftPrCount: 0,
    readyForReviewPrCount: 0,
    botPrCount: 0,
    dependencyBotPrCount: 0,
  });
});

test("collector distinguishes a closed unmerged PR despite saved merged flags", (t) => {
  const { result } = collect(
    t,
    { pullRequests: [{ number: 7, state: "merged", merged: true }] },
    { response: terminal({ merged: false, merged_at: null }) },
  );
  const pr = snapshot(result).prs[0];
  assert.equal(pr.state, "closed");
  assert.equal(pr.merged, false);
  assert.equal(pr.open, false);
  assert.equal("mergeCommitSha" in pr, false);
  assert.equal("mergedAt" in pr, false);
});

test("a saved human handoff PR preserves its ticket for terminal reconciliation", (t) => {
  const { result, lookupCalls } = collect(
    t,
    { pullRequests: [{ number: 7, issueKey: "SKI-7", state: "open" }] },
    { response: terminal({ body: "" }) },
  );
  assert.deepEqual(snapshot(result).prs[0].linkedIssues, [{ issueKey: "SKI-7" }]);
  assert.equal(lookupCalls().length, 1);
});

test("collector preserves saved worker and PR issue identities alongside body links", (t) => {
  const { result, lookupCalls } = collect(
    t,
    migrateFixtureState(
      {
        dispatches: [{ sessionId: "returned", prNumber: 7, issueUuid, returned: true }],
        ledgerDispatches: [
          { sessionId: "failed", prNumber: 7, issueKey: "SKI-8", state: "failed" },
        ],
        activeWork: [
          { sessionId: "completed", prNumber: 7, issueKey: "SKI-9", state: "completed" },
        ],
        workers: [{ sessionId: "stopped", prNumber: 7, issueKey: "SKI-10", stopped: true }],
        pullRequests: [{ number: 7, issueKey: "SKI-7", linkedIssues: [{ issueKey: "SKI-11" }] }],
      },
      "example/repo",
    ),
  );
  assert.deepEqual(snapshot(result).prs[0].linkedIssues, [
    { issueUuid },
    { issueKey: "SKI-8" },
    { issueKey: "SKI-10" },
    { issueKey: "SKI-9" },
    { issueKey: "SKI-7" },
    { issueKey: "SKI-11" },
  ]);
  assert.equal(lookupCalls().length, 1);
});

for (const collection of [
  "reviewEvidenceByPr",
  "hostedReviewByPr",
  "reviewRequestsByPr",
  "reviewDiffByPr",
  "continuationByPr",
]) {
  test(`collector recovers a known PR from ${collection}`, (t) => {
    const value = ["reviewDiffByPr", "continuationByPr"].includes(collection) ? "saved" : {};
    const { result, lookupCalls } = collect(t, { [collection]: { 7: value } });
    assert.equal(snapshot(result).prs[0].state, "merged");
    assert.equal(lookupCalls().length, 1);
  });
}

test("collector recovers a known PR from an explicit review check", (t) => {
  const { result } = collect(t, { reviewEvidenceChecks: [{ prNumber: 7 }] });
  assert.equal(snapshot(result).prs[0].number, 7);
});

test("collector verifies a PR known only through a saved merge result", (t) => {
  const { result, lookupCalls } = collect(t, {
    mergeResultsByPr: { 7: { headSha, mergeCommitSha, postMergeCheck: "passed" } },
  });
  assert.equal(snapshot(result).prs[0].state, "merged");
  assert.equal(lookupCalls().length, 1);
});

test("settled history is retired while selected merges and failed checks are recollected", (t) => {
  const settled = {
    issueKey: "SKI-7",
    headSha,
    mergeCommitSha,
    postMergeCheck: "passed",
    trackerUpdatedAt: "2026-11-01T12:00:00Z",
  };
  for (const [scopeIssues, postMergeCheck, expected] of [
    [undefined, "passed", 0],
    [[{ issueKey: "SKI-8" }], "passed", 0],
    [[{ issueKey: "SKI-7" }], "passed", 1],
    [undefined, "failed", 1],
  ]) {
    const { result, lookupCalls } = collect(t, {
      scopeIssues,
      mergeResultsByPr: { 7: { ...settled, postMergeCheck } },
      pullRequests: [{ number: 7, issueKey: "SKI-7" }],
    });
    assert.equal(snapshot(result).prs.length, expected);
    assert.equal(lookupCalls().length, expected);
  }
});

test("collector normalizes a legacy review map against its saved PR before lookup", (t) => {
  const { result, lookupCalls } = collect(
    t,
    migrateFixtureState(
      {
        pullRequests: [{ number: 7, headSha }],
        reviewDiffByPr: { [headSha]: "saved" },
      },
      "example/repo",
    ),
  );
  assert.equal(snapshot(result).prs[0].number, 7);
  assert.equal(lookupCalls().length, 1);
});

test("collector recovers a terminal worker PR URL without a saved number", (t) => {
  const { result } = collect(t, {
    dispatches: [
      { sessionId: "worker", prUrl: "https://github.com/example/repo/pull/7", returned: true },
    ],
  });
  assert.equal(snapshot(result).prs[0].number, 7);
});

for (const [name, fixture] of [
  ["failed lookup", { error: "HTTP 404: Not Found" }],
  ["invalid JSON", { raw: "not json" }],
  ["missing PR", { response: null }],
  ["wrong PR", { response: terminal({ number: 8 }) }],
  ["missing merge status", { response: terminal({ merged: null }) }],
  ["missing head", { response: terminal({ head: null }) }],
  [
    "open PR omitted from listing",
    { response: terminal({ state: "open", merged: false, merged_at: null }) },
  ],
]) {
  test(`collector fails without a partial snapshot for ${name}`, (t) => {
    const { result } = collect(t, { pullRequests: [{ number: 7, state: "merged" }] }, fixture);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /tick-snapshot: (?:gh api failed: HTTP 404|PR #7 lookup)/);
  });
}

test("collector keeps open PR collection and counts without a redundant terminal lookup", (t) => {
  const { result, lookupCalls } = collect(
    t,
    {
      dispatches: [{ sessionId: "worker", prNumber: 7, returned: true }],
      reviewDiffByPr: { 7: "saved" },
    },
    {
      openPrs: [
        {
          number: 7,
          headRefOid: headSha,
          headRefName: "fix",
          baseRefName: "main",
          changedFiles: 0,
          isDraft: true,
        },
      ],
    },
  );
  const output = snapshot(result);
  assert.equal(output.prs.length, 1);
  assert.equal(output.prs[0].state, "open");
  assert.deepEqual(lookupCalls(), []);
  assert.deepEqual(output.footprint, {
    openPrCount: 1,
    productPrCount: 1,
    draftPrCount: 1,
    readyForReviewPrCount: 0,
    botPrCount: 0,
    dependencyBotPrCount: 0,
  });
});
