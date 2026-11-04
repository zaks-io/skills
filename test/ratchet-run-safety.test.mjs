import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixture } from "./ratchet-cli-harness.test.mjs";

const cli = fileURLToPath(new URL("../skills/ziw-ratchet/scripts/ratchet.mjs", import.meta.url));

function startRound(f) {
  const plan = f.tick().actions[0];
  f.record("plan", "--recs", plan.recommendations[0].id, "--targets", "quality");
  const launch = f.tick().actions[0];
  f.record("launched", "--session", launch.session, "--receipt", `receipt-${launch.session}`);
  return launch;
}

test("ratchet serializes overlapping ticks and recovers a stale lock", async (t) => {
  const f = fixture(t);
  f.tick();
  f.run("capture");
  const tick = () =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [cli, "tick", "--run", ".run"], { cwd: f.root });
      child.on("close", resolve);
    });
  await Promise.all([tick(), tick()]);
  assert.equal(f.tick().status, "setup");
  assert.equal(new Set(f.journal().map((e) => e.sequence)).size, f.journal().length);

  f.write(".run/.lock", String(process.pid));
  f.fail(/another ratchet command/, "tick");
  const exited = spawnSync(process.execPath, ["-e", ""]).pid;
  f.write(".run/.lock", String(exited));
  assert.equal(f.tick().status, "setup");
  assert.equal(f.raw(["report"]).status, 0);
});

test("ratchet hides held-out revert reasons from the next implementer", (t) => {
  const f = fixture(t, true, { critical: "validation0" });
  f.calibrate();
  const round = f.implement("held-out regression", "working1");
  round.actions.forEach((a) => f.judge(a, (p) => (p.item === "validation0" ? "loss" : "win")));
  assert.equal(f.tick().actions[0].kind, "plan");
  assert.equal(
    f.journal().findLast((e) => e.type === "reverted").reason,
    "critical:validation0:quality",
  );
  const brief = f.read(path.relative(f.root, startRound(f).brief));
  assert.match(brief, /Reverted: a check on evidence you cannot see failed/);
  assert.doesNotMatch(brief, /validation0|critical:/);
});

test("ratchet reverts a candidate whose capture fails", (t) => {
  const f = fixture(t);
  f.calibrate();
  const kept = f.git("rev-parse", "HEAD");
  startRound(f);
  f.git("rm", "-q", "target.txt");
  f.git("commit", "-q", "-m", "remove target");
  const commit = f.git("rev-parse", "HEAD");
  f.git("reset", "-q", "--hard", kept);
  f.record("implemented", "--commit", commit);
  assert.equal(f.tick().actions[0].kind, "capture");
  assert.equal(f.run("capture").reverted, true);
  assert.equal(f.tick().actions[0].kind, "plan");
  assert.equal(f.journal().findLast((e) => e.type === "reverted").reason, "capture-failed");
  assert.equal(f.git("rev-parse", "HEAD"), kept);
});

test("ratchet failed runs can acknowledge their report despite integrity failures", (t) => {
  const f = fixture(t);
  f.calibrate();
  f.git("checkout", "-q", "-b", "elsewhere");
  const failed = f.tick();
  assert.equal(failed.status, "failed");
  assert.equal(failed.actions[0].kind, "report-ticket");
  assert.match(f.run("report"), /branch/);
  f.record("reported");
  assert.deepEqual(f.tick().actions, []);
});
