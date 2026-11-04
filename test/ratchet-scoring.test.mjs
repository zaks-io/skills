import test from "node:test";
import assert from "node:assert/strict";
import {
  combineJudges,
  combineUnit,
  currentSide,
  perspective,
  scoreSessions,
  standing,
} from "../skills/ziw-ratchet/scripts/scoring.mjs";

test("ratchet only unanimous judges give an item a direction", () => {
  assert.equal(combineJudges(["win", "win"]), "win");
  assert.equal(combineJudges(["loss", "loss", "loss"]), "loss");
  assert.equal(combineJudges(["win", "tie"]), "tie");
  assert.equal(combineJudges(["win", "loss"]), "tie");
  assert.throws(() => combineJudges(["win"]), /complete judge panel/);
  assert.equal(perspective("B", "B"), "win");
  assert.equal(perspective("A", "B"), "loss");
});
test("ratchet deterministic orders alternate judges and reverse calibration", () => {
  const seen = new Set();
  for (let item = 0; item < 40; item++) {
    const first = currentSide("run", "cal-fwd", item, 0);
    assert.equal(currentSide("run", "cal-fwd", item, 0), first);
    assert.notEqual(currentSide("run", "cal-fwd", item, 1), first);
    assert.equal(currentSide("run", "cal-fwd", item, 2), first);
    assert.notEqual(currentSide("run", "cal-fwd", item, 0, true), first);
    seen.add(first);
  }
  assert.equal(seen.size, 2);
});
test("ratchet unit combination counts item wins and losses", () => {
  assert.equal(combineUnit(["win", "win", "loss"]), "win");
  assert.equal(combineUnit(["loss", "tie"]), "loss");
  assert.equal(combineUnit(["win", "loss", "tie"]), "tie");
});
test("ratchet scoring combines units, measures agreement, and gives self references 5", () => {
  const pairs = [
    { key: "1", pair: "p1", unit: "one", set: "working", reference: "ref", currentSide: "A" },
    { key: "2", pair: "p2", unit: "one", set: "working", reference: "ref", currentSide: "A" },
    { key: "3", pair: "p3", unit: "two", set: "working", reference: "ref", currentSide: "A" },
  ];
  const session = (opposite, last) => ({
    pairs: pairs.map((p) => ({ ...p, currentSide: opposite ? "B" : "A" })),
    verdicts: pairs.map((p, i) => ({
      pair: p.pair,
      criterion: "x",
      verdict: i === 2 ? last : opposite ? "B" : "A",
    })),
  });
  const sessions = [session(false, "A"), session(true, "A")];
  const score = scoreSessions(sessions, [{ id: "x", type: "judged" }], 0.9).x.working;
  assert.equal(score.count, 2);
  assert.equal(score.wins, 1);
  assert.equal(score.ties, 1);
  assert.equal(score.standing, 7.5);
  assert.equal(score.agreement, 2 / 3);
  sessions.forEach((s) => s.pairs.forEach((p) => (p.self = true)));
  assert.equal(scoreSessions(sessions, [{ id: "x", type: "judged" }], 0.9).x.working.standing, 5);
  assert.equal(standing(["tie", "tie"], 0.9).standing, 5);
});
