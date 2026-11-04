import test from "node:test";
import assert from "node:assert/strict";
import {
  signTest,
  holm,
  wilson,
  median,
  measuredStanding,
} from "../skills/ziw-ratchet/scripts/stats.mjs";

test("ratchet exact one-sided sign test excludes ties", () => {
  assert.equal(signTest(5, 0), 0.03125);
  assert.equal(signTest(4, 0), 0.0625);
  assert.equal(signTest(0, 0), 1);
  assert.equal(signTest(3, 3), 1);
  assert.ok(Math.abs(signTest(5, 1) - 7 / 64) < 1e-14);
  assert.throws(() => signTest(-1, 0), /nonnegative/);
});
test("ratchet Holm correction stops at the first nonrejection", () => {
  assert.deepEqual(holm([0.02, 0.04, 0.9], 0.1), [true, true, false]);
  assert.deepEqual(holm([0.04, 0.049, 0.06], 0.1), [false, false, false]);
  assert.deepEqual(holm([0.9, 0.01, 0.04], 0.1), [false, true, true]);
});
test("ratchet Wilson interval matches the known 95 percent interval", () => {
  const result = wilson(5, 10, 0.95);
  assert.ok(Math.abs(result.lower - 0.2365930905) < 1e-8);
  assert.ok(Math.abs(result.upper - 0.7634069095) < 1e-8);
  assert.throws(() => wilson(0, 0), /nonempty/);
});
test("ratchet median and measured mappings support either direction", () => {
  assert.equal(median([4, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.throws(() => median([]), /finite/);
  assert.throws(() => median([NaN]), /finite/);
  assert.equal(measuredStanding({ map: { at0: 4000, at10: 1200 } }, 2600), 5);
  assert.equal(measuredStanding({ map: { at0: 0, at10: 100 } }, 120), 10);
  assert.equal(measuredStanding({ map: { at0: 0, at10: 100 } }, -1), 0);
});
