import assert from "node:assert/strict";
import test from "node:test";
import {
  completedByMergedPullRequest,
  deriveActiveDispatches,
  issuesWithDeliveryEvidence,
  reconcileActiveDelivery,
} from "../skills/ziw-orchestrate/scripts/active-dispatches.mjs";
import {
  activeWorkerCapacity,
  riskTier,
} from "../skills/ziw-orchestrate/scripts/workflow-contract.mjs";

const worker = (sessionId, issueRef = "MAIN-1", extra = {}) => ({
  sessionId,
  issueRef,
  workerRef: `session:${sessionId}`,
  occupiesWorkerSlot: true,
  state: "running",
  ...extra,
});
const run = (dispatches, extra = {}) =>
  reconcileActiveDelivery({ state: { dispatches }, ...extra });

test("same session observations coalesce and union footprints", () => {
  const result = run([
    worker("one", "MAIN-1", { footprint: ["src/a"] }),
    worker("one", "MAIN-1", { footprint: ["src/b"] }),
  ]);
  assert.equal(result.dispatches.length, 1);
  assert.deepEqual(result.dispatches[0].footprint, ["src/a", "src/b"]);
  assert.equal(activeWorkerCapacity(result).used, 1);
});

test("sessionless receipt joins only a worker with the same explicit receipt", () => {
  const result = run([
    worker("one", "MAIN-1", { receiptId: "receipt-a" }),
    {
      receiptId: "receipt-a",
      workerRef: "receipt:receipt-a",
      issueRef: "MAIN-1",
      footprint: ["src/a"],
    },
    {
      receiptId: "receipt-b",
      workerRef: "receipt:receipt-b",
      issueRef: "MAIN-1",
      footprint: ["src/b"],
    },
  ]);
  assert.equal(result.dispatches.length, 2);
  assert.equal(activeWorkerCapacity(result).used, 2);
  assert.deepEqual(result.dispatches.find((item) => item.sessionId === "one").footprint, ["src/a"]);
});

for (const shared of [{}, { branch: "same" }, { worktree: "/tmp/same" }, { headSha: "same" }]) {
  test(`distinct sessions survive shared issue and evidence ${JSON.stringify(shared)}`, () => {
    const result = run([worker("one", "MAIN-1", shared), worker("two", "MAIN-1", shared)], {
      snapshot: {
        linear: {
          activeIssues: [{ issueRef: "MAIN-1", stateType: "started", footprint: ["src/shared"] }],
        },
      },
    });
    assert.equal(activeWorkerCapacity(result).used, 2);
    assert.equal(result.dispatches.length, 2);
    assert.ok(result.dispatches.every((item) => item.footprint.includes("src/shared")));
  });
}

for (const shared of [
  { sessionId: "same", workerRef: "session:same" },
  { receiptId: "same", workerRef: "receipt:same" },
]) {
  test(`contradictory issue association fails for ${JSON.stringify(shared)}`, () => {
    assert.throws(
      () =>
        run([
          { ...shared, issueRef: "MAIN-1" },
          { ...shared, issueRef: "MAIN-2" },
        ]),
      /issueRef conflict/,
    );
  });
}

test("contradictory sessions on one receipt fail", () => {
  assert.throws(
    () =>
      run([
        worker("one", "MAIN-1", { receiptId: "same" }),
        worker("two", "MAIN-1", { receiptId: "same" }),
      ]),
    /sessionId conflict/,
  );
});

test("linked open PR preserves live and repair worker slots", () => {
  const result = run([worker("one", "MAIN-1", { footprint: ["src/worker"], purpose: "repair" })], {
    pullRequests: [{ number: 1, issueRef: "MAIN-1", state: "open", footprint: ["src/pr"] }],
  });
  assert.equal(activeWorkerCapacity(result).used, 1);
  assert.deepEqual(result.pullRequests[0].footprint, ["src/pr", "src/worker"]);
  assert.equal(issuesWithDeliveryEvidence([{ issueRef: "MAIN-1" }], result)[0].openPr, true);
});

for (const terminal of [
  { returned: true },
  { stopped: true },
  { state: "completed" },
  { state: "failed" },
]) {
  for (const link of [{ issueRef: "MAIN-1" }, { prNumber: 7 }]) {
    test(`returned receipt transfers footprint by ${JSON.stringify(link)} ${JSON.stringify(terminal)}`, () => {
      const result = run(
        [
          {
            receiptId: "opaque",
            workerRef: "receipt:opaque",
            footprint: ["src/worker"],
            ...link,
            ...terminal,
          },
        ],
        {
          pullRequests: [{ number: 7, issueRef: "MAIN-1", footprint: ["src/pr"] }],
        },
      );
      assert.deepEqual(result.dispatches, []);
      assert.deepEqual(result.pullRequests[0].footprint, ["src/pr", "src/worker"]);
    });
  }
}

test("started issues and unconfirmed active claims reserve delivery without worker slots", () => {
  const result = deriveActiveDispatches({
    snapshot: {
      linear: {
        activeIssues: [
          { issueRef: "MAIN-1", stateType: "started", footprint: ["src/a"] },
          { issueRef: "MAIN-2", activeClaim: true, footprint: ["src/b"] },
        ],
      },
    },
  });
  assert.equal(result.length, 2);
  assert.equal(activeWorkerCapacity({ dispatches: result }).used, 0);
  assert.ok(
    issuesWithDeliveryEvidence([{ issueRef: "MAIN-1" }, { issueRef: "MAIN-2" }], {
      dispatches: result,
    }).every((issue) => issue.activeClaim),
  );
});

test("confirmed tracker session coalesces with its receipt", () => {
  const result = run([worker("one", "MAIN-1", { footprint: ["src/a"] })], {
    snapshot: {
      linear: {
        activeIssues: [
          {
            issueRef: "MAIN-1",
            activeClaim: true,
            sessionId: "one",
            workerRef: "session:one",
            footprint: ["src/b"],
          },
        ],
      },
    },
  });
  assert.equal(result.dispatches.length, 1);
  assert.equal(activeWorkerCapacity(result).used, 1);
  assert.deepEqual(result.dispatches[0].footprint, ["src/a", "src/b"]);
});

test("worktrees enrich same-path workers without coalescing them", () => {
  const result = run(
    [
      worker("one", "MAIN-1", { worktree: "/tmp/shared" }),
      worker("two", "MAIN-2", { worktree: "/tmp/shared" }),
    ],
    {
      snapshot: { worktrees: [{ path: "/tmp/shared", dirty: true, footprint: ["src/hot"] }] },
    },
  );
  assert.equal(result.dispatches.length, 2);
  assert.equal(activeWorkerCapacity(result).used, 2);
  assert.ok(result.dispatches.every((item) => item.footprint.includes("src/hot")));
});

test("unidentified worktrees reserve independently and never count as workers", () => {
  const dispatches = deriveActiveDispatches({
    snapshot: {
      worktrees: [
        { path: "/tmp/one", headSha: "same" },
        { path: "/tmp/two", headSha: "same" },
        { path: "/tmp/one", footprint: ["src/a"] },
      ],
    },
  });
  assert.equal(dispatches.length, 2);
  assert.equal(activeWorkerCapacity({ dispatches }).used, 0);
});

test("merged PR head evidence does not hide a reused branch", () => {
  const prs = [{ headRefName: "branch", headSha: "merged-head" }];
  assert.equal(
    completedByMergedPullRequest({ branch: "branch", headSha: "merged-head" }, prs),
    true,
  );
  assert.equal(completedByMergedPullRequest({ branch: "branch", headSha: "new-head" }, prs), false);
});

test("metadata enriches PR labels but cannot create unscoped reservations", () => {
  const result = run([], {
    issuesForPrMetadata: [
      {
        issueRef: "MAIN-1",
        labels: ["risk-schema"],
        stateType: "started",
        footprint: ["other/project"],
      },
    ],
    pullRequests: [{ number: 1, issueRef: "MAIN-1" }],
  });
  assert.deepEqual(result.dispatches, []);
  assert.deepEqual(result.pullRequests[0].footprint, []);
  assert.deepEqual(result.pullRequests[0].issueLabels, ["risk-schema"]);
});

test("possible associations protect delivery and retain a medium risk floor", () => {
  const result = run([], {
    issuesForPrMetadata: [
      { issueRef: "MAIN-1", labels: ["risk-docs"] },
      { issueRef: "MAIN-2", labels: ["risk-schema"] },
    ],
    pullRequests: [{ number: 1, possibleIssueRefs: ["MAIN-1", "MAIN-2"] }],
  });
  assert.equal(result.pullRequests[0].riskTier, "medium");
  assert.equal(riskTier(result.pullRequests[0], { lowRiskLabels: ["risk-docs"] }), "high");
  assert.ok(
    issuesWithDeliveryEvidence([{ issueRef: "MAIN-1" }, { issueRef: "MAIN-2" }], result).every(
      (issue) => issue.openPr,
    ),
  );
});

test("dependency bots and closed PRs cannot claim delivery", () => {
  const issues = [{ issueRef: "MAIN-1" }, { issueRef: "MAIN-2" }];
  const enriched = issuesWithDeliveryEvidence(issues, {
    pullRequests: [
      { number: 1, issueRef: "MAIN-1", author: "dependabot[bot]" },
      { number: 2, issueRef: "MAIN-2", state: "closed" },
    ],
  });
  assert.deepEqual(
    enriched.map((issue) => issue.openPr),
    [false, false],
  );
});

test("opaque worker refs count exactly and missing refs fail loudly", () => {
  assert.equal(activeWorkerCapacity({ dispatches: [worker("Case"), worker("case")] }).used, 2);
  assert.throws(
    () => activeWorkerCapacity({ dispatches: [{ issueRef: "MAIN-1", sessionId: "one" }] }),
    /workerRef is required/,
  );
});

test("receipt aliases coalesce transitively without depending on record order", () => {
  const records = [
    worker("one", "MAIN-1", { receiptId: "a" }),
    worker("one", "MAIN-1", { receiptId: "b" }),
    { receiptId: "b", workerRef: "receipt:b", issueRef: "MAIN-1" },
    { receiptId: "a", workerRef: "receipt:a", issueRef: "MAIN-1" },
  ];
  for (const items of [
    records,
    [...records].reverse(),
    [records[2], records[3], records[0], records[1]],
  ]) {
    const result = run(items);
    assert.equal(result.dispatches.length, 1);
    assert.equal(result.dispatches[0].workerRef, "session:one");
    assert.equal(activeWorkerCapacity(result).used, 1);
  }
});

test("absorbed worktree reservations retain delivery protection for a different explicit issue", () => {
  const result = run([worker("one", "MAIN-1", { worktree: "/tmp/shared" })], {
    snapshot: {
      worktrees: [{ path: "/tmp/shared", issueRef: "MAIN-2", dirty: true, footprint: ["src/hot"] }],
    },
  });
  assert.equal(result.dispatches.length, 1);
  assert.equal(activeWorkerCapacity(result).used, 1);
  assert.ok(
    issuesWithDeliveryEvidence([{ issueRef: "MAIN-1" }, { issueRef: "MAIN-2" }], result).every(
      (issue) => issue.activeClaim,
    ),
  );
});

test("historical terminal receipts cannot retire or contradict a current live observation", () => {
  const result = run(
    [
      {
        receiptId: "reused",
        workerRef: "receipt:reused",
        issueRef: "MAIN-1",
        state: "completed",
        footprint: ["src/old"],
      },
      worker("live", "MAIN-2", { receiptId: "reused", footprint: ["src/current"] }),
    ],
    { pullRequests: [{ number: 1, issueRef: "MAIN-1" }] },
  );
  assert.equal(activeWorkerCapacity(result).used, 1);
  assert.equal(result.dispatches[0].issueRef, "MAIN-2");
  assert.deepEqual(result.pullRequests[0].footprint, ["src/old"]);
});

test("worker observations protect delivery and coalesce with an explicit session receipt", () => {
  const result = reconcileActiveDelivery({
    state: {
      workers: [worker("one", "MAIN-1", { footprint: ["src/worker"] })],
      dispatches: [worker("one", "MAIN-1", { footprint: ["src/receipt"] })],
    },
  });
  assert.equal(result.dispatches.length, 1);
  assert.equal(activeWorkerCapacity(result).used, 1);
  assert.deepEqual(result.dispatches[0].footprint, ["src/receipt", "src/worker"]);
  assert.equal(issuesWithDeliveryEvidence([{ issueRef: "MAIN-1" }], result)[0].activeClaim, true);
});

test("inactive tracker metadata enriches each live worker without coalescing their slots", () => {
  const result = run([worker("one"), worker("two")], {
    snapshot: {
      linear: { issues: [{ issueRef: "MAIN-1", activeClaim: false, footprint: ["src/tracker"] }] },
    },
    pullRequests: [{ number: 1, issueRef: "MAIN-1" }],
  });
  assert.equal(result.dispatches.length, 2);
  assert.equal(activeWorkerCapacity(result).used, 2);
  assert.ok(result.dispatches.every((item) => item.footprint.includes("src/tracker")));
  assert.deepEqual(result.pullRequests[0].footprint, ["src/tracker"]);
});

test("unknown branch-only worktrees keep truthful zero-slot reservations", () => {
  const result = reconcileActiveDelivery({
    snapshot: { worktrees: [{ branch: "unrelated-feature", dirty: true, footprint: ["src/hot"] }] },
  });
  assert.equal(result.dispatches.length, 1);
  assert.equal(result.dispatches[0].branch, "unrelated-feature");
  assert.equal(result.dispatches[0].issueRef, null);
  assert.equal(activeWorkerCapacity(result).used, 0);
});

for (const state of ["running", undefined]) {
  test(`a PR link alone does not retire normalized worker lifecycle ${state ?? "unspecified"}`, () => {
    const result = run(
      [worker("one", "MAIN-1", { hasPr: true, state, footprint: ["src/worker"] })],
      {
        pullRequests: [{ number: 1, issueRef: "MAIN-1" }],
      },
    );
    assert.equal(activeWorkerCapacity(result).used, 1);
    assert.equal(result.dispatches.length, 1);
    assert.deepEqual(result.pullRequests[0].footprint, ["src/worker"]);
  });
}

for (const state of ["ended", "finished", "canceled", "done", "merged", "closed"]) {
  test(`terminal ${state} lifecycle releases slots and retains linked PR footprint`, () => {
    const result = run([worker("one", "MAIN-1", { state, footprint: ["src/worker"] })], {
      pullRequests: [{ number: 1, issueRef: "MAIN-1" }],
    });
    assert.equal(activeWorkerCapacity(result).used, 0);
    assert.equal(result.dispatches.length, 0);
    assert.deepEqual(result.pullRequests[0].footprint, ["src/worker"]);
  });
}

test("tracker claims preserve explicit worktree metadata to absorb matching file reservations", () => {
  const result = reconcileActiveDelivery({
    snapshot: {
      linear: {
        activeIssues: [
          {
            issueRef: "MAIN-1",
            activeClaim: true,
            sessionId: "one",
            workerRef: "session:one",
            worktree: "/tmp/shared",
            branch: "known-work",
            footprint: ["src/tracker"],
          },
          {
            issueRef: "MAIN-1",
            activeClaim: true,
            sessionId: "two",
            workerRef: "session:two",
            path: "/tmp/shared",
            branch: "known-work",
          },
        ],
      },
      worktrees: [
        { path: "/tmp/shared", branch: "known-work", dirty: true, footprint: ["src/worktree"] },
      ],
    },
  });
  assert.equal(result.dispatches.length, 2);
  assert.equal(activeWorkerCapacity(result).used, 2);
  assert.ok(
    result.dispatches.every(
      (item) => item.worktree === "/tmp/shared" && item.branch === "known-work",
    ),
  );
  assert.ok(result.dispatches.every((item) => item.footprint.includes("src/worktree")));
});
