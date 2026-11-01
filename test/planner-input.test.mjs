import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const skill = path.join(root, "skills/ziw-orchestrate");
const script = path.join(skill, "scripts/tick-plan.mjs");
const snapshot = { v: 3, repo: "zaks-io/example", prs: [], linear: { issues: [] } };

function run(t, input, { config, state, args = [], command = script, raw = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-input-contract-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "input.json");
  if (!raw && input && !Array.isArray(input) && typeof input === "object") {
    input = structuredClone(input);
    for (const name of ["state", "queue"])
      if (input[name] && !Array.isArray(input[name]) && typeof input[name] === "object")
        input[name] = { v: 3, repo: snapshot.repo, ...input[name] };
  }
  writeFileSync(file, raw ? input : JSON.stringify(input));
  const flags = [];
  for (const [name, value] of Object.entries({ config, state })) {
    if (value === undefined) continue;
    const override = path.join(dir, `${name}.json`);
    writeFileSync(
      override,
      JSON.stringify(
        name === "state" && value && typeof value === "object" && !Array.isArray(value)
          ? { v: 3, repo: snapshot.repo, ...value }
          : value,
      ),
    );
    flags.push(`--${name}`, override);
  }
  return spawnSync(process.execPath, [command, file, ...flags, ...args], { encoding: "utf8" });
}

function rejected(result, field) {
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "", "invalid input must not emit a plan");
  assert.match(result.stderr, field);
}

for (const [name, input, field] of [
  ["null input", null, /input: must be object/],
  ["array input", [], /input: must be object/],
  ["missing repository", { v: 3 }, /missing repo identity|repo/],
  ["unknown envelope field", { snapshot, configs: {} }, /input\/configs/],
  ["null config", { snapshot, config: null }, /input\/config/],
  ["array state", { snapshot, state: [] }, /input\/state|retired format/],
  ["policy typo", { snapshot, config: { workerConcurencyCap: 2 } }, /workerConcurencyCap/],
  [
    "string boolean",
    { snapshot, config: { requireConformanceEvidence: "false" } },
    /requireConformanceEvidence/,
  ],
  ["string number", { snapshot, config: { workerConcurrencyCap: "3" } }, /workerConcurrencyCap/],
  [
    "fractional capacity",
    { snapshot, config: { workerConcurrencyCap: 1.5 } },
    /workerConcurrencyCap/,
  ],
  [
    "invalid hosted bot list",
    { snapshot, config: { hostedReviewBots: "coderabbitai" } },
    /hostedReviewBots/,
  ],
  [
    "invalid hosted tier",
    { snapshot, config: { hostedReviewRiskTiers: "critical" } },
    /hostedReviewRiskTiers/,
  ],
  [
    "invalid review author type",
    {
      snapshot: {
        ...snapshot,
        prs: [
          {
            number: 1,
            latestReviews: { reviewer: { state: "APPROVED", authorType: "Organization" } },
          },
        ],
      },
    },
    /authorType/,
  ],
  ["unknown delivery mode", { snapshot, config: { deliveryMode: "velocty" } }, /deliveryMode/],
  [
    "invalid review depth",
    { snapshot, config: { requiredIndependentReviews: { high: 0 } } },
    /requiredIndependentReviews/,
  ],
  [
    "misplaced authority",
    { snapshot, state: { mergeAuthority: "agent" } },
    /state\/mergeAuthority/,
  ],
  ["collection object", { snapshot: { ...snapshot, prs: {} } }, /snapshot\/prs/],
  ["missing PR identity", { snapshot: { ...snapshot, prs: [{}] } }, /snapshot\/prs\/0/],
  ["missing issue identity", { snapshot, state: { tickets: [{}] } }, /tickets\/0/],
  [
    "missing dispatch identity",
    { snapshot, state: { startableTickets: [{ footprint: ["src"] }] } },
    /startableTickets\/0/,
  ],
  ["malformed evidence map", { snapshot, state: { reviewEvidenceByPr: [] } }, /reviewEvidenceByPr/],
  [
    "evidence typo",
    { snapshot, state: { reviewEvidenceByPr: { 1: { conformnce: "PASS" } } } },
    /conformnce/,
  ],
  [
    "string approval",
    { snapshot, state: { reviewEvidenceByPr: { 1: { reviewEvidenceCurrent: "false" } } } },
    /reviewEvidenceCurrent/,
  ],
  [
    "missing evidence action target",
    { snapshot, state: { reviewEvidenceChecks: [{ hasReviewEvidence: true }] } },
    /reviewEvidenceChecks\/0/,
  ],
  ["repository mismatch", { snapshot, state: { repo: "zaks-io/other" } }, /same repository/],
  ["ambiguous snapshot", { snapshot, repo: "zaks-io/other" }, /not both/],
  [
    "missing budget threshold",
    { snapshot, config: { localBudgetSoftStopPercent: 12 } },
    /thresholds/,
  ],
  [
    "inverted budget thresholds",
    { snapshot, config: { localBudgetSoftStopPercent: 14, localBudgetHardStopPercent: 12 } },
    /soft <= hard/,
  ],
]) {
  test(`planner rejects ${name} before emitting actions`, (t) => rejected(run(t, input), field));
}

test("planner validates each override and cannot hide invalid input behind precedence", (t) => {
  rejected(run(t, snapshot, { config: false }), /--config: must be object/);
  rejected(run(t, snapshot, { state: "invalid" }), /retired format|must be object/);
  rejected(
    run(
      t,
      { snapshot, config: { workerConcurrencyCap: "bad" } },
      {
        config: { workerConcurrencyCap: 2 },
      },
    ),
    /input\/config\/workerConcurrencyCap/,
  );
  rejected(
    run(t, {
      snapshot,
      queue: { activeSignalExpected: "false" },
      state: { activeSignalExpected: false },
    }),
    /queue\/activeSignalExpected/,
  );
});

test("planner preserves documented override precedence and does not coerce values", (t) => {
  const input = {
    snapshot,
    config: { cap: 1 },
    queue: { activeSignalExpected: true },
    state: { activeSignalExpected: false },
  };
  const result = run(t, input, {
    config: { workerConcurrencyCap: 2 },
    state: { startableTickets: [{ issueKey: "SKI-1", footprint: ["src"] }] },
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.capacity.cap, 2);
  assert.equal(plan.actions[0].kind, "dispatch");
  assert.equal(plan.actions[0].target, "ticket:SKI-1");
});

for (const field of ["reviewDiffByPr", "continuationByPr"]) {
  test(`an external empty state file cannot legalize inline canonical ${field} alias keys`, (t) => {
    const pr = {
      number: 12,
      headSha: "inline-head",
      headRefName: "feature/inline",
      url: "https://github.com/zaks-io/example/pull/12",
    };
    for (const alias of [pr.headSha, pr.headRefName, pr.url]) {
      const input = {
        snapshot: { ...snapshot, v: 3, prs: [pr] },
        state: { [field]: { [alias]: field === "reviewDiffByPr" ? "same-diff" : "repair-worker" } },
      };
      for (const args of [[], ["--debug"]])
        rejected(
          run(t, input, { state: {}, args }),
          new RegExp(`state/${field}.*(?:unknown|ambiguous|pattern)`),
        );
    }
  });
}

test("planner rejects missing and unknown CLI options and empty input", (t) => {
  for (const args of [["--config"], ["--state"], ["--confg", "file.json"], ["--config="]]) {
    rejected(run(t, snapshot, { args }), /Unknown option|argument|nonempty|expected a file path/);
  }
  rejected(run(t, "", { raw: true }), /invalid JSON/);
});

test("planner diagnostics never echo rejected values or malformed JSON excerpts", (t) => {
  const marker = "private-diagnostic-value";
  const results = [
    run(t, { snapshot, config: { workerConcurrencyCap: marker } }),
    run(t, `{\"config\":\"${marker}\" broken}`, { raw: true }),
  ];
  for (const result of results) {
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.includes(marker), false);
  }
});

test("copied published skill validates input without repository dependencies", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-contract-install-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const copy = path.join(dir, "ziw-orchestrate");
  cpSync(skill, copy, { recursive: true });
  const command = path.join(copy, "scripts/tick-plan.mjs");
  const valid = run(t, snapshot, { command });
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).wake.state, "delivered");
  rejected(
    run(t, { snapshot, config: { workerConcurrencyCap: "3" } }, { command }),
    /workerConcurrencyCap/,
  );
});

test("a provider review without a commit remains valid but does not authorize merge", (t) => {
  const result = run(t, {
    ...snapshot,
    prs: [
      {
        number: 1,
        headSha: "current-head",
        checks: { state: "SUCCESS" },
        latestReviews: { reviewer: { authorType: "User", state: "APPROVED", headSha: null } },
      },
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(
    plan.actions.some(({ kind }) => kind === "arm-auto-merge"),
    false,
  );
  assert.equal(
    plan.actions.some(({ kind }) => kind === "request-review"),
    true,
  );
});

test("v3 input separates tracker, worker, PR, and worktree identities", async () => {
  const { validateInput } =
    await import("../skills/ziw-orchestrate/scripts/planner-input-validator.mjs");
  const uuid = "11111111-2222-4333-8444-555555555555";
  const fixture = {
    snapshot: {
      v: 3,
      repo: "zaks-io/example",
      prs: [{ number: 1, linkedIssues: [{ issueUuid: uuid }] }],
      worktrees: [{ path: "/repo/worktree", branch: "feature" }],
      linear: {
        issues: [
          {
            issueKey: "SKI-1",
            issueUuid: uuid,
            blockedBy: [{ issueKey: "SKI-2", stateType: "completed" }],
            providerNote: { value: "metadata" },
          },
        ],
        candidateIssues: [{ issueKey: "SKI-1" }],
      },
    },
    state: {
      v: 3,
      repo: snapshot.repo,
      dispatches: [
        { sessionId: uuid, receiptId: "receipt-1", issueKey: "SKI-1", state: "running" },
      ],
      previews: [{ previewId: "preview-1", prNumber: 1 }],
      startableTickets: [{ issueUuid: uuid, footprint: ["src"] }],
      scopeIssues: [{ issueKey: "SKI-1" }],
      reviewEvidenceByPr: { 1: { hasReviewEvidence: true } },
      reviewEvidenceChecks: [{ prNumber: 1, hasReviewEvidence: true }],
    },
  };
  assert.equal(validateInput(fixture), true, JSON.stringify(validateInput.errors));
  const invalid = [
    [
      "issue-key spelling",
      (input) => {
        input.snapshot.linear.issues[0].issueKey = "not-an-issue";
      },
    ],
    [
      "UUID spelling",
      (input) => {
        input.state.startableTickets[0].issueUuid = "not-a-uuid";
      },
    ],
    [
      "legacy tracker ID",
      (input) => {
        input.snapshot.linear.issues[0].id = uuid;
      },
    ],
    [
      "legacy worker ID",
      (input) => {
        input.state.dispatches[0].id = "receipt-1";
      },
    ],
    [
      "generic issue ID",
      (input) => {
        input.state.dispatches[0].issueId = uuid;
      },
    ],
    [
      "legacy PR ID",
      (input) => {
        input.snapshot.prs[0].prId = 1;
      },
    ],
    [
      "missing PR number",
      (input) => {
        delete input.snapshot.prs[0].number;
      },
    ],
    [
      "untyped dependency",
      (input) => {
        input.snapshot.linear.issues[0].blockedBy = ["SKI-2"];
      },
    ],
    [
      "untyped candidate scope",
      (input) => {
        input.snapshot.linear.candidateIssueIds = ["SKI-1"];
      },
    ],
    [
      "untyped explicit scope",
      (input) => {
        input.state.scopeIssueIds = ["SKI-1"];
      },
    ],
    [
      "worker lacks session or receipt",
      (input) => {
        delete input.state.dispatches[0].sessionId;
        delete input.state.dispatches[0].receiptId;
      },
    ],
    [
      "worktree cannot assert an issue",
      (input) => {
        input.snapshot.worktrees[0].issueKey = "SKI-1";
      },
    ],
    [
      "preview lacks preview identity",
      (input) => {
        delete input.state.previews[0].previewId;
      },
    ],
    [
      "PR evidence cannot use a head or ticket key",
      (input) => {
        input.state.reviewEvidenceByPr = { "SKI-1": { hasReviewEvidence: true } };
      },
    ],
  ];
  for (const [name, mutate] of invalid) {
    const input = structuredClone(fixture);
    mutate(input);
    assert.equal(validateInput(input), false, name);
  }
});
