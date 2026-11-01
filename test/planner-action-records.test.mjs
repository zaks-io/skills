import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { enrichActions } from "../skills/ziw-orchestrate/scripts/action-briefs.mjs";
import { planTick } from "../skills/ziw-orchestrate/scripts/tick-plan.mjs";

const repo = "example/app";
const issue = {
  issueKey: "EXA-1",
  title: "Fix search",
  url: "https://linear.app/example/issue/EXA-1/search",
  state: "In Review",
  stateType: "started",
  labels: ["kind-slice", "ready-for-agent"],
  footprint: ["src/search.ts"],
  updatedAt: "2026-11-01T00:00:00Z",
};
function fixture(t, ticket = issue, prs = []) {
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-action-records-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const stateFile = path.join(directory, "state.json");
  const snapshot = { v: 3, repo, prs, linear: { issues: [ticket] } };
  const state = { v: 3, repo, scopeIssues: [{ issueKey: ticket.issueKey }] };
  const config = { stateFile, mergeAuthority: "human", hostedReviewRiskTiers: [] };
  const pure = planTick({ snapshot, state, config });
  assert.ok(pure.actions.every((action) => action.instruction == null && action.record == null));
  const plan = enrichActions(pure, { snapshot, state, config });
  const record = (action, replacements = {}) => {
    const argv = action.record.argv.map((argument) => replacements[argument] ?? argument);
    const result = spawnSync(argv[0], argv.slice(1), {
      input: action.record.stdin,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(readFileSync(stateFile, "utf8"));
  };
  return { plan, record };
}

test("a preparation action exposes its gaps and supplies a usable typed record command", (t) => {
  const f = fixture(t, {
    ...issue,
    state: "Backlog",
    stateType: "backlog",
    missingSections: ["checks"],
    footprint: [],
    labels: ["kind-slice", "needs-info"],
  });
  const action = f.plan.actions.find((action) => action.kind === "prepare-ticket");
  assert.match(action.brief, /checks/);
  assert.match(action.brief, /missing predicted file footprint/);
  assert.equal(action.skill, "ziw-triage");
  const saved = f.record(action, {
    "<outcome>": "needs-human",
    "<reason>": "Confirm owner's search behavior",
    "<updatedAt>": issue.updatedAt,
  });
  assert.deepEqual(saved.preparations, [
    {
      issueKey: "EXA-1",
      outcome: "needs-human",
      reason: "Confirm owner's search behavior",
      updatedAt: issue.updatedAt,
    },
  ]);
});

test("a merged PR action records its confirmed head, merge commit and tracker revision", (t) => {
  const f = fixture(t, issue, [
    {
      number: 42,
      issueKey: "EXA-1",
      state: "merged",
      open: false,
      merged: true,
      headSha: "h1",
      mergeCommitSha: "m1",
      url: "https://github.com/example/app/pull/42",
    },
  ]);
  const action = f.plan.actions.find((action) => action.kind === "reconcile-merged-pr");
  assert.equal(action.verifyPostMerge, true);
  const saved = f.record(action, {
    "<passed|failed>": "passed",
    "<updatedAt-on-success>": "2026-11-01T12:00:00Z",
  });
  assert.deepEqual(saved.mergeResultsByPr[42], {
    issueKey: "EXA-1",
    headSha: "h1",
    mergeCommitSha: "m1",
    postMergeCheck: "passed",
    trackerUpdatedAt: "2026-11-01T12:00:00Z",
  });
});

test("a human handoff records its PR and linked ticket for the next collector", (t) => {
  const f = fixture(t, issue, [
    {
      number: 42,
      issueKey: "EXA-1",
      state: "open",
      headSha: "h1",
      changedFiles: 1,
      checks: { state: "SUCCESS" },
      latestReviews: { human: { authorType: "User", state: "APPROVED", headSha: "h1" } },
    },
  ]);
  const action = f.plan.actions.find((action) => action.kind === "route-human-merge");
  const saved = f.record(action);
  assert.deepEqual(saved.pullRequests, [{ number: 42, linkedIssues: [{ issueKey: "EXA-1" }] }]);
});
