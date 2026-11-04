import test from "node:test";
import assert from "node:assert/strict";
import {
  anchorDecision,
  compareDecision,
  goalMet,
  keepDecision,
  stopReason,
} from "../skills/ziw-ratchet/scripts/decisions.mjs";
import { defaults, validateSetup, validateSetSizes } from "../skills/ziw-ratchet/scripts/setup.mjs";
import { minimumUnits, wilson } from "../skills/ziw-ratchet/scripts/stats.mjs";

const judged = (id) => ({ id, type: "judged", weight: 1, target: 6 });
const setup = {
  criteria: [
    judged("a"),
    judged("b"),
    judged("c"),
    { id: "gate", type: "gate" },
    {
      id: "speed",
      type: "measured",
      weight: 1,
      target: 6,
      runs: 2,
      tolerance: 50,
      minChange: 100,
      map: { at0: 4000, at10: 1200 },
    },
  ],
  thresholds: defaults,
};
function fixture() {
  const stat = {
    wins: 5,
    losses: 0,
    ties: 0,
    count: 5,
    items: 5,
    agreement: 1,
    standing: 10,
    lower: 6.4,
  };
  const comparison = Object.fromEntries(
    ["a", "b", "c"].map((id) => [id, { working: { ...stat }, validation: { ...stat } }]),
  );
  const before = { gates: { gate: true }, measurements: { speed: [2000, 2000] } };
  return {
    setup,
    targets: ["a", "b", "c"],
    comparison,
    before,
    after: structuredClone(before),
    previousStanding: structuredClone(comparison),
    currentStanding: structuredClone(comparison),
    fullGate: true,
  };
}
test("ratchet keeps only when all conditions pass", () =>
  assert.deepEqual(keepDecision(fixture()), { keep: true, rule: "holm-sign-test" }));
test("ratchet insufficient evidence and Holm reject apparent improvement", () => {
  for (const wins of [0, 4]) {
    const f = fixture();
    for (const c of Object.values(f.comparison))
      Object.assign(c.working, { wins, losses: 0, ties: 5 - wins });
    assert.equal(keepDecision(f).reason, "no-improvement");
    if (wins === 4)
      assert.equal(compareDecision(setup, ["a"], f.comparison, f.before, f.after).pass, true);
  }
});
test("ratchet validation-only regressions, measured regressions, anchors, and gates reject", () => {
  const cases = [
    [
      "regression:b:validation",
      (f) => Object.assign(f.comparison.b.validation, { wins: 0, losses: 1 }),
    ],
    ["regression:speed:measured", (f) => (f.after.measurements.speed = [2100, 2100])],
    ["anchor:a:validation", (f) => (f.currentStanding.a.validation.standing = 8.9)],
    ["gate:gate", (f) => (f.after.gates.gate = false)],
    ["full-gate", (f) => (f.fullGate = false)],
  ];
  for (const [reason, mutate] of cases) {
    const f = fixture();
    mutate(f);
    assert.equal(keepDecision(f).reason, reason);
  }
});
test("ratchet insufficient agreement fails rather than reverting", () => {
  const f = fixture();
  // One noisy criterion is reported, not fatal: health pools the whole panel.
  f.comparison.a.validation.agreement = 0.2;
  assert.notEqual(keepDecision(f).failed, true);
  for (const id of ["a", "b", "c"])
    for (const set of ["working", "validation"]) f.comparison[id][set].agreement = 0.59;
  assert.equal(keepDecision(f).failed, true);
  for (const id of ["a", "b", "c"])
    for (const set of ["working", "validation"]) f.currentStanding[id][set].agreement = 0.59;
  assert.equal(anchorDecision(setup, f.previousStanding, f.currentStanding).failed, true);
});
test("ratchet goal requires every judged bound, every measured run, and every gate", () => {
  const f = fixture();
  assert.equal(goalMet(setup, f.currentStanding, f.after), true);
  f.currentStanding.a.validation.lower = 5.9;
  assert.equal(goalMet(setup, f.currentStanding, f.after), false);
  f.currentStanding.a.validation.lower = 6.4;
  f.after.measurements.speed = [1200, 4000];
  assert.equal(goalMet(setup, f.currentStanding, f.after), false);
  f.after.measurements.speed = [2000, 2000];
  f.after.gates.gate = false;
  assert.equal(goalMet(setup, f.currentStanding, f.after), false);
  delete f.currentStanding.b;
  assert.throws(() => goalMet(setup, f.currentStanding, f.after), /missing goal standing/);
});
test("ratchet minimum units satisfy the three-target test and Wilson bound", () => {
  const minimum = minimumUnits(setup);
  assert.deepEqual(minimum, { working: 5, validation: 5, confirmation: 5 });
  assert.ok(wilson(5, 5, 0.9).lower >= 0.6);
  assert.ok(wilson(4, 4, 0.9).lower < 0.6);
  const sizes = {
    ...setup,
    sets: { working: [1, 2, 3, 4, 5], validation: [6, 7], confirmation: [8, 9] },
  };
  assert.throws(() => validateSetSizes(sizes, []), /validation requires/);
  assert.throws(
    () => minimumUnits({ ...setup, criteria: [{ ...judged("x"), target: 10 }] }),
    /cannot reach/,
  );
  assert.throws(() => validateSetup({}), /goal/);
});
test("ratchet goal, plateau, exhaustion, stop, cap, and raised cap", () => {
  const f = fixture();
  const state = {
    setup,
    standings: f.currentStanding,
    capture: f.after,
    plateau: 0,
    rounds: 24,
    cap: 25,
    recommendations: [{}],
  };
  assert.equal(stopReason(state), "goal");
  state.standings.a.working.lower = 5;
  assert.equal(stopReason(state), null);
  assert.equal(stopReason({ ...state, plateau: 3 }), "plateau");
  assert.equal(stopReason({ ...state, recommendations: [] }), "exhausted");
  assert.equal(stopReason({ ...state, stop: true }), "stopped");
  assert.equal(stopReason({ ...state, rounds: 25 }), "cap");
  assert.equal(stopReason({ ...state, rounds: 25, cap: 26 }), null);
});
