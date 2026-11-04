import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fixture } from "./ratchet-cli-harness.test.mjs";
import { rankedRecommendations, readVerdicts } from "../skills/ziw-ratchet/scripts/sessions.mjs";

const issue = (item, severity = "medium") => ({
  criterion: "quality",
  item,
  severity,
  issue: "The action is unclear",
  fix: "Clarify the action",
});

test("ratchet reference-free run captures, critiques, approves and keeps", (t) => {
  const f = fixture(t, true, { setup: { references: undefined } });
  const plan = f.calibrate().actions[0];
  assert.equal(plan.kind, "plan");
  assert.equal(
    f.journal().filter((e) => e.type === "session-staged" && e.session.family.startsWith("cal-"))
      .length,
    0,
  );
  const calibrated = f.journal().find((e) => e.type === "calibrated");
  assert.equal(calibrated.standings.quality.working.standing, 5);
  const kept = f.keep();
  assert.equal(f.git("rev-parse", "HEAD"), kept.commit);
  const anchor = f
    .journal()
    .find((e) => e.type === "session-staged" && e.session.family === "r01-ref").session;
  assert.ok(anchor.pairs.every((p) => p.reference === "baseline"));
  assert.equal(f.journal().findLast((e) => e.type === "critiqued").commit, kept.commit);
});

test("ratchet critiques stage only working items and labeled matching references", (t) => {
  const f = fixture(t);
  f.run("capture");
  const actions = f.tick().actions;
  const critique = actions.find((a) => a.session === "r00-crit-sol");
  const brief = f.read(path.relative(f.root, critique.brief));
  assert.match(brief, /not blind.*References/s);
  assert.match(brief, /Reference 1 to learn from, item working0/);
  assert.match(brief, /Make the answer useful.*Correct facts.*Clear action.*Readable order/s);
  assert.doesNotMatch(brief, /validation|confirmation/);
  assert.ok(
    readdirSync(path.dirname(critique.brief)).every(
      (name) => !/validation|confirmation/.test(name),
    ),
  );
  const blind = actions.find((a) => a.session === "cal-fwd-sol");
  assert.doesNotMatch(
    f.read(path.relative(f.root, blind.brief)),
    /recommendations.json|critique.json/,
  );
});

test("ratchet critique validation rejects invalid criterion, item, severity, issue, fix and duplicates", (t) => {
  const f = fixture(t);
  f.run("capture");
  const action = f.tick().actions.find((a) => a.session === "r00-crit-sol");
  const session = f.journal().find((e) => e.session?.id === action.session).session;
  const file = path.relative(f.root, path.join(session.directory, "critique.json"));
  for (const [issues, pattern] of [
    [[{ ...issue("working0"), criterion: "gate" }], /judged criterion/],
    [[issue("validation0")], /working item/],
    [[{ ...issue("working0"), severity: "urgent" }], /severity/],
    [[{ ...issue("working0"), issue: " " }], /requires issue/],
    [[{ ...issue("working0"), fix: "" }], /requires fix/],
    [[issue("working0"), issue("working0")], /duplicate/],
    [Array.from({ length: 16 }, () => issue("working0")), /at most 15/],
  ]) {
    f.write(file, { issues });
    assert.throws(() => readVerdicts(session, f.setup.criteria), pattern);
  }
});

test("ratchet critique issues feed plans with severity, standing, weight and same-item support", (t) => {
  const f = fixture(t);
  f.run("capture");
  f.tick().actions.forEach((a) =>
    f.judge(
      a,
      "loss",
      a.judge === "sol"
        ? [issue("working0", "high"), issue("working1", "low")]
        : [issue("working0", "low"), issue("working2", "medium")],
    ),
  );
  assert.equal(f.tick().actions[0].kind, "approve");
  f.record("approved");
  const plan = f.tick().actions[0];
  assert.equal(plan.recommendations[0].severity, "high");
  assert.equal(plan.recommendations[0].rank, 3 * 3 * 6 * 1.5);
  assert.equal(plan.recommendations.find((r) => r.item === "working2").rank, 2 * 3 * 6);
  const ranked = rankedRecommendations({
    setup: f.setup,
    recommendations: plan.recommendations,
    tried: [plan.recommendations[0].id],
    standings: { quality: { working: { standing: 8 } } },
  });
  assert.ok(ranked.every((r) => r.rank > 0));
  assert.ok(!ranked.some((r) => r.id === plan.recommendations[0].id));
});

test("ratchet exhausted means all latest critique issues were tried", (t) => {
  const f = fixture(t);
  f.run("capture");
  f.tick().actions.forEach((a) => f.judge(a, "loss", a.judge === "sol" ? [issue("working0")] : []));
  assert.equal(f.tick().actions[0].kind, "approve");
  f.record("approved");
  const round = f.implement();
  round.actions.forEach((a) => f.judge(a, "tie"));
  assert.equal(f.tick().actions[0].kind, "report-ticket");
  assert.equal(f.journal().findLast((e) => e.type === "finishing").reason, "exhausted");
  assert.equal(
    f.journal().filter((e) => e.type === "session-staged" && e.session.family?.endsWith("-crit"))
      .length,
    2,
  );
});
