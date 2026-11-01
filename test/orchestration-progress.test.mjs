import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve("skills/ziw-orchestrate/scripts/tick-plan.mjs");
const ticket = (key, extra = {}) => ({
  issueKey: key,
  state: "Todo",
  stateType: "unstarted",
  title: "Fix search",
  labels: ["kind-slice", "ready-for-agent", "risk-normal"],
  footprint: [`src/${key}.ts`],
  updatedAt: "2026-11-01T00:00:00Z",
  ...extra,
});
function plan(issues, { prs = [], state = {}, config = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-progress-"));
  try {
    const file = path.join(dir, "input.json");
    writeFileSync(
      file,
      JSON.stringify({
        snapshot: { v: 3, repo: "example/app", prs, linear: { issues } },
        config: {
          readyState: "Todo",
          mergeAuthority: "human",
          hostedReviewRiskTiers: [],
          ...config,
        },
        state: { v: 3, repo: "example/app", ...state },
      }),
    );
    return JSON.parse(execFileSync(process.execPath, [script, file], { encoding: "utf8" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("selected backlog work is prepared and accounted for; parked default work is untouched", () => {
  const issue = ticket("EXA-1", {
    state: "Backlog",
    stateType: "backlog",
    labels: ["kind-slice", "needs-info"],
    footprint: [],
  });
  const scoped = plan([issue], { state: { scopeIssues: [{ issueKey: "EXA-1" }] } });
  assert.equal(scoped.wake.state, "act-now");
  assert.equal(scoped.actions[0].kind, "prepare-ticket");
  assert.equal(scoped.tickets[0].status, "actionable");
  assert.deepEqual(plan([issue]).actions, []);
  assert.deepEqual(plan([issue]).tickets, []);
  assert.deepEqual(plan([{ ...issue, labels: ["kind-slice", "ready-for-agent"] }]).actions, []);
});

test("dependency blockers and cycles never report delivered", () => {
  const issue = ticket("EXA-1", { blockedBy: [{ issueKey: "EXA-2" }] });
  const blocked = plan([issue], { state: { scopeIssues: [{ issueKey: "EXA-1" }] } });
  assert.equal(blocked.wake.state, "waiting");
  assert.deepEqual(blocked.tickets[0].blockedBy, ["EXA-2"]);
  assert.equal(blocked.waits[0].signal, "dependency");
  const cycle = plan([issue, ticket("EXA-2", { blockedBy: [{ issueKey: "EXA-1" }] })]);
  assert.equal(cycle.wake.state, "blocked");
  assert.ok(cycle.tickets.every((entry) => entry.reason === "DEPENDENCY_CYCLE"));
});

test("a finished ticket cannot hide missing or unfinished selected work", () => {
  const done = ticket("EXA-1", { state: "Done", stateType: "completed", labels: ["kind-slice"] });
  const scoped = { scopeIssues: [{ issueKey: "EXA-1" }, { issueKey: "EXA-2" }] };
  const missing = plan([done], { state: scoped });
  assert.notEqual(missing.wake.state, "delivered");
  assert.deepEqual(
    missing.tickets.map((entry) => entry.status),
    ["finished", "blocked"],
  );
  const finished = plan([done], { state: { scopeIssues: [{ issueKey: "EXA-1" }] } });
  assert.equal(finished.wake.state, "delivered");
});

test("incomplete bodies cannot dispatch even with readiness labels", () => {
  const result = plan([ticket("EXA-1", { missingSections: ["checks"] })]);
  assert.deepEqual(
    result.actions.map((action) => action.kind),
    ["prepare-ticket"],
  );
});

test("missing kind metadata goes to preparation while explicit containers go to slicing", () => {
  const unknown = plan([ticket("EXA-1", { labels: ["ready-for-agent"] })]);
  assert.equal(unknown.actions[0].kind, "prepare-ticket");
  const container = plan([ticket("EXA-1", { labels: ["kind-epic", "ready-for-agent"] })]);
  assert.deepEqual(container.actions, []);
  assert.equal(container.holds[0].owner, "ziw-to-issues");
});

test("preparation stops at its recorded owner until the ticket revision changes", () => {
  const issue = ticket("EXA-1", { state: "Triage", labels: ["kind-slice", "needs-info"] });
  const state = {
    scopeIssues: [{ issueKey: "EXA-1" }],
    preparations: [
      {
        issueKey: "EXA-1",
        updatedAt: issue.updatedAt,
        outcome: "needs-slicing",
        reason: "Approved spec needs two deployments",
      },
    ],
  };
  const waiting = plan([issue], { state });
  assert.equal(waiting.wake.state, "blocked");
  assert.equal(waiting.holds[0].owner, "ziw-to-issues");
  assert.equal(
    plan([{ ...issue, updatedAt: "2026-11-02T00:00:00Z" }], { state }).actions[0].kind,
    "prepare-ticket",
  );
});

test("worker limit survives resume and cannot raise repository capacity", () => {
  const issues = [ticket("EXA-1"), ticket("EXA-2")];
  assert.equal(plan(issues, { state: { workerLimit: 1 } }).capacity.cap, 1);
  assert.equal(
    plan(issues, { config: { workerConcurrencyCap: 1 }, state: { workerLimit: 9 } }).capacity.cap,
    1,
  );
});

test("a confirmed unresolved preparation cannot be bypassed by leftover readiness labels", () => {
  const issue = ticket("EXA-1");
  const result = plan([issue], {
    state: {
      preparations: [
        {
          issueKey: "EXA-1",
          updatedAt: issue.updatedAt,
          outcome: "needs-human",
          reason: "Product decision pending",
        },
      ],
      startableTickets: [{ issueKey: "EXA-1", footprint: issue.footprint }],
    },
  });
  assert.deepEqual(result.actions, []);
  assert.equal(result.tickets[0].reason, "HUMAN_DECISION_REQUIRED");
});

const approvedPr = {
  number: 42,
  issueKey: "EXA-1",
  state: "open",
  isDraft: false,
  headSha: "h1",
  changedFiles: 1,
  labels: ["needs-human-merge"],
  checks: { state: "SUCCESS", failed: [], pending: [] },
  latestReviews: { human: { authorType: "User", state: "APPROVED", headSha: "h1" } },
};

test("human handoff happens once, with changed facts still invalidating readiness", () => {
  const issue = ticket("EXA-1", { state: "Ready to Merge", stateType: "started" });
  const result = plan([issue], { prs: [approvedPr] });
  assert.ok(!result.actions.some((action) => action.kind === "route-human-merge"));
  assert.equal(result.waits[0].reason, "AWAITING_HUMAN_MERGE");
  const changed = plan([issue], { prs: [{ ...approvedPr, headSha: "h2" }] });
  assert.ok(changed.actions.some((action) => action.kind === "request-review"));
});

test("an external merge is verified and reconciled exactly once", () => {
  const merged = {
    ...approvedPr,
    state: "merged",
    open: false,
    merged: true,
    mergeCommitSha: "m1",
  };
  const issue = ticket("EXA-1", { state: "In Review", stateType: "started" });
  const first = plan([issue], { prs: [merged] });
  assert.equal(first.actions[0].kind, "reconcile-merged-pr");
  assert.equal(first.actions[0].verifyPostMerge, true);
  const state = {
    scopeIssues: [{ issueKey: "EXA-1" }],
    mergeResultsByPr: {
      42: { headSha: "h1", mergeCommitSha: "m1", postMergeCheck: "passed" },
    },
  };
  const repair = plan([issue], { prs: [merged], state });
  assert.equal(repair.actions[0].verifyPostMerge, false);
  const done = { ...issue, state: "Done", stateType: "completed", labels: ["kind-slice"] };
  const finished = plan([done], { prs: [merged], state });
  assert.deepEqual(finished.actions, []);
  assert.equal(finished.wake.state, "delivered");
  state.mergeResultsByPr[42].postMergeCheck = "failed";
  const failed = plan([done], { prs: [merged], state });
  assert.equal(failed.wake.state, "blocked");
  assert.ok(failed.holds.some((hold) => hold.reason === "POST_MERGE_CHECK_FAILED"));
});

for (const stateName of ["Todo", "Backlog"]) {
  test(`terminal PR prevents dispatch and promotion from ${stateName}`, () => {
    const issue = ticket("EXA-1", { state: stateName });
    for (const terminalState of ["merged", "closed"]) {
      const result = plan([issue], {
        prs: [
          {
            ...approvedPr,
            state: terminalState,
            open: false,
            merged: terminalState === "merged",
            mergeCommitSha: "m1",
          },
        ],
        state: { scopeIssues: [{ issueKey: "EXA-1" }], startableTickets: [issue] },
      });
      assert.ok(
        !result.actions.some((action) =>
          ["dispatch", "promote-ready", "prepare-ticket"].includes(action.kind),
        ),
      );
      if (terminalState === "merged") assert.equal(result.actions[0].kind, "reconcile-merged-pr");
      else assert.ok(result.holds.some((hold) => hold.reason === "PR_CLOSED_UNMERGED"));
    }
  });
}

test("settled merge history outside selection does not reappear from saved PRs", () => {
  const result = plan([ticket("EXA-2")], {
    state: {
      pullRequests: [
        {
          ...approvedPr,
          issueUuid: "11111111-2222-4333-8444-555555555555",
          state: "merged",
          open: false,
          merged: true,
          mergeCommitSha: "m1",
        },
      ],
      mergeResultsByPr: {
        42: {
          issueKey: "EXA-1",
          headSha: "h1",
          mergeCommitSha: "m1",
          postMergeCheck: "passed",
          trackerUpdatedAt: "2026-11-01T12:00:00Z",
        },
      },
    },
  });
  assert.deepEqual(
    result.actions.map((action) => action.target),
    ["ticket:EXA-2"],
  );
  assert.deepEqual(result.holds, []);
});

test("closed-unmerged and absent PRs never imply a successful merge", () => {
  const issue = ticket("EXA-1", { state: "In Review", stateType: "started" });
  const closed = plan([issue], { prs: [{ ...approvedPr, state: "closed", open: false }] });
  assert.ok(closed.holds.some((hold) => hold.reason === "PR_CLOSED_UNMERGED"));
  const absent = plan([issue]);
  assert.notEqual(absent.wake.state, "delivered");
  assert.ok(!absent.actions.some((action) => action.kind === "reconcile-merged-pr"));
});

test("live open PR facts override saved merge flags and commits", () => {
  const issue = ticket("EXA-1", { state: "In Review", stateType: "started" });
  const result = plan([issue], {
    prs: [approvedPr],
    state: {
      pullRequests: [
        {
          ...approvedPr,
          state: "merged",
          open: false,
          merged: true,
          closed: true,
          mergeCommitSha: "old-merge",
          mergedAt: "2026-10-01T00:00:00Z",
        },
      ],
    },
  });
  assert.ok(!result.actions.some((action) => action.kind === "reconcile-merged-pr"));
  assert.ok(result.actions.some((action) => action.kind === "route-human-merge"));
});

test("same-revision ready preparation with incomplete metadata stops at a named hold", () => {
  for (const extra of [
    { missingSections: ["checks"] },
    { labels: ["ready-for-agent"] },
    { footprint: [] },
  ]) {
    const issue = ticket("EXA-1", extra);
    const result = plan([issue], {
      state: {
        scopeIssues: [{ issueKey: "EXA-1" }],
        preparations: [
          { issueKey: "EXA-1", updatedAt: issue.updatedAt, outcome: "ready", reason: "Prepared" },
        ],
      },
    });
    assert.deepEqual(result.actions, []);
    assert.ok(result.holds.some((hold) => hold.reason === "PREPARATION_INCONSISTENT"));
  }
});

test("preparation actions identify missing body sections and start blockers", () => {
  const issue = ticket("EXA-1", {
    missingSections: ["checks"],
    labels: ["kind-slice", "needs-info"],
    footprint: [],
  });
  const result = plan([issue], { state: { scopeIssues: [{ issueKey: "EXA-1" }] } });
  const action = result.actions.find((entry) => entry.kind === "prepare-ticket");
  assert.deepEqual(action.missingSections, ["checks"]);
  assert.ok(action.startableBlockers.includes("missing predicted file footprint"));
});

test("a successful merge record never overwrites a later ticket revision", () => {
  const merged = {
    ...approvedPr,
    state: "merged",
    open: false,
    merged: true,
    mergeCommitSha: "m1",
  };
  const state = {
    scopeIssues: [{ issueKey: "EXA-1" }],
    mergeResultsByPr: {
      42: {
        issueKey: "EXA-1",
        headSha: "h1",
        mergeCommitSha: "m1",
        postMergeCheck: "passed",
        trackerUpdatedAt: "2026-11-01T12:00:00Z",
      },
    },
  };
  for (const issue of [
    ticket("EXA-1"),
    ticket("EXA-1", { state: "In Review", stateType: "started", labels: ["kind-slice"] }),
  ]) {
    const result = plan([issue], { prs: [merged], state });
    assert.deepEqual(result.actions, []);
    const hold = result.holds.find((entry) => entry.reason === "MERGED_TICKET_CHANGED");
    assert.equal(hold.owner, "human");
  }
});

test("failed merge checks and closed unmerged PRs have an explicit resolution", () => {
  const issue = ticket("EXA-1", { state: "In Review", stateType: "started" });
  const closed = plan([issue], { prs: [{ ...approvedPr, state: "closed", open: false }] });
  assert.ok(closed.holds.find((hold) => hold.reason === "PR_CLOSED_UNMERGED").resolution);
  const failed = plan([issue], {
    prs: [{ ...approvedPr, state: "merged", open: false, merged: true, mergeCommitSha: "m1" }],
    state: {
      mergeResultsByPr: {
        42: { issueKey: "EXA-1", headSha: "h1", mergeCommitSha: "m1", postMergeCheck: "failed" },
      },
    },
  });
  assert.match(
    failed.holds.find((hold) => hold.reason === "POST_MERGE_CHECK_FAILED").resolution,
    /merge-result/,
  );
});

test("configured human merge label aliases suppress repeated handoff", () => {
  for (const alias of [
    "humanReviewPrLabel",
    "codeHostHumanMergePrLabel",
    "codeHostHumanMergeLabel",
    "codeHostHumanReviewPrLabel",
    "codeHostHumanReviewLabel",
    "codeHostPrAttentionLabel",
  ]) {
    const result = plan([ticket("EXA-1", { state: "Ready to Merge", stateType: "started" })], {
      prs: [{ ...approvedPr, labels: ["custom-human-merge"] }],
      config: { [alias]: "custom-human-merge" },
    });
    assert.ok(!result.actions.some((action) => action.kind === "route-human-merge"), alias);
    assert.ok(
      result.waits.some((wait) => wait.reason === "AWAITING_HUMAN_MERGE"),
      alias,
    );
  }
});

test("configured readiness label aliases keep merged tickets from reporting delivered", () => {
  const merged = {
    ...approvedPr,
    state: "merged",
    open: false,
    merged: true,
    mergeCommitSha: "m1",
  };
  for (const config of [
    { readinessLabel: "custom-ready" },
    { readinessLabels: ["custom-ready"] },
  ]) {
    const issue = ticket("EXA-1", {
      state: "Done",
      stateType: "completed",
      labels: ["kind-slice", "custom-ready"],
    });
    const result = plan([issue], {
      prs: [merged],
      config,
      state: {
        scopeIssues: [{ issueKey: "EXA-1" }],
        mergeResultsByPr: {
          42: {
            issueKey: "EXA-1",
            headSha: "h1",
            mergeCommitSha: "m1",
            postMergeCheck: "passed",
            trackerUpdatedAt: issue.updatedAt,
          },
        },
      },
    });
    assert.notEqual(result.wake.state, "delivered");
    assert.ok(result.actions.some((action) => action.kind === "reconcile-merged-pr"));
  }
});
