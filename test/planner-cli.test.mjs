import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { enrichActions } from "../skills/ziw-orchestrate/scripts/action-briefs.mjs";
import {
  planTick,
  evidenceForPr,
  hostedReviewForPr,
  livePrFacts,
} from "../skills/ziw-orchestrate/scripts/tick-plan.mjs";
import {
  validateInput,
  validateState,
} from "../skills/ziw-orchestrate/scripts/planner-input-validator.mjs";

const scripts = path.resolve("skills/ziw-orchestrate/scripts");
const repo = "example/app";
const run = (name, args, options = {}) =>
  spawnSync(process.execPath, [path.join(scripts, name), ...args], {
    encoding: "utf8",
    ...options,
  });
function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, file: path.join(directory, "state.json") };
}
for (const name of [
  "planner-state.mjs",
  "tick.mjs",
  "tick-snapshot.mjs",
  "tick-plan.mjs",
  "linear-dag-start.mjs",
  "linear-graphql.mjs",
])
  test(`${name}: offline help, unknown option, installed symlink`, (t) => {
    const { directory } = fixture(t);
    const offline = {
      env: {
        ...process.env,
        PATH: directory,
        LINEAR_API_URL: "http://127.0.0.1:1",
        LINEAR_API_KEY: "",
      },
    };
    for (const flag of ["--help", "-h"]) {
      const result = run(name, [flag], offline);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Usage:/);
      assert.equal(result.stderr, "");
    }
    const bad = run(name, ["--unknown-option"], offline);
    assert.equal(bad.status, 1, bad.stderr);
    assert.match(bad.stderr, /unknown-option/);
    assert.match(bad.stderr, /Usage:/);
    mkdirSync(path.join(directory, ".claude/skills"), { recursive: true });
    const link = path.join(directory, ".claude/skills/ziw-orchestrate");
    symlinkSync(path.dirname(scripts), link);
    const linked = spawnSync(process.execPath, [path.join(link, "scripts", name), "--help"], {
      encoding: "utf8",
      ...offline,
    });
    assert.equal(linked.status, 0, linked.stderr);
    assert.match(linked.stdout, /Usage:/);
    const linkedBad = spawnSync(
      process.execPath,
      [path.join(link, "scripts", name), "--unknown-option"],
      { encoding: "utf8", ...offline },
    );
    assert.equal(linkedBad.status, 1);
    assert.match(linkedBad.stderr, /unknown-option/);
  });

test("linear-graphql still accepts -q as the --query alias", (t) => {
  const { directory } = fixture(t);
  const result = run("linear-graphql.mjs", ["query", "-q", "query { viewer { id } }"], {
    env: {
      ...process.env,
      PATH: directory,
      LINEAR_API_URL: "http://127.0.0.1:1",
      LINEAR_API_KEY: "",
    },
  });
  assert.doesNotMatch(result.stderr, /Unknown option/);
});

test("all state consumers reject retired files before provider calls and print migration command", (t) => {
  const { directory, file } = fixture(t);
  writeFileSync(file, JSON.stringify({ repo }));
  const snapshot = path.join(directory, "snapshot.json");
  writeFileSync(snapshot, JSON.stringify({ v: 3, repo, prs: [], linear: { issues: [] } }));
  const config = path.join(directory, "planner.json");
  writeFileSync(
    config,
    JSON.stringify({
      repo,
      linearTeam: "EXA",
      linearRouteLabel: repo,
      stateFile: file,
      branchPrefix: "codex/",
    }),
  );
  for (const [name, args] of [
    ["tick.mjs", ["--config", config]],
    ["tick-plan.mjs", [snapshot, "--state", file]],
    ["tick-snapshot.mjs", ["--repo", repo, "--state", file]],
    ["planner-state.mjs", ["init", "--repo", repo, "--state", file]],
  ]) {
    const result = run(name, args);
    assert.equal(result.status, 1, result.stderr);
    assert.match(
      result.stderr,
      /uses a retired format; run: node .*planner-state\.mjs migrate --repo example\/app --state /,
    );
    assert.equal(result.stdout, "");
  }
});

test("typed worker command rendered by dispatch records runtime IDs, then planning waits", (t) => {
  const { file } = fixture(t);
  const snapshot = {
    v: 3,
    repo,
    baseline: { branch: "main" },
    prs: [],
    linear: {
      issues: [
        {
          issueKey: "EXA-1",
          title: "Handle O'Brien's input",
          url: "https://linear.app/example/issue/EXA-1/input",
          state: "Todo",
          labels: ["kind-slice", "ready-for-agent"],
          footprint: ["src/a file.mjs"],
        },
      ],
    },
  };
  const state = { v: 3, repo };
  const config = { branchPrefix: "codex/", stateFile: file };
  const plan = enrichActions(planTick({ snapshot, state, config }), { snapshot, state, config });
  const action = plan.actions.find((action) => action.kind === "dispatch");
  assert.deepEqual(action.outOfScope, []);
  assert.equal(action.branch, "codex/exa-1-handle-o-brien-s-input");
  const command = action.record.command
    .replaceAll("<sessionId>", "session-1")
    .replaceAll("<receiptId>", "task-1")
    .replaceAll("<runId>", "run-1");
  const recorded = spawnSync("bash", ["-c", command], { encoding: "utf8" });
  assert.equal(recorded.status, 0, recorded.stderr);
  const saved = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(validateState(saved), true);
  const next = planTick({ snapshot, config, state: saved });
  assert.ok(next.waits.some((wait) => wait.reason === "WORKER_RUNNING"));
  assert.ok(!next.actions.some((action) => action.kind === "dispatch"));
});

test("typed commands reject an unreplaced record placeholder and leave state untouched", (t) => {
  const { file } = fixture(t);
  assert.equal(run("planner-state.mjs", ["init", "--repo", repo, "--state", file]).status, 0);
  const before = readFileSync(file, "utf8");
  const result = run("planner-state.mjs", [
    "worker",
    ...["--repo", repo, "--state", file, "--issue", "EXA-1", "--branch", "codex/exa-1"],
    ...["--footprint", "src/a.mjs", "--session", "session-1", "--receipt", "<receiptId>"],
    ...["--status", "running"],
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--receipt still holds the placeholder <receiptId>/);
  assert.equal(readFileSync(file, "utf8"), before);
});

test("dispatch recovers a known UUID-associated branch after an older branchless receipt", () => {
  const uuid = "00000000-0000-4000-8000-000000000001";
  const issue = {
    issueKey: "EXA-1",
    issueUuid: uuid,
    title: "Continue work",
    url: "https://linear.app/example/issue/EXA-1/work",
    footprint: ["src/a"],
  };
  const snapshot = { v: 3, repo, linear: { issues: [issue] } };
  const state = {
    v: 3,
    repo,
    dispatches: [
      { issueKey: "EXA-1", sessionId: "older", status: "returned" },
      { issueUuid: uuid, sessionId: "recent", status: "returned", branch: "codex/existing-work" },
    ],
  };
  const config = { branchPrefix: "codex/", stateFile: ".ziw/state.json" };
  const plan = {
    repo,
    actions: [{ kind: "dispatch", target: "ticket:EXA-1", footprint: ["src/a"] }],
  };
  assert.equal(
    enrichActions(plan, { snapshot, state, config }).actions[0].branch,
    "codex/existing-work",
  );
  for (const name of ["title", "url"])
    assert.throws(
      () =>
        enrichActions(plan, {
          snapshot: { ...snapshot, linear: { issues: [{ ...issue, [name]: undefined }] } },
          state,
          config,
        }),
      /required to brief the worker/,
    );
});

test("typed review result binds coverage atomically; failed request clears in-flight wait", (t) => {
  const { file } = fixture(t);
  const common = ["--repo", repo, "--state", file, "--pr", "12"];
  const request = [
    "review-request",
    ...common,
    "--session",
    "R1",
    "--receipt",
    "T1",
    "--head",
    "head-1",
    "--fingerprint",
    "patch-id:one",
  ];
  assert.equal(run("planner-state.mjs", request).status, 0);
  const before = readFileSync(file, "utf8");
  const mismatched = run("planner-state.mjs", [
    "review-result",
    ...common,
    "--session",
    "R2",
    "--verdict",
    "APPROVE",
    "--count",
    "1",
  ]);
  assert.equal(mismatched.status, 1);
  assert.match(mismatched.stderr, /does not match/);
  assert.equal(readFileSync(file, "utf8"), before);
  const result = run("planner-state.mjs", [
    "review-result",
    ...common,
    "--receipt",
    "T1",
    "--verdict",
    "APPROVE",
    "--count",
    "1",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const saved = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(saved.reviewEvidenceByPr[12].reviewedHeadSha, "head-1");
  assert.equal(saved.reviewEvidenceByPr[12].reviewedDiffFingerprint, "patch-id:one");
  assert.equal(saved.reviewRequestsByPr[12].status, "completed");
  assert.equal(saved.reviewEvidenceByPr[12].sessionId, "R1");
  const second = run("planner-state.mjs", [
    "review-request",
    ...common,
    "--session",
    "R3",
    "--head",
    "head-2",
    "--fingerprint",
    "patch-id:two",
  ]);
  assert.equal(second.status, 0, second.stderr);
  const snapshot = {
    v: 3,
    repo,
    prs: [
      {
        number: 12,
        headSha: "head-2",
        reviewDiffFingerprint: "patch-id:two",
        changedFiles: 1,
        checks: { state: "SUCCESS" },
      },
    ],
    linear: { issues: [] },
  };
  assert.ok(
    planTick({ snapshot, state: JSON.parse(readFileSync(file, "utf8")) }).waits.some(
      (wait) => wait.reason === "REVIEW_IN_FLIGHT",
    ),
  );
  const failed = run("planner-state.mjs", [
    "review-request",
    ...common,
    "--session",
    "R3",
    "--status",
    "failed",
  ]);
  assert.equal(failed.status, 0, failed.stderr);
  const next = planTick({ snapshot, state: JSON.parse(readFileSync(file, "utf8")) });
  assert.ok(!next.waits.some((wait) => wait.reason === "REVIEW_IN_FLIGHT"));
  assert.ok(next.actions.some((action) => action.kind === "request-review"));
});

for (const status of ["failed", "stopped", "completed"]) {
  test(`a ${status} review retry gets a fresh stable idempotency key`, () => {
    const snapshot = {
      v: 3,
      repo,
      prs: [
        {
          number: 12,
          state: "open",
          isDraft: true,
          headSha: "h1",
          reviewDiffFingerprint: "patch-id:fp1",
          changedFiles: 1,
          checks: { state: "SUCCESS" },
        },
      ],
    };
    const state = { v: 3, repo };
    const reviewAction = () =>
      planTick({ snapshot, state }).actions.find((action) => action.kind === "request-review");
    const first = reviewAction();
    state.reviewRequestsByPr = {
      12: { sessionId: "R1", status, headSha: "h1", reviewDiffFingerprint: "patch-id:fp1" },
    };
    const retry = reviewAction();
    assert.notEqual(retry.idempotencyKey, first.idempotencyKey);
    assert.equal(reviewAction().idempotencyKey, retry.idempotencyKey);
    state.reviewRequestsByPr[12].sessionId = "R2";
    assert.notEqual(reviewAction().idempotencyKey, retry.idempotencyKey);
  });
}

test("derived evidence uses the v3 contract; delta review brief points to previous report", () => {
  const pr = {
    number: 12,
    url: "https://github.com/example/app/pull/12",
    baseRefName: "main",
    headSha: "head-2",
    reviewDiffFingerprint: "patch-id:two",
    changedFiles: 1,
    checks: { state: "SUCCESS" },
    latestReviews: {
      human: {
        authorType: "User",
        state: "APPROVED",
        headSha: "head-2",
        reviewDiffFingerprint: "patch-id:two",
      },
    },
  };
  for (const evidence of [
    evidenceForPr({}, pr, {}),
    hostedReviewForPr({}, pr, {}),
    livePrFacts({}, pr),
  ])
    assert.equal(
      validateState({ v: 3, repo, reviewEvidenceByPr: { 12: evidence } }),
      true,
      JSON.stringify(validateState.errors),
    );
  const snapshot = { v: 3, repo, prs: [{ ...pr, latestReviews: {} }], linear: { issues: [] } };
  assert.equal(validateInput(snapshot), true);
  const state = {
    v: 3,
    repo,
    reviewEvidenceByPr: {
      12: {
        sessionId: "previous",
        receiptId: "previous-task",
        reviewVerdict: "APPROVE",
        reviewedHeadSha: "head-1",
        reviewedDiffFingerprint: "patch-id:one",
        independentReviewCount: 1,
      },
    },
  };
  const config = { stateFile: ".ziw/state.json" };
  const action = enrichActions(planTick({ snapshot, state, config }), {
    snapshot,
    state,
    config,
  }).actions.find((action) => action.kind === "request-review");
  assert.equal(action.deltaFrom, "head-1");
  assert.equal(action.previousReviewSessionId, "previous");
  assert.equal(action.previousReviewReceiptId, "previous-task");
  assert.equal(action.ticketUrl, undefined);
  assert.match(action.brief, /Paste the previous report's findings/);
});

test("review brief uses the planner's merged PR when saved state holds a partial record", () => {
  const pr = {
    number: 12,
    url: "https://github.com/example/app/pull/12",
    baseRefName: "main",
    headSha: "head-1",
    reviewDiffFingerprint: "patch-id:one",
    changedFiles: 1,
    checks: { state: "SUCCESS" },
  };
  const snapshot = { v: 3, repo, prs: [pr], linear: { issues: [] } };
  const state = { v: 3, repo, pullRequests: [{ number: 12, headSha: "head-1" }] };
  const config = { stateFile: ".ziw/state.json" };
  const action = enrichActions(planTick({ snapshot, state, config }), {
    snapshot,
    state,
    config,
  }).actions.find((action) => action.kind === "request-review");
  assert.equal(action.prUrl, pr.url);
  assert.equal(action.base, "main");
  assert.equal(action.headSha, "head-1");
});

test("dispatch records the footprint the planner selected, not an empty tracker footprint", () => {
  const snapshot = {
    v: 3,
    repo,
    baseline: { branch: "main" },
    prs: [],
    linear: {
      issues: [
        {
          issueKey: "EXA-1",
          title: "Recovered work",
          url: "https://linear.app/example/issue/EXA-1/recovered",
          state: "Todo",
          labels: ["kind-slice", "ready-for-agent"],
          footprint: [],
        },
      ],
    },
  };
  const state = {
    v: 3,
    repo,
    startableTickets: [{ issueKey: "EXA-1", footprint: ["src/recovered.mjs"] }],
  };
  const config = { branchPrefix: "codex/", stateFile: ".ziw/state.json" };
  const action = enrichActions(planTick({ snapshot, state, config }), {
    snapshot,
    state,
    config,
  }).actions.find((action) => action.kind === "dispatch");
  assert.ok(action, "planner should dispatch EXA-1 using the saved footprint");
  assert.deepEqual(action.footprint, ["src/recovered.mjs"]);
  const { argv } = action.record;
  assert.equal(argv[argv.indexOf("--footprint") + 1], "src/recovered.mjs");
});

test("retired conformance config explains the replacement", (t) => {
  const { directory } = fixture(t);
  const file = path.join(directory, "input.json");
  writeFileSync(
    file,
    JSON.stringify({ v: 3, repo, config: { requireConformanceEvidence: false } }),
  );
  const result = run("tick-plan.mjs", [file]);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /requireConformanceEvidence is retired; the review verdict now carries conformance/,
  );
});
