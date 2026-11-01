import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const scripts = path.resolve("skills/ziw-orchestrate/scripts");
const repo = "example/app";
const worker = {
  issueKey: "EXA-1",
  sessionId: "S1",
  runId: "W1",
  branch: "agent/exa-1",
  footprint: ["src/a.ts"],
  status: "running",
};

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-resume-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const state = path.join(directory, "state.json");
  const snapshotFile = path.join(directory, "snapshot.json");
  const configFile = path.join(directory, "config.json");
  writeFileSync(
    configFile,
    JSON.stringify({
      readyState: "Todo",
      workerConcurrencyCap: 1,
      mergeAuthority: "human",
      hostedReviewRiskTiers: [],
    }),
  );
  const snapshot = {
    v: 3,
    repo,
    prs: [],
    worktrees: [],
    linear: {
      issues: [1, 2].map((number) => ({
        issueKey: `EXA-${number}`,
        state: "Todo",
        labels: ["kind-slice", "ready-for-agent", "risk-normal"],
        footprint: [number === 1 ? "src/a.ts" : "src/b.ts"],
      })),
    },
  };
  const record = (observation) => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(scripts, "planner-state.mjs"),
        "--repo",
        repo,
        "--state",
        state,
        ...(observation ? ["--record", "-"] : []),
      ],
      { encoding: "utf8", input: observation ? JSON.stringify(observation) : undefined },
    );
    assert.equal(result.status, 0, result.stderr);
  };
  const plan = () => {
    writeFileSync(snapshotFile, JSON.stringify(snapshot));
    const result = spawnSync(
      process.execPath,
      [path.join(scripts, "tick-plan.mjs"), snapshotFile, "--state", state, "--config", configFile],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { state, snapshot, record, plan };
}

test("a fresh process resumes delivery and review without duplicate launches", (t) => {
  const { state, snapshot, record, plan } = fixture(t);
  record();
  assert.equal(plan().actions.filter((action) => action.kind === "dispatch").length, 1);
  record({ dispatches: [worker] });
  snapshot.linear.issues[0].state = "In Progress";
  record();
  const running = plan();
  assert.equal(running.capacity.used, 1);
  assert.equal(
    running.actions.some((action) => action.kind === "dispatch"),
    false,
  );

  record({ dispatches: [{ sessionId: "S1", runId: "W1", status: "returned", prNumber: 42 }] });
  snapshot.prs = [
    {
      number: 42,
      issueKey: "EXA-1",
      state: "open",
      isDraft: true,
      headSha: "h1",
      reviewDiffFingerprint: "patch-id:fp1",
      changedFiles: 1,
      checks: { state: "SUCCESS", failed: [], pending: [] },
    },
  ];
  const returned = plan();
  assert.equal(returned.capacity.used, 0);
  assert.equal(
    returned.actions.some(
      (action) => action.kind === "dispatch" && action.target === "ticket:EXA-1",
    ),
    false,
  );
  assert.equal(
    returned.actions.some(
      (action) => action.kind === "request-review" && action.target === "pr:42",
    ),
    true,
  );
  record({
    reviewRequestsByPr: {
      42: {
        sessionId: "R1",
        headSha: "h1",
        reviewDiffFingerprint: "patch-id:fp1",
        status: "running",
      },
    },
  });
  record();
  const reviewing = plan();
  assert.equal(
    reviewing.actions.some((action) => action.kind === "request-review"),
    false,
  );
  assert.equal(
    reviewing.waits.some((wait) => wait.reason === "REVIEW_IN_FLIGHT"),
    true,
  );

  record({
    reviewEvidenceByPr: {
      42: {
        sessionId: "R1",
        reviewedHeadSha: "h1",
        reviewedDiffFingerprint: "patch-id:fp1",
        reviewVerdict: "APPROVE",
        independentReviewCount: 1,
      },
    },
  });
  const reviewed = plan();
  assert.equal(
    reviewed.actions.some((action) => action.kind === "mark-ready" && action.target === "pr:42"),
    true,
  );
  assert.equal(
    reviewed.actions.some((action) => action.kind === "request-review"),
    false,
  );
  const saved = JSON.parse(readFileSync(state));
  assert.equal(saved.dispatches.length, 1);
  assert.equal(saved.reviewRequestsByPr[42].status, "completed");
});

test("missing runtime evidence leaves saved capacity and file reservations occupied", (t) => {
  const { state, snapshot, record, plan } = fixture(t);
  record({ dispatches: [worker] });
  snapshot.linear.issues[1].footprint = ["src/a.ts"];
  const before = readFileSync(state, "utf8");
  const unknown = spawnSync(
    process.execPath,
    [path.join(scripts, "planner-state.mjs"), "--repo", repo, "--state", state, "--record", "-"],
    {
      encoding: "utf8",
      input: JSON.stringify({ dispatches: [{ sessionId: "S1", runId: "W1", status: "unknown" }] }),
    },
  );
  assert.equal(unknown.status, 1);
  assert.equal(readFileSync(state, "utf8"), before);
  const resumed = plan();
  assert.equal(resumed.capacity.used, 1);
  assert.equal(
    resumed.actions.some((action) => action.kind === "dispatch"),
    false,
  );
});

test("an interrupted launch with a tracker claim is not dispatched again", (t) => {
  const { snapshot, record, plan } = fixture(t);
  record();
  snapshot.linear.issues[0].state = "In Progress";
  snapshot.linear.issues[0].activeClaim = true;
  snapshot.linear.issues[0].sessionId = "S1";
  const interrupted = plan();
  assert.equal(
    interrupted.actions.some(
      (action) => action.kind === "dispatch" && action.target === "ticket:EXA-1",
    ),
    false,
  );
  record({ dispatches: [worker] });
  const recovered = plan();
  assert.equal(recovered.capacity.used, 1);
  assert.equal(
    recovered.actions.some((action) => action.kind === "dispatch"),
    false,
  );
});

for (const identity of [{ sessionId: "S1" }, { receiptId: "T1" }]) {
  for (const status of ["returned", "failed", "stopped"]) {
    test(`replaying a ${status} worker without run IDs preserves capacity (${Object.keys(identity)[0]})`, (t) => {
      const { state, snapshot, record, plan } = fixture(t);
      const { sessionId, runId, ...reservation } = worker;
      const launch = { ...reservation, ...identity };
      snapshot.linear.issues = [snapshot.linear.issues[1]];
      snapshot.linear.issues[0].footprint = worker.footprint;
      record({ dispatches: [launch] });
      record({ dispatches: [{ ...identity, status, prNumber: 42, headSha: "h1" }] });
      const completed = JSON.parse(readFileSync(state));
      const beforeReplay = plan();
      assert.equal(beforeReplay.capacity.used, 0);
      assert.equal(
        beforeReplay.actions.some(
          (action) => action.kind === "dispatch" && action.target === "ticket:EXA-2",
        ),
        true,
      );

      record();
      record({ dispatches: [launch] });
      assert.deepEqual(JSON.parse(readFileSync(state)), completed);
      record({ dispatches: [{ ...launch, sessionId: "S1", receiptId: "T1" }] });
      const enriched = JSON.parse(readFileSync(state));
      assert.deepEqual(enriched.dispatches, [
        { ...completed.dispatches[0], sessionId: "S1", receiptId: "T1" },
      ]);
      const afterReplay = plan();
      for (const key of ["capacity", "actions", "waits", "holds"])
        assert.deepEqual(afterReplay[key], beforeReplay[key]);

      const followUp = { ...reservation, sessionId: "S2", receiptId: "T2" };
      record({ dispatches: [followUp] });
      record({ dispatches: [launch] });
      const running = plan();
      assert.equal(running.capacity.used, 1);
      assert.equal(
        running.actions.some((action) => action.kind === "dispatch"),
        false,
      );
      const saved = JSON.parse(readFileSync(state));
      assert.equal(saved.dispatches.length, 2);
      assert.deepEqual(saved.dispatches[0], enriched.dispatches[0]);
      assert.deepEqual(saved.dispatches[1], followUp);
      record({ dispatches: [{ sessionId: "S2", status: "returned" }] });
      const afterFollowUp = plan();
      for (const key of ["capacity", "actions", "waits", "holds"])
        assert.deepEqual(afterFollowUp[key], beforeReplay[key]);
    });
  }
}

test("the published worked example records a complete delivery and review", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-state-example-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const guide = readFileSync(path.join(scripts, "../references/state-observations.md"), "utf8");
  const commands = [...guide.matchAll(/```sh\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .join("\n")
    .replace("S=<skill-dir>/scripts", `S='${scripts}'`);
  const result = spawnSync("sh", ["-eu"], { cwd: directory, input: commands, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(readFileSync(path.join(directory, ".ziw/state.json")));
  assert.equal(state.dispatches[0].status, "returned");
  assert.equal(state.dispatches[0].prNumber, 42);
  assert.equal(state.reviewRequestsByPr[42].status, "completed");
  assert.equal(state.reviewEvidenceByPr[42].reviewVerdict, "APPROVE");
});
