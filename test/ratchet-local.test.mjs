import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fixture } from "./ratchet-cli-harness.test.mjs";
import { compareDecision } from "../skills/ziw-ratchet/scripts/decisions.mjs";
import { scoreSessions } from "../skills/ziw-ratchet/scripts/scoring.mjs";
import { defaults, validateSetup } from "../skills/ziw-ratchet/scripts/setup.mjs";

function plan(f, units) {
  const action = f.tick().actions[0];
  f.record(
    "plan",
    "--recs",
    action.recommendations[0].id,
    "--targets",
    "quality",
    "--units",
    units,
  );
  return f.tick().actions[0];
}

test("ratchet unit-targeted keep needs every targeted item and reports its rule", (t) => {
  const f = fixture(t);
  f.calibrate();
  const round = f.implement("local improvement", "working0");
  round.actions.forEach((a) => f.judge(a, (p) => (p.unit === "working0" ? "win" : "tie")));
  const refs = f.tick().actions;
  assert.ok(refs.every((a) => a.session.startsWith("r01-ref-")));
  refs.forEach((a) => f.judge(a, "win"));
  assert.equal(f.tick().actions[0].kind, "run-full-gate");
  f.record("checked", "--result", "pass");
  const comment = f.tick().actions[0];
  assert.match(comment.text, /kept by unit-unanimous/);
  assert.equal(f.git("rev-parse", "HEAD"), round.commit);
});

test("ratchet unit-targeted round reverts if any targeted unit ties", (t) => {
  const f = fixture(t);
  f.calibrate();
  const baseline = f.git("rev-parse", "HEAD");
  const round = f.implement("partial local improvement", "working0,working1");
  round.actions.forEach((a) => f.judge(a, (p) => (p.unit === "working1" ? "tie" : "win")));
  assert.equal(f.tick().actions[0].kind, "plan");
  assert.equal(f.journal().findLast((e) => e.type === "reverted").reason, "no-improvement");
  assert.equal(f.git("rev-parse", "HEAD"), baseline);
});

test("ratchet plans reject invalid local units and disclose context without held-out observations", (t) => {
  const f = fixture(t, true, {
    setup: { notes: "Users miss the action", context: ["target.txt"] },
  });
  f.calibrate();
  const action = f.tick().actions[0];
  for (const units of ["validation0", "confirmation0", "missing", "working0,working0", "working0,"])
    f.fail(
      /working unit/,
      "record",
      "plan",
      "--recs",
      action.recommendations[0].id,
      "--targets",
      "quality",
      "--units",
      units,
    );
  const round = f.implement("attempted action improvement");
  round.actions.forEach((a) => f.judge(a, "tie"));
  const next = plan(f, "working0");
  const brief = f.read(path.relative(f.root, next.brief));
  assert.match(brief, /Goal: Improve the target/);
  assert.match(brief, /Users miss the action/);
  assert.match(
    brief,
    /quality: Make the answer useful.*Correct facts.*Clear action.*Readable order/s,
  );
  assert.match(brief, /Context paths.*target.txt/);
  assert.match(brief, /run the app locally to check interactions/);
  assert.match(
    brief,
    /Previous attempts since the last keep:.*attempted action improvement.*no-improvement.*WORKING observation/s,
  );
  assert.doesNotMatch(brief, /HELDOUT|validation\d|confirmation\d|standing|history/);
});

for (const set of ["working", "validation"])
  test(`ratchet critical ${set} item vetoes an otherwise passing round`, (t) => {
    const f = fixture(t, true, { critical: `${set}0` });
    f.calibrate();
    const round = f.implement(`critical ${set} loss`, "working1");
    round.actions.forEach((a) => f.judge(a, (p) => (p.item === `${set}0` ? "loss" : "win")));
    assert.equal(f.tick().actions[0].kind, "plan");
    assert.equal(
      f.journal().findLast((e) => e.type === "reverted").reason,
      `critical:${set}0:quality`,
    );
  });

test("ratchet local rules inspect items before majority unit aggregation and retain vetoes", () => {
  const setup = {
    criteria: [{ id: "quality", type: "judged" }],
    thresholds: defaults,
    sets: { working: ["page", "other", "third", "fourth", "fifth"] },
  };
  const items = [
    { id: "wide", unit: "page" },
    { id: "narrow", unit: "page", critical: true },
    ...setup.sets.working.slice(1).map((unit) => ({ id: unit, unit })),
    { id: "heldout", unit: "validation" },
  ];
  const capture = { items, gates: {}, measurements: {} };
  const scores = (narrow, secondJudge = narrow) =>
    scoreSessions(
      [narrow, secondJudge].map((result) => ({
        pairs: items.map((item) => ({
          ...item,
          item: item.id,
          key: item.id,
          pair: item.id,
          set: item.id === "heldout" ? "validation" : "working",
          reference: "last",
          currentSide: "A",
        })),
        verdicts: items.map((item) => ({
          pair: item.id,
          criterion: "quality",
          verdict: item.id === "narrow" ? result : "A",
        })),
      })),
      setup.criteria,
      0.9,
    );
  const decide = (comparison) =>
    compareDecision(setup, ["quality"], comparison, capture, capture, ["page"]);
  assert.equal(decide(scores("A")).rule, "unit-unanimous");
  assert.equal(decide(scores("same")).reason, "no-improvement");
  assert.equal(decide(scores("A", "B")).reason, "no-improvement");
  assert.equal(decide(scores("B")).reason, "critical:narrow:quality");
  const regression = scores("A");
  Object.assign(regression.quality.validation, { wins: 0, losses: 1 });
  assert.equal(decide(regression).reason, "regression:quality:validation");
});

test("ratchet optional setup fields and critical flags reject malformed input", (t) => {
  const f = fixture(t, false);
  for (const references of [undefined, []])
    assert.deepEqual(validateSetup({ ...f.setup, references }).references, []);
  for (const notes of [[], " ", 1])
    assert.throws(() => validateSetup({ ...f.setup, notes }), /notes/);
  for (const context of [null, "target.txt", ["target.txt", "target.txt"], [""]])
    assert.throws(() => validateSetup({ ...f.setup, context }), /context/);
  assert.throws(() => validateSetup({ ...f.setup, references: null }), /references/);
  f.write(
    ".run/helper.mjs",
    f.helper.replace('"unit":"working0"', '"critical":"true","unit":"working0"'),
  );
  f.run("init", "--setup", f.file(".run/input.json"));
  f.fail(/critical must be boolean/, "capture");
});
