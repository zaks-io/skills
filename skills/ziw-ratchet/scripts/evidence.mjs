import { mkdirSync, mkdtempSync, renameSync } from "node:fs";
import path from "node:path";
import {
  assert,
  clean,
  fileHash,
  filesUnder,
  git,
  hash,
  prefixMatches,
  shell,
  writeJson,
} from "./io.mjs";
import { readItems } from "./setup.mjs";
import { append, fold } from "./run-records.mjs";

export function boundaryViolation(root, state, manifest) {
  const files = git(root, "diff", "--name-only", "-z", state.lastKept, "HEAD")
    .split("\0")
    .filter(Boolean);
  const touched = files.find((file) =>
    state.setup.boundary.protected.some((prefix) => prefixMatches(file, prefix)),
  );
  if (touched) return `protected path changed: ${touched}`;
  let hashes;
  try {
    hashes = filesUnder(root, state.setup.boundary.protected);
  } catch (error) {
    return error.message;
  }
  if (JSON.stringify(hashes) !== JSON.stringify(manifest.protected))
    return "protected file hashes differ from the approved manifest";
  return null;
}

export function approve(root, directory, state) {
  clean(root);
  assert(git(root, "rev-parse", "HEAD") === state.baseline, "approval HEAD must equal baseline");
  const manifest = {
    setup: state.setup,
    baseline: state.baseline,
    branch: state.branch,
    thresholds: state.setup.thresholds,
    protected: filesUnder(root, state.setup.boundary.protected),
    references: filesUnder(root, state.setup.references),
  };
  const file = path.join(directory, "manifest.json");
  writeJson(file, manifest);
  return fileHash(file);
}

export function capture(root, directory, events, manifest) {
  const state = fold(events);
  const sha = git(root, "rev-parse", "HEAD");
  const expected = state.active?.candidate ?? state.baseline;
  assert(sha === expected, "capture HEAD does not match the expected candidate or baseline");
  assert(!state.captures[sha], "this commit already has captured evidence");
  if (state.active) {
    const reason = boundaryViolation(root, state, manifest);
    if (reason) return append(directory, events, { type: "boundary-violation", reason });
  }
  clean(root);
  const temporary = mkdtempSync(path.join(directory, ".capture-"));
  const recipe = shell(root, state.setup.recipe, { RATCHET_OUT: temporary });
  assert(recipe.code === 0, `recipe failed with exit ${recipe.code}: ${recipe.stderr.trim()}`);
  const items = readItems(temporary, state.setup);
  const baseline = state.captures[state.baseline];
  if (baseline) {
    const identity = (list) =>
      list
        .map(({ id, unit, critical }) => [id, unit, critical === true])
        .sort(([a], [b]) => a.localeCompare(b));
    assert(
      JSON.stringify(identity(items)) === JSON.stringify(identity(baseline.items)),
      "capture item IDs, units, or critical flags differ from baseline",
    );
  }
  for (const unit of Object.values(state.setup.sets).flat())
    assert(
      items.some((i) => i.unit === unit),
      `capture missing unit ${unit}`,
    );
  for (const reference of state.references)
    for (const item of reference.items)
      assert(
        items.some((i) => i.id === item.id && i.unit === item.unit),
        `reference item does not match baseline: ${item.id}`,
      );
  const gates = Object.create(null),
    measurements = Object.create(null),
    commands = Object.create(null);
  for (const criterion of state.setup.criteria.filter((c) => c.type !== "judged")) {
    const results = Array.from({ length: criterion.type === "gate" ? 1 : criterion.runs }, () =>
      shell(root, criterion.command, { RATCHET_OUT: temporary }),
    );
    commands[criterion.id] = results;
    if (criterion.type === "gate") gates[criterion.id] = results[0].code === 0;
    else
      measurements[criterion.id] = results.map((result) => {
        assert(result.code === 0, `measurement command failed: ${criterion.id}`);
        const last = result.stdout.trim().split(/\r?\n/).at(-1);
        assert(
          last && Number.isFinite(Number(last)),
          `measurement must print a number on its last line: ${criterion.id}`,
        );
        return Number(last);
      });
  }
  assert(git(root, "rev-parse", "HEAD") === sha, "capture command changed HEAD");
  clean(root);
  if (state.active) {
    const reason = boundaryViolation(root, state, manifest);
    if (reason) return append(directory, events, { type: "boundary-violation", reason });
  }
  writeJson(path.join(temporary, "capture.json"), { sha, recipe, commands, gates, measurements });
  const destination = path.join(directory, "evidence", sha);
  // rename stays on the run filesystem and makes a completed capture visible atomically.
  const parent = path.dirname(destination);
  mkdirSync(parent, { recursive: true });
  renameSync(temporary, destination);
  const hashes = Object.fromEntries(
    items.map((item) => [item.file, fileHash(path.join(destination, item.file))]),
  );
  return append(directory, events, {
    type: "captured",
    sha,
    directory: destination,
    items,
    gates,
    measurements,
    hashes,
    boundaryHash: state.active ? hash(JSON.stringify(manifest.protected)) : null,
  });
}
