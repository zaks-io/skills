import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve(import.meta.dirname, "../skills/ziw-orchestrate/scripts/tick-plan.mjs");
const fixtures = path.join(import.meta.dirname, "fixtures/delivery-contract");
const uuid = "11111111-2222-4333-8444-555555555555";
const otherUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const issue = (reference = { issueKey: "ZAK-12", issueUuid: uuid }, extra = {}) => ({
  ...reference,
  state: "Todo",
  stateType: "unstarted",
  labels: ["kind-slice", "ready-for-agent", "example/repo"],
  footprint: ["src/candidate.ts"],
  ...extra,
});
const input = (issues = [issue()], state = {}, prs = []) => ({
  snapshot: { v: 3, repo: "example/repo", linear: { issues }, prs },
  state,
  config: { workerConcurrencyCap: 4, mergeAuthority: "agent", requireConformanceEvidence: false },
});
const worker = (reference = { issueUuid: uuid }, extra = {}) => ({
  ...reference,
  sessionId: "worker-1",
  state: "running",
  footprint: ["src/active.ts"],
  ...extra,
});
const pr = (reference = { issueUuid: uuid }, extra = {}) => ({
  ...reference,
  number: 22,
  state: "open",
  isDraft: true,
  changedFiles: 1,
  footprint: ["src/pr.ts"],
  ...extra,
});

function invoke(value, debug = false, overrideState) {
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-delivery-contract-"));
  try {
    const file = path.join(directory, "input.json");
    writeFileSync(file, JSON.stringify(value));
    const flags = [];
    if (overrideState !== undefined) {
      const stateFile = path.join(directory, "state.json");
      writeFileSync(stateFile, JSON.stringify(overrideState));
      flags.push("--state", stateFile);
    }
    return spawnSync(process.execPath, [script, file, ...flags, ...(debug ? ["--debug"] : [])], {
      encoding: "utf8",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const decisions = (plan) => ({
  capacity: plan.capacity,
  actions: plan.actions.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  holds: plan.holds.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  waits: plan.waits.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  warnings: plan.warnings.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  wake: plan.wake,
});
function plans(value, overrideState) {
  const outputs = [false, true].map((debug) => {
    const result = invoke(value, debug, overrideState);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  });
  assert.deepEqual(
    decisions(outputs[0]),
    decisions(outputs[1]),
    "compact/debug decisions disagree",
  );
  return outputs[1];
}
const starts = (plan) => plan.actions.filter((action) => action.kind === "dispatch");
test("identity-only corroborating receipt inherits the confirmed worker association", () => {
  const value = input([issue()], {
    dispatches: [worker(undefined, { receiptId: "receipt-1" })],
    workers: [{ receiptId: "receipt-1", state: "running" }],
  });
  const plan = plans(value);
  assert.equal(plan.capacity.used, 1);
  assert.equal(
    plan.warnings.some((warning) => warning.reason === "WORKER_ISSUE_UNRESOLVED"),
    false,
  );
  assert.deepEqual(starts(plan), []);
});
const held = (plan, reference = "ZAK-12") => {
  assert.equal(
    starts(plan).some((action) => action.target === `ticket:${reference}`),
    false,
  );
  assert.ok(
    plan.holds.some(
      (hold) => hold.target === `ticket:${reference}` && hold.reason === "DELIVERY_ALREADY_ACTIVE",
    ),
  );
};

for (const [name, tracker, reference, target] of [
  ["UUID alias", { issueKey: "ZAK-12", issueUuid: uuid }, { issueUuid: uuid }, "ZAK-12"],
  ["key alias", { issueKey: "ZAK-12", issueUuid: uuid }, { issueKey: "zak-12" }, "ZAK-12"],
  ["UUID-only", { issueUuid: uuid }, { issueUuid: uuid }, uuid],
  ["key-only", { issueKey: "ZAK-12" }, { issueKey: "ZAK-12" }, "ZAK-12"],
  [
    "locally mixed unverified UUID",
    { issueKey: "ZAK-12" },
    { issueUuid: uuid, issueKey: "ZAK-12" },
    "ZAK-12",
  ],
]) {
  for (const kind of ["worker", "PR"]) {
    test(`${name} ${kind} prevents duplicate delivery with distinct footprints`, () => {
      const value = input(
        [issue(tracker)],
        kind === "worker" ? { dispatches: [worker(reference)] } : {},
        kind === "PR" ? [pr(reference)] : [],
      );
      const plan = plans(value);
      held(plan, target);
      assert.equal(plan.capacity.used, kind === "worker" ? 1 : 0);
    });
  }
}

for (const kind of ["worker", "PR"]) {
  test(`unresolved UUID ${kind} holds starts when key-only catalog cannot prove the association`, () => {
    const value = input(
      [issue({ issueKey: "ZAK-12" })],
      kind === "worker" ? { dispatches: [worker()] } : {},
      kind === "PR" ? [pr()] : [],
    );
    const plan = plans(value);
    assert.deepEqual(starts(plan), []);
    assert.deepEqual(plan.decisions.linearDag.starts, []);
    assert.deepEqual(plan.decisions.linearDag.readyStarts, []);
    assert.equal(
      plan.decisions.linearDag.nodes.some((node) => node.startable),
      false,
    );
    assert.equal(plan.counts.linearDagStarts, 0);
    assert.equal(plan.counts.linearDagReadyStarts, 0);
    assert.match(JSON.stringify(plan), /ISSUE_ALIAS_REQUIRED/);
    assert.match(JSON.stringify(plan), /lookup|resolve|tracker|alias/i);
  });
}

test("an unresolved UUID in typed linkedIssues holds starts against a partial catalog", () => {
  const plan = plans(
    input([issue({ issueKey: "ZAK-12" })], {}, [pr({}, { linkedIssues: [{ issueUuid: uuid }] })]),
  );
  assert.deepEqual(starts(plan), []);
  assert.match(JSON.stringify(plan), /ISSUE_ALIAS_REQUIRED/);
  assert.match(JSON.stringify(plan), /linkedIssues\/0/);
});

for (const spelling of ["ZAK-12", uuid, "arbitrary-session"]) {
  test(`opaque session and receipt spelling ${spelling} cannot claim an issue`, () => {
    const value = input([issue()], {
      dispatches: [worker({ issueKey: "ZAK-13" }, { sessionId: spelling, receiptId: spelling })],
    });
    const plan = plans(value);
    assert.deepEqual(
      starts(plan).map((action) => action.target),
      ["ticket:ZAK-12"],
    );
    assert.equal(plan.capacity.used, 1);
  });
}

for (const field of ["sessionId", "receiptId"]) {
  test(`two ${field} identities covering one issue count as two workers`, () => {
    const records = [
      worker(
        { issueUuid: uuid },
        {
          [field]: "first",
          sessionId: field === "receiptId" ? undefined : "first",
          branch: "shared",
          headSha: "baseline",
          worktree: "/tmp/shared",
        },
      ),
      worker(
        { issueKey: "ZAK-12" },
        {
          [field]: "second",
          sessionId: field === "receiptId" ? undefined : "second",
          branch: "shared",
          headSha: "baseline",
          worktree: "/tmp/shared",
        },
      ),
    ];
    const plan = plans(input([issue()], { dispatches: records }));
    assert.equal(plan.capacity.used, 2);
    held(plan);
  });
}

test("duplicate observations of one explicit session count once and union footprints", () => {
  const plan = plans(
    input([issue(), issue({ issueKey: "ZAK-13" }, { footprint: ["src/second.ts"] })], {
      dispatches: [worker({}, { issueKey: "ZAK-12", footprint: ["src/first.ts"] })],
      workers: [worker({}, { issueUuid: uuid, footprint: ["src/second.ts"] })],
    }),
  );
  assert.equal(plan.capacity.used, 1);
  held(plan);
  assert.deepEqual(starts(plan), []);
  assert.ok(
    plan.holds.some((hold) => hold.target === "ticket:ZAK-13" && hold.reason === "FILE_COLLISION"),
  );
});

test("receipt-only worker observation joins its dispatch session before CLI capacity counting", () => {
  const plan = plans(
    input(
      [
        issue(),
        issue({ issueKey: "ZAK-13", issueUuid: otherUuid }, { footprint: ["src/unrelated.ts"] }),
      ],
      {
        dispatches: [
          worker({ issueKey: "ZAK-12" }, { sessionId: "session-1", receiptId: "receipt-1" }),
        ],
        workers: [worker({ issueUuid: uuid }, { sessionId: undefined, receiptId: "receipt-1" })],
      },
    ),
  );
  assert.equal(plan.capacity.used, 1);
  assert.equal(plan.decisions.activeDispatches.filter((record) => record.workerRef).length, 1);
  held(plan);
  assert.deepEqual(
    starts(plan).map((action) => action.target),
    ["ticket:ZAK-13"],
  );
});

for (const explicit of [true, false]) {
  for (const scoped of [false, true]) {
    test(`${scoped ? "scoped" : "unscoped"} repair worker PR association ${explicit ? "resolves explicit links and permits unrelated starts" : "does not promote branch hints to explicit links"}`, () => {
      const value = input(
        [
          issue(),
          issue({ issueKey: "ZAK-13", issueUuid: otherUuid }, { footprint: ["src/unrelated.ts"] }),
        ],
        {
          dispatches: [
            worker(
              {},
              {
                sessionId: "repair-1",
                prNumber: 22,
                ...(explicit ? { branch: "codex/zak-13-old-hint" } : {}),
              },
            ),
          ],
        },
        [
          pr(
            {},
            explicit
              ? { linkedIssues: [{ issueUuid: uuid }] }
              : { headRefName: "codex/zak-12-repair" },
          ),
        ],
      );
      if (scoped) value.state.scopeIssues = [{ issueKey: "ZAK-13" }];
      const plan = plans(value);
      assert.equal(plan.capacity.used, 1);
      if (!scoped) held(plan);
      if (explicit) {
        assert.deepEqual(
          starts(plan).map((action) => action.target),
          ["ticket:ZAK-13"],
        );
        assert.equal(
          plan.warnings.some((warning) => warning.reason === "WORKER_ISSUE_UNRESOLVED"),
          false,
        );
      } else {
        assert.deepEqual(starts(plan), []);
        assert.ok(plan.warnings.some((warning) => warning.reason === "WORKER_ISSUE_UNRESOLVED"));
      }
    });
  }
}

for (const scoped of [false, true]) {
  test(`${scoped ? "scoped" : "unscoped"} session-only runtime observation inherits its tracker claim and clears obsolete text hints`, () => {
    const value = input(
      [
        issue(),
        issue({ issueKey: "ZAK-13", issueUuid: otherUuid }, { footprint: ["src/unrelated.ts"] }),
      ],
      {
        dispatches: [
          worker({}, { sessionId: "confirmed-session", branch: "codex/zak-13-old-hint" }),
        ],
      },
    );
    value.snapshot.linear.activeIssues = [
      issue(
        { issueKey: "ZAK-12", issueUuid: uuid },
        {
          sessionId: "confirmed-session",
          activeClaim: true,
          state: "In Progress",
          stateType: "started",
          footprint: ["src/active.ts"],
        },
      ),
    ];
    if (scoped) value.state.scopeIssues = [{ issueKey: "ZAK-13" }];
    const plan = plans(value);
    assert.equal(plan.capacity.used, 1);
    assert.deepEqual(
      starts(plan).map((action) => action.target),
      ["ticket:ZAK-13"],
    );
    assert.equal(
      plan.warnings.some((warning) => warning.reason === "WORKER_ISSUE_UNRESOLVED"),
      false,
    );
    assert.equal(plan.decisions.activeDispatches[0].issueRef, "ZAK-12");
    if (!scoped) held(plan);
  });
}

test("one session cannot cover a multi-issue PR and a disjoint direct issue", () => {
  const value = input(
    [issue(), issue({ issueKey: "ZAK-13", issueUuid: otherUuid }), issue({ issueKey: "ZAK-14" })],
    {
      dispatches: [
        worker({}, { sessionId: "same-session", prNumber: 22 }),
        worker({ issueKey: "ZAK-14" }, { sessionId: "same-session" }),
      ],
    },
    [pr({}, { linkedIssues: [{ issueUuid: uuid }, { issueUuid: otherUuid }] })],
  );
  for (const debug of [false, true]) {
    const result = invoke(value, debug);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /worker.*issueRef.*conflict/i);
  }
});

test("legacy anonymous state receipts keep observation and lifecycle semantics beside a v3 snapshot", () => {
  const canonical = input();
  const legacy = structuredClone(canonical);
  legacy.snapshot.v = 2;
  legacy.snapshot.linear.issues = [
    {
      identifier: "ZAK-12",
      id: uuid,
      state: "Todo",
      stateType: "unstarted",
      labels: ["kind-slice", "ready-for-agent", "example/repo"],
      footprint: ["src/candidate.ts"],
    },
  ];
  for (const [lifecycle, live] of [
    [{ state: "running" }, true],
    [{ hasPr: true }, false],
    [{ hasPr: true, state: "running" }, true],
    [{ hasPr: true, state: "returned", returned: true }, false],
  ]) {
    const state = { dispatches: [{ issueId: uuid, footprint: ["src/active.ts"], ...lifecycle }] };
    const canonicalPlan = plans(canonical, state);
    const legacyPlan = plans(legacy, state);
    assert.deepEqual(decisions(canonicalPlan), decisions(legacyPlan));
    assert.equal(canonicalPlan.capacity.used, live ? 1 : 0);
    if (live) {
      held(canonicalPlan);
      assert.ok(canonicalPlan.decisions.activeDispatches[0].workerRef.startsWith("observation:"));
    } else {
      assert.deepEqual(
        starts(canonicalPlan).map((action) => action.target),
        ["ticket:ZAK-12"],
      );
    }
  }
});

test("in-scope issue evidence cannot authorize a label action on an out-of-scope PR", () => {
  const value = input(
    [issue(), issue({ issueKey: "ZAK-13", issueUuid: otherUuid })],
    {
      scopeIssues: [{ issueKey: "ZAK-12" }],
      reviewEvidenceChecks: [
        { issueKey: "ZAK-12", prNumber: 22, hasReviewEvidence: true, blockingFindings: true },
        { issueKey: "ZAK-12", prNumber: 23, hasReviewEvidence: true, blockingFindings: true },
      ],
    },
    [pr(), pr({ issueUuid: otherUuid }, { number: 23 })],
  );
  const plan = plans(value);
  assert.ok(
    plan.actions.some(
      (action) => action.target === "pr:22" && action.kind === "clear-review-evidence",
    ),
  );
  assert.equal(
    plan.actions.some((action) => action.target === "pr:23"),
    false,
  );
  assert.equal(
    plan.decisions.reviewEvidence.some((record) => record.actionTarget === "pr:23"),
    false,
  );
});

test("a sessionless observation cannot collapse into a session merely by covering its issue", () => {
  const value = input();
  value.snapshot.v = 2;
  value.snapshot.linear.issues = [
    {
      identifier: "ZAK-12",
      id: uuid,
      footprint: ["src/candidate.ts"],
      labels: ["kind-slice", "ready-for-agent"],
      state: "Todo",
      stateType: "unstarted",
    },
  ];
  value.state.dispatches = [
    { issueId: "ZAK-12", state: "running" },
    { issueId: uuid, sessionId: "known-session", state: "running" },
  ];
  const plan = plans(value);
  assert.equal(plan.capacity.used, 2);
  held(plan);
});

test("a linked PR preserves the running worker slot until lifecycle evidence returns it", () => {
  for (const returned of [false, true]) {
    const value = input(
      [issue(), issue({ issueKey: "ZAK-13" }, { footprint: ["src/active.ts"] })],
      {
        dispatches: [
          worker(
            {},
            {
              issueKey: "ZAK-12",
              prNumber: 22,
              hasPr: true,
              returned,
              state: returned ? "returned" : "running",
            },
          ),
        ],
      },
      [pr()],
    );
    const plan = plans(value);
    assert.equal(plan.capacity.used, returned ? 0 : 1);
    held(plan);
    assert.deepEqual(starts(plan), []);
    assert.ok(
      plan.holds.some(
        (hold) => hold.target === "ticket:ZAK-13" && hold.reason === "FILE_COLLISION",
      ),
    );
  }
});

test("authoritative scope aliases select the same PR actions and never widen the queue", () => {
  const base = input([issue(), issue({ issueKey: "ZAK-13", issueUuid: otherUuid })], {}, [
    pr(),
    pr({ issueKey: "ZAK-13" }, { number: 23 }),
  ]);
  const byKey = plans({ ...base, state: { scopeIssues: [{ issueKey: "ZAK-12" }] } });
  const byUuid = plans({ ...base, state: { scopeIssues: [{ issueUuid: uuid }] } });
  assert.deepEqual(decisions(byKey), decisions(byUuid));
  assert.ok(
    byKey.actions.some((action) => action.target === "pr:22" && action.kind === "repair-draft"),
  );
  assert.equal(
    byKey.actions.some((action) => action.target === "pr:23"),
    false,
  );
});

test("branch and title hints guard delivery but cannot authorize scoped PR mutation", () => {
  const plan = plans(
    input([issue()], { scopeIssues: [{ issueUuid: uuid }] }, [
      pr({}, { title: "ZAK-12 browsing", headRefName: "codex/phase-2-zak-12-browsing" }),
    ]),
  );
  held(plan);
  assert.equal(
    plan.actions.some((action) => action.target === "pr:22"),
    false,
  );
});

test("typed linkedIssues establish scoped PR association without a scalar reference", () => {
  const plan = plans(
    input([issue()], { scopeIssues: [{ issueKey: "ZAK-12" }] }, [
      pr({}, { linkedIssues: [{ issueUuid: uuid }] }),
    ]),
  );
  held(plan);
  assert.ok(
    plan.actions.some((action) => action.target === "pr:22" && action.kind === "repair-draft"),
  );
});

test("ambiguous branch hints hold every possible delivery while preserving scoped authority", () => {
  const value = input(
    [issue(), issue({ issueKey: "ZAK-13", issueUuid: otherUuid })],
    {
      scopeIssues: [{ issueKey: "ZAK-12" }, { issueKey: "ZAK-13" }],
    },
    [pr({}, { headRefName: "codex/zak-12-zak-13-combined" })],
  );
  const plan = plans(value);
  held(plan, "ZAK-12");
  held(plan, "ZAK-13");
  assert.equal(
    plan.actions.some((action) => action.target === "pr:22"),
    false,
  );
});

test("worktree paths reserve files without inventing issue identity or occupying worker capacity", () => {
  const value = input();
  value.snapshot.worktrees = [
    {
      path: "/tmp/review-main-2855565",
      branch: "chore/skills-2026",
      dirty: true,
      mergedIntoBaseline: false,
      footprint: ["src/candidate.ts"],
    },
  ];
  const plan = plans(value);
  assert.equal(plan.capacity.used, 0);
  assert.deepEqual(starts(plan), []);
  assert.ok(
    plan.holds.some((hold) => hold.target === "ticket:ZAK-12" && hold.reason === "FILE_COLLISION"),
  );
  assert.equal(
    plan.holds.some((hold) => /ticket:(MAIN|SKILLS)-/.test(hold.target)),
    false,
  );
});

test("an unknown requested issue cannot widen scope or dispatch a known candidate", () => {
  const plan = plans(input([issue()], { scopeIssues: [{ issueUuid: otherUuid }] }, [pr()]));
  assert.deepEqual(starts(plan), []);
  assert.equal(
    plan.actions.some((action) => action.target === "pr:22"),
    false,
  );
  assert.match(JSON.stringify(plan), /REQUESTED_ISSUE_UNKNOWN/);
});

test("candidate UUID scope and normalized dependency joins share the same identity catalog", () => {
  const value = input([
    issue({ issueKey: "ZAK-12", issueUuid: uuid }, { footprint: ["src/parent.ts"] }),
    issue(
      { issueKey: "ZAK-13", issueUuid: otherUuid },
      { blockedBy: [{ issueUuid: uuid, stateType: "unstarted" }], footprint: ["src/child.ts"] },
    ),
  ]);
  value.snapshot.linear.candidateIssues = [{ issueUuid: otherUuid }];
  const blocked = plans(value);
  assert.deepEqual(starts(blocked), []);
  value.snapshot.linear.issues[0].stateType = "completed";
  value.snapshot.linear.issues[0].state = "Done";
  value.snapshot.linear.issues[1].blockedBy[0].stateType = "completed";
  const unblocked = plans(value);
  assert.deepEqual(
    starts(unblocked).map((action) => action.target),
    ["ticket:ZAK-13"],
  );
});

test("issue metadata matched by UUID retains security risk on a ready PR", () => {
  const value = input([], {}, [
    pr(
      { issueUuid: uuid },
      {
        isDraft: false,
        headSha: "head",
        changedFiles: 2,
        checks: { state: "SUCCESS" },
        latestReviews: { first: { state: "APPROVED", headSha: "head" } },
      },
    ),
  ]);
  value.snapshot.linear.issueMetadata = [
    issue({ issueKey: "ZAK-12", issueUuid: uuid }, { labels: ["risk-security-sensitive"] }),
  ];
  value.config.requiredIndependentReviews = { low: 1, medium: 1, high: 2 };
  const plan = plans(value);
  assert.equal(
    plan.actions.some((action) => action.kind === "arm-auto-merge"),
    false,
  );
  assert.ok(
    plan.actions.some((action) => action.target === "pr:22" && action.kind === "request-review"),
  );
});

test("reordering tracker aliases and worker observations leaves semantic decisions unchanged", () => {
  const value = input(
    [issue(), issue({ issueKey: "ZAK-13", issueUuid: otherUuid }, { footprint: ["src/other.ts"] })],
    { dispatches: [worker(), worker({ issueKey: "ZAK-13" }, { sessionId: "worker-2" })] },
  );
  value.snapshot.linear.issueMetadata = [
    { issueUuid: uuid },
    { issueKey: "ZAK-12", issueUuid: uuid },
  ];
  const first = plans(value);
  value.snapshot.linear.issues.reverse();
  value.snapshot.linear.issueMetadata.reverse();
  value.state.dispatches.reverse();
  assert.deepEqual(decisions(first), decisions(plans(value)));
});

test("adding corroborating receipts and a linked PR never enables duplicate delivery", () => {
  const value = input([issue()], { dispatches: [worker()] });
  const first = plans(value);
  value.state.workers = [worker({ issueKey: "ZAK-12" }, { receiptId: "corroboration" })];
  value.snapshot.prs = [pr({ issueKey: "ZAK-12" })];
  const corroborated = plans(value);
  held(first);
  held(corroborated);
  assert.equal(corroborated.capacity.used, 1);
});

for (const [name, value, diagnostic] of [
  ["malformed key", input([issue({ issueKey: "not a ticket" })]), /issueKey/],
  ["malformed UUID", input([issue({ issueUuid: "not-a-uuid" })]), /issueUuid/],
  [
    "contradictory tracker alias",
    input([issue(), issue({ issueKey: "ZAK-13", issueUuid: uuid })]),
    /linear\/issues\/1.*contradict/i,
  ],
  [
    "contradictory worker identity",
    input([issue()], { dispatches: [worker({ issueKey: "ZAK-13", issueUuid: uuid })] }),
    /dispatches\/0.*contradict/i,
  ],
  [
    "contradictory scoped identity",
    input([issue()], { scopeIssues: [{ issueKey: "ZAK-13", issueUuid: uuid }] }),
    /scopeIssues\/0.*contradict/i,
  ],
  [
    "contradictory linked PR identity",
    input([issue()], {}, [pr({}, { linkedIssues: [{ issueKey: "ZAK-13", issueUuid: uuid }] })]),
    /prs\/0\/linkedIssues\/0.*contradict/i,
  ],
  [
    "contradictory session association",
    input([issue(), issue({ issueKey: "ZAK-13", issueUuid: otherUuid })], {
      dispatches: [worker(), worker({ issueUuid: otherUuid })],
    }),
    /session|worker/i,
  ],
  [
    "contradictory lifecycle",
    input([issue()], { dispatches: [worker({}, { returned: true })] }),
    /dispatches\/0.*lifecycle/i,
  ],
  [
    "generic v3 worker ID",
    input([issue()], { dispatches: [{ id: "ZAK-12", state: "running" }] }),
    /id/i,
  ],
]) {
  test(`${name} is rejected before producing unsafe actions`, () => {
    for (const debug of [false, true]) {
      const result = invoke(value, debug);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout.trim(), "");
      assert.match(result.stderr, diagnostic);
    }
  });
}

const historical = {
  "unresolved-uuid-worker": "ZAK-12",
  "unresolved-uuid-pr": "ZAK-12",
  "uuid-ledger-claim": "ZAK-12",
  "plain-issue-branch": "ZAK-12",
  "prefixed-issue-branch": "ZAK-12",
  "mixed-worker": "ZAK-12",
  "mixed-pr": "ZAK-12",
  "mixed-generic-worker": uuid,
  "mixed-generic-pr": uuid,
  "existing-pr": "TEST-1",
  "existing-pr-distinct-footprint": "TEST-1",
  "pseudo-ticket-reservations": null,
  "no-review-verdict": null,
  "other-repo": null,
  overlap: null,
  "overlap-with-footprint": null,
  "in-progress-overlap": null,
  "budget-hard-stop": null,
  "budget-hard-stop-routed": null,
  "worker-cap-undercount": null,
};
for (const [name, reference] of Object.entries(historical)) {
  test(`historical CLI reproducer ${name}`, () => {
    const value = JSON.parse(readFileSync(path.join(fixtures, `${name}.json`), "utf8"));
    const plan = plans(value);
    if (reference) held(plan, reference);
    if (["unresolved-uuid-pr", "mixed-pr", "mixed-generic-pr"].includes(name))
      assert.ok(
        plan.actions.some((action) => action.target === "pr:22" && action.kind === "repair-draft"),
      );
    if (name === "pseudo-ticket-reservations") {
      assert.equal(plan.capacity.used, 1);
      assert.equal(
        plan.holds.some((hold) => /MAIN-2855565|SKILLS-2026/.test(hold.target)),
        false,
      );
    }
    if (name === "no-review-verdict")
      assert.equal(
        plan.actions.some((action) => action.kind === "arm-auto-merge"),
        false,
      );
    if (
      [
        "other-repo",
        "overlap-with-footprint",
        "in-progress-overlap",
        "budget-hard-stop",
        "budget-hard-stop-routed",
        "worker-cap-undercount",
      ].includes(name)
    )
      assert.deepEqual(starts(plan), []);
    if (name === "worker-cap-undercount") assert.equal(plan.capacity.used, 2);
    if (name === "overlap")
      assert.ok(
        plan.actions.some((action) => action.target === "pr:1" && action.kind === "repair-draft"),
      );
  });
}
