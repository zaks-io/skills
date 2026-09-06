import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const skill = path.join(root, "skills/ziw-orchestrate");
const script = path.join(skill, "scripts/tick-plan.mjs");
const snapshot = { repo: "zaks-io/example", prs: [], linear: { issues: [] } };

function run(t, input, { config, state, args = [], command = script, raw = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-input-contract-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "input.json");
  writeFileSync(file, raw ? input : JSON.stringify(input));
  const flags = [];
  for (const [name, value] of Object.entries({ config, state })) {
    if (value === undefined) continue;
    const override = path.join(dir, `${name}.json`);
    writeFileSync(override, JSON.stringify(value));
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
  ["missing repository", {}, /missing repo identity/],
  ["unknown envelope field", { snapshot, configs: {} }, /input\/configs/],
  ["null config", { snapshot, config: null }, /input\/config/],
  ["array state", { snapshot, state: [] }, /input\/state/],
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
  rejected(run(t, snapshot, { state: "invalid" }), /--state: must be object/);
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
    state: { startableTickets: [{ id: "SKI-1", footprint: ["src"] }] },
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.capacity.cap, 2);
  assert.equal(plan.actions[0].kind, "dispatch");
  assert.equal(plan.actions[0].target, "ticket:SKI-1");
});

test("planner rejects missing and unknown CLI options and empty input", (t) => {
  for (const args of [["--config"], ["--state"], ["--confg", "file.json"], ["--config="]]) {
    rejected(run(t, snapshot, { args }), /invalid arguments|expected a file path/);
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
        latestReviews: { reviewer: { state: "APPROVED", headSha: null } },
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
