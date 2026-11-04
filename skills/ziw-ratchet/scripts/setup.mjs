import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  assert,
  clean,
  filesUnder,
  git,
  hash,
  inside,
  readJson,
  writeJson,
  prefixMatches,
  withRunLock,
} from "./io.mjs";
import { minimumUnits } from "./stats.mjs";
import { append } from "./run-records.mjs";

export const defaults = {
  alpha: 0.1,
  confidence: 0.9,
  regressionTolerance: 0,
  anchorTolerance: 1,
  minAgreement: 0.6,
};
const strings = (value) =>
  Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && v.trim());
const unique = (values) => new Set(values).size === values.length;
const number = (value) => typeof value === "number" && Number.isFinite(value);
export function validateSetup(input) {
  assert(input && typeof input === "object", "setup must be an object");
  const setup = structuredClone(input);
  for (const key of ["goal", "ticket", "implementer", "recipe"])
    assert(typeof setup[key] === "string" && setup[key].trim(), `setup requires ${key}`);
  assert(
    strings(setup.judges) && setup.judges.length >= 2 && unique(setup.judges),
    "setup requires at least two distinct judges",
  );
  assert(
    setup.judges.every((j) => /^[a-zA-Z0-9_-]+$/.test(j)),
    "judge IDs must contain letters, digits, underscores or hyphens",
  );
  if (setup.notes !== undefined)
    assert(typeof setup.notes === "string" && setup.notes.trim(), "notes must be nonempty text");
  if (setup.context === undefined) setup.context = [];
  assert(
    Array.isArray(setup.context) &&
      setup.context.every((v) => typeof v === "string" && v.trim()) &&
      unique(setup.context),
    "context must be distinct paths",
  );
  if (setup.references === undefined) setup.references = [];
  const units = [];
  for (const set of ["working", "validation", "confirmation"]) {
    assert(strings(setup.sets?.[set]), `setup requires ${set} units`);
    units.push(...setup.sets[set]);
  }
  assert(unique(units), "set units must be distinct and disjoint");
  assert(
    Array.isArray(setup.references) &&
      setup.references.every((r) => typeof r === "string" && r.trim()) &&
      unique(setup.references),
    "references must be a distinct array of paths",
  );
  for (const key of ["target", "protected"])
    assert(strings(setup.boundary?.[key]), `boundary requires ${key} paths`);
  for (const target of setup.boundary.target)
    for (const protectedPath of setup.boundary.protected)
      assert(
        !prefixMatches(target, protectedPath) && !prefixMatches(protectedPath, target),
        "target and protected paths overlap",
      );
  for (const key of ["focused", "full"])
    assert(
      typeof setup.checks?.[key] === "string" && setup.checks[key].trim(),
      `checks requires ${key}`,
    );
  assert(Array.isArray(setup.criteria) && setup.criteria.length, "setup requires criteria");
  assert(unique(setup.criteria.map((c) => c.id)), "criterion IDs must be distinct");
  for (const c of setup.criteria) {
    assert(typeof c.id === "string" && /^[a-zA-Z0-9_-]+$/.test(c.id), "invalid criterion ID");
    assert(["judged", "measured", "gate"].includes(c.type), `invalid criterion type: ${c.id}`);
    if (c.type !== "gate") {
      assert(number(c.weight) && c.weight > 0, `invalid weight: ${c.id}`);
      assert(number(c.target) && c.target >= 0 && c.target <= 10, `invalid target: ${c.id}`);
    } else
      assert(c.weight == null && c.target == null, `gates have no weight or standing: ${c.id}`);
    if (c.type === "judged") {
      assert(
        typeof c.definition === "string" && c.definition.trim(),
        `missing definition: ${c.id}`,
      );
      assert(
        strings(c.checks) && c.checks.length >= 3 && c.checks.length <= 6,
        `judged criterion needs 3 to 6 checks: ${c.id}`,
      );
    } else assert(typeof c.command === "string" && c.command.trim(), `missing command: ${c.id}`);
    if (c.type === "measured") {
      assert(Number.isSafeInteger(c.runs) && c.runs > 0, `invalid measurement runs: ${c.id}`);
      for (const key of ["minChange", "tolerance"])
        assert(number(c[key]) && c[key] >= 0, `invalid ${key}: ${c.id}`);
      assert(
        number(c.map?.at0) && number(c.map?.at10) && c.map.at0 !== c.map.at10,
        `invalid measurement map: ${c.id}`,
      );
    }
  }
  assert(
    setup.criteria.some((c) => c.type === "judged"),
    "setup requires at least one judged criterion",
  );
  setup.cap ??= 25;
  assert(Number.isSafeInteger(setup.cap) && setup.cap > 0, "cap must be a positive integer");
  setup.thresholds = { ...defaults, ...setup.thresholds };
  for (const [key, value] of Object.entries(setup.thresholds)) {
    assert(Object.hasOwn(defaults, key) && number(value), `invalid threshold: ${key}`);
    assert(
      ["alpha", "confidence"].includes(key) ? value > 0 && value < 1 : value >= 0,
      `invalid threshold: ${key}`,
    );
  }
  assert(setup.thresholds.minAgreement <= 1, "minAgreement must be <= 1");
  minimumUnits(setup);
  return setup;
}

export function readItems(directory, setup) {
  const data = readJson(path.join(directory, "items.json"));
  assert(Array.isArray(data.items) && data.items.length, `items.json requires items: ${directory}`);
  const units = Object.values(setup.sets).flat();
  for (const item of data.items) {
    assert(
      typeof item.id === "string" && item.id.trim() && units.includes(item.unit),
      `invalid item ID or unit: ${directory}`,
    );
    assert(
      item.critical === undefined || typeof item.critical === "boolean",
      "item critical must be boolean",
    );
    inside(directory, item.file);
    filesUnder(directory, [item.file]);
  }
  assert(unique(data.items.map((i) => i.id)), `duplicate evidence item IDs: ${directory}`);
  return data.items;
}
export function validateSetSizes(setup, references) {
  const minimum = minimumUnits(setup);
  assert(
    setup.sets.working.length >= minimum.working,
    `working requires at least ${minimum.working} units`,
  );
  for (const set of ["validation", "confirmation"]) {
    const count = references.length
      ? references.reduce(
          (sum, r) =>
            sum +
            new Set(r.items.filter((i) => setup.sets[set].includes(i.unit)).map((i) => i.unit))
              .size,
          0,
        )
      : setup.sets[set].length;
    assert(
      count >= minimum[set],
      `${set} requires at least ${minimum[set]} reference-unit pairs; got ${count}`,
    );
  }
  return minimum;
}
export function initialize(root, directory, setupFile) {
  try {
    git(root, "check-ignore", "--", path.relative(root, directory));
  } catch {
    throw new Error("run directory must be git-ignored");
  }
  mkdirSync(directory, { recursive: true });
  return withRunLock(directory, () => createRun(root, directory, setupFile));
}
function createRun(root, directory, setupFile) {
  assert(!existsSync(path.join(directory, "journal.jsonl")), "run already has a journal");
  clean(root);
  const setup = validateSetup(readJson(setupFile));
  for (const prefix of [...setup.boundary.target, ...setup.boundary.protected])
    inside(root, prefix);
  filesUnder(root, setup.context);
  const references = setup.references.map((name) => ({
    name,
    directory: inside(root, name),
    items: readItems(inside(root, name), setup),
  }));
  const minimum = validateSetSizes(setup, references);
  const baseline = git(root, "rev-parse", "HEAD");
  const branch = git(root, "symbolic-ref", "--short", "HEAD");
  writeJson(path.join(directory, "setup.json"), setup);
  const event = {
    type: "initialized",
    runId: hash(JSON.stringify([path.relative(root, directory), baseline, setup])),
    setup,
    baseline,
    branch,
    references,
    minimum,
  };
  append(directory, [], event);
  return { status: "setup", baseline, branch, minimum };
}
