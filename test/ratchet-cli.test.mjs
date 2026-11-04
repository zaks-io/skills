import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fixture } from "./ratchet-cli-harness.test.mjs";

test("ratchet init rejects dirty trees, nonignored runs, undersized sets, and existing journals", (t) => {
  const f = fixture(t, false);
  f.write("target.txt", "dirty");
  f.fail(/clean/, "init", "--setup", f.file(".run/input.json"));
  f.git("restore", "target.txt");
  const notIgnored = f.raw(["init", "--setup", f.file(".run/input.json"), "--run", "outside"]);
  assert.notEqual(notIgnored.status, 0);
  assert.match(notIgnored.stderr, /git-ignored/);
  f.setup.sets.working.pop();
  f.write(".run/input.json", f.setup);
  f.fail(/invalid item|working requires/, "init", "--setup", f.file(".run/input.json"));
  f.setup.sets.working.push("working4");
  f.write(".run/input.json", f.setup);
  f.run("init", "--setup", f.file(".run/input.json"));
  f.fail(/already has a journal/, "init", "--setup", f.file(".run/input.json"));
});
test("ratchet setup locks approval and recovers pending judges without relaunching", (t) => {
  const f = fixture(t);
  f.run("capture");
  const launch = f.tick().actions[0];
  f.record("launched", "--session", launch.session, "--receipt", "existing");
  const recover = f.tick().actions.find((a) => a.session === launch.session);
  assert.equal(recover.kind, "recover-session");
  assert.equal(recover.receipt, "existing");
  f.record("lost", "--session", launch.session);
  assert.equal(f.tick().actions.find((a) => a.session === launch.session).kind, "launch-judge");
  f.tick().actions.forEach((a) => f.judge(a));
  const approve = f.tick().actions[0];
  assert.equal(approve.kind, "approve");
  f.record("approved");
  assert.equal(f.tick().status, "running");
  assert.equal(JSON.parse(f.read(".run/manifest.json")).baseline, f.git("rev-parse", "HEAD"));
  f.fail(/current phase|calibration/, "record", "approved");
});
test("ratchet keeps a target change, hides held-out evidence, and reverts a no-improvement round", (t) => {
  const f = fixture(t);
  f.calibrate();
  const kept = f.keep();
  assert.equal(f.git("rev-parse", "HEAD"), kept.commit);
  const directory = path.dirname(kept.launch.brief);
  for (const entry of readdirSync(directory)) {
    const contents = readFileSync(path.join(directory, entry), "utf8");
    assert.doesNotMatch(contents, /validation\d|confirmation\d|standing|history/);
  }
  const candidate = f.implement("reverted");
  candidate.actions.forEach((a) => f.judge(a, "tie"));
  assert.equal(f.tick().actions[0].kind, "plan");
  assert.equal(f.git("rev-parse", "HEAD"), kept.commit);
  const reverted = f.journal().findLast((e) => e.type === "reverted");
  assert.equal(reverted.reason, "no-improvement");
  assert.match(f.run("report"), /Round 2 reverted: no-improvement.*clear action/);
});
test("ratchet catches a protected ignored helper edit with an unchanged recipe", (t) => {
  const f = fixture(t);
  f.calibrate();
  const plan = f.tick().actions[0];
  f.record("plan", "--recs", plan.recommendations[0].id, "--targets", "quality");
  const launch = f.tick().actions[0];
  f.record("launched", "--session", launch.session, "--receipt", "impl");
  const baseline = f.git("rev-parse", "HEAD");
  f.record("implemented", "--commit", f.candidate("boundary"));
  f.write(".run/helper.mjs", f.helper + "// tampered\n");
  assert.equal(f.run("capture").type, "boundary-violation");
  f.tick();
  assert.equal(f.git("rev-parse", "HEAD"), baseline);
  assert.equal(f.journal().findLast((e) => e.type === "reverted").reason, "boundary");
});
test("ratchet refuses unsafe reverts and reports low agreement", (t) => {
  const f = fixture(t);
  f.calibrate();
  const round = f.implement();
  round.actions.forEach((a, i) => f.judge(a, i ? "loss" : "win"));
  const result = f.tick();
  assert.equal(result.status, "failed");
  assert.equal(result.actions[0].kind, "report-ticket");
  assert.match(f.run("report"), /agreement/);
});
test("ratchet missing and corrupted journals fail loudly", (t) => {
  const f = fixture(t);
  const contents = f.read(".run/journal.jsonl");
  unlinkSync(f.file(".run/journal.jsonl"));
  f.fail(/missing journal/, "tick");
  f.write(".run/journal.jsonl", contents.trimEnd());
  f.fail(/incomplete record/, "tick");
  f.write(".run/journal.jsonl", contents.replace('"sequence":1', '"sequence":2'));
  f.fail(/inconsistent journal sequence/, "tick");
});
test("ratchet confirmation leads the report and a matching publish completes", (t) => {
  const f = fixture(t);
  f.calibrate();
  const kept = f.keep();
  const publish = f.finish();
  assert.equal(publish.head, kept.commit);
  assert.match(f.run("report"), /^Confirmation passed/);
  f.record("published", "--pr", "https://github.com/zaks-io/example/pull/1", "--head", kept.commit);
  assert.deepEqual(f.tick(), { status: "done", round: 1, actions: [] });
});
test("ratchet publish head mismatch fails and only emits report-ticket", (t) => {
  const f = fixture(t);
  f.calibrate();
  f.keep();
  f.finish();
  f.record("published", "--pr", "https://github.com/zaks-io/example/pull/2", "--head", "wrong");
  const result = f.tick();
  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.actions.map((a) => a.kind),
    ["report-ticket"],
  );
  f.record("reported");
  assert.equal(f.tick().actions.length, 0);
});
test("ratchet zero-keep finishes report on the ticket without a PR", (t) => {
  const f = fixture(t);
  f.calibrate();
  f.record("stop");
  const result = f.tick();
  assert.equal(result.status, "finishing");
  assert.deepEqual(
    result.actions.map((a) => a.kind),
    ["report-ticket"],
  );
  f.record("reported");
  assert.equal(f.tick().status, "done");
});
