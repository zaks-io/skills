import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { enrichActions } from "../skills/ziw-orchestrate/scripts/action-briefs.mjs";
import { planTick } from "../skills/ziw-orchestrate/scripts/tick-plan.mjs";
import { retiredPr } from "../skills/ziw-orchestrate/scripts/pr-history.mjs";

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
  return { plan, record, config };
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

test("a closed PR with terminal tickets records settlement and resumes without another action", (t) => {
  const done = { ...issue, state: "Done", stateType: "completed", labels: ["kind-slice"] };
  const prs = [
    { number: 42, issueKey: "EXA-1", state: "closed", open: false, merged: false, headSha: "h1" },
  ];
  const f = fixture(t, done, prs);
  const action = f.plan.actions.find((entry) => entry.kind === "record-closed-pr");
  assert.ok(action);
  const saved = f.record(action);
  assert.equal(saved.mergeResultsByPr, undefined);
  assert.deepEqual(saved.pullRequests[0].closedResult, {
    headSha: "h1",
    issues: [{ issueKey: "EXA-1", updatedAt: issue.updatedAt }],
  });
  assert.equal(retiredPr(saved, 42), true);
  saved.scopeIssues = [{ issueKey: "EXA-1" }];
  assert.equal(retiredPr(saved, 42), false);
  const snapshot = { v: 3, repo, prs, linear: { issues: [done] } };
  const resumed = planTick({ snapshot, state: saved });
  assert.deepEqual(resumed.actions, []);
  assert.equal(resumed.wake.state, "delivered");
  const reopened = planTick({
    snapshot: { ...snapshot, linear: { issues: [issue] } },
    state: saved,
  });
  assert.equal(reopened.tickets[0].reason, "PR_CLOSED_UNMERGED");
  delete saved.scopeIssues;
  const defaultReopen = planTick({
    snapshot: {
      ...snapshot,
      prs: [],
      linear: {
        issues: [
          { ...issue, state: "Todo", stateType: "unstarted", updatedAt: "2026-11-02T00:00:00Z" },
        ],
      },
    },
    state: saved,
  });
  assert.deepEqual(defaultReopen.actions, []);
  assert.equal(defaultReopen.tickets[0].reason, "PR_CLOSED_UNMERGED");
});

test("recording a reopened PR invalidates closed settlement and allows later merge reconciliation", (t) => {
  const pr = {
    number: 42,
    url: "https://github.com/example/app/pull/42",
    headRefName: "codex/exa-1",
    baseRefName: "main",
    issueKey: "EXA-1",
    state: "closed",
    open: false,
    merged: false,
    headSha: "h1",
  };
  const f = fixture(t, { ...issue, state: "Canceled", stateType: "canceled" }, [pr]);
  let state = f.record(f.plan.actions.find((action) => action.kind === "record-closed-pr"));
  const snapshot = {
    v: 3,
    repo,
    prs: [
      {
        ...pr,
        state: "open",
        open: true,
        headSha: "h2",
        reviewDiffFingerprint: "patch-id:fp2",
        changedFiles: 1,
        checks: { state: "SUCCESS" },
      },
    ],
    linear: { issues: [{ ...issue, updatedAt: "2026-11-02T00:00:00Z" }], issueMetadata: [issue] },
  };
  const config = f.config;
  const reopened = enrichActions(planTick({ snapshot, state, config }), {
    snapshot,
    state,
    config,
  });
  const observation = reopened.actions.find((action) => action.kind === "record-pr-state");
  assert.ok(observation);
  state = f.record(observation);
  assert.equal(state.pullRequests[0].closedResult, undefined);
  assert.equal(state.pullRequests[0].state, "open");
  assert.deepEqual(state.pullRequests[0].linkedIssues, [{ issueKey: "EXA-1" }]);
  assert.equal(retiredPr(state, 42), false, "collector must fetch a later terminal result");
  assert.ok(
    !planTick({ snapshot, state, config }).actions.some(
      (action) => action.kind === "record-pr-state",
    ),
  );
  const merged = planTick({
    snapshot: {
      ...snapshot,
      prs: [{ ...pr, headSha: "h2", state: "merged", merged: true, mergeCommitSha: "m2" }],
    },
    state,
    config,
  });
  assert.ok(
    merged.actions.some(
      (action) => action.kind === "reconcile-merged-pr" && action.headSha === "h2",
    ),
  );
});

test("a merge receipt protects reopened default-scope tickets even without a saved PR", (t) => {
  const f = fixture(t, issue, [
    {
      number: 42,
      issueKey: "EXA-1",
      state: "merged",
      open: false,
      merged: true,
      headSha: "h1",
      mergeCommitSha: "m1",
    },
  ]);
  const state = f.record(
    f.plan.actions.find((action) => action.kind === "reconcile-merged-pr"),
    {
      "<passed|failed>": "passed",
      "<updatedAt-on-success>": "2026-11-01T12:00:00Z",
    },
  );
  assert.equal(state.pullRequests, undefined);
  assert.equal(retiredPr(state, 42), true);
  const snapshot = {
    v: 3,
    repo,
    prs: [],
    linear: {
      issues: [
        { ...issue, state: "Todo", stateType: "unstarted", updatedAt: "2026-11-02T00:00:00Z" },
      ],
    },
  };
  const plan = planTick({ snapshot, state, config: f.config });
  assert.deepEqual(plan.actions, []);
  assert.equal(plan.tickets[0].reason, "MERGED_TICKET_CHANGED");
});

test("missing footprint preparation enriches successfully alongside unrelated PR actions", () => {
  const snapshot = {
    v: 3,
    repo,
    linear: {
      issues: [
        { ...issue, state: "Todo", stateType: "unstarted", footprint: [] },
        { ...issue, issueKey: "EXA-2" },
      ],
    },
    prs: [
      {
        number: 42,
        issueKey: "EXA-2",
        state: "merged",
        merged: true,
        open: false,
        headSha: "h1",
        mergeCommitSha: "m1",
      },
    ],
  };
  const state = { v: 3, repo };
  const config = { stateFile: ".ziw/state.json" };
  const plan = enrichActions(planTick({ snapshot, state, config }), { snapshot, state, config });
  assert.deepEqual(plan.actions.map((action) => action.kind).sort(), [
    "prepare-ticket",
    "reconcile-merged-pr",
  ]);
  assert.match(plan.actions.find((action) => action.kind === "prepare-ticket").brief, /footprint/);
});

for (const configured of [false, true]) {
  test(`enriched workflow actions name their ${configured ? "configured" : "default"} tracker destination`, () => {
    const config = {
      stateFile: ".ziw/state.json",
      ...(configured
        ? {
            inReviewState: "Review queue",
            changesRequestedState: "Needs changes",
            readyToMergeState: "Awaiting owner",
          }
        : {}),
    };
    const snapshot = {
      v: 3,
      repo,
      baseline: { branch: "main" },
      linear: { issues: [issue] },
      prs: [
        {
          number: 42,
          issueKey: "EXA-1",
          url: "https://github.com/example/app/pull/42",
          headSha: "h1",
          baseRefName: "main",
        },
      ],
    };
    const state = { v: 3, repo };
    const actions = ["request-review", "route-fix", "route-review-fix", "route-human-merge"].map(
      (kind) => ({
        kind,
        target: "pr:42",
        ...(kind === "request-review" ? { reviewDiffFingerprint: "patch-id:fp1" } : {}),
      }),
    );
    const expected = configured
      ? ["Review queue", "Needs changes", "Needs changes", "Awaiting owner"]
      : ["In Review", "Changes Requested", "Changes Requested", "Ready to Merge"];
    const enriched = enrichActions({ repo, actions }, { snapshot, state, config });
    assert.deepEqual(
      enriched.actions.map((action) => action.targetState),
      expected,
    );
    assert.ok(enriched.actions.every((action) => /targetState/.test(action.instruction)));
    const explicit = enrichActions(
      {
        repo,
        actions: actions.map((action) => ({ ...action, targetState: "Explicit destination" })),
      },
      { snapshot, state, config },
    );
    assert.ok(explicit.actions.every((action) => action.targetState === "Explicit destination"));
  });
}
