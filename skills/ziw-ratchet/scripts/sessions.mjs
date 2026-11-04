import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assert, readJson } from "./io.mjs";
import { currentSide, seededHash } from "./scoring.mjs";
import { stageCritique, readCritique } from "./critique.mjs";
import { judgeBrief } from "./session-briefs.mjs";

export const roundId = (number) => `r${String(number).padStart(2, "0")}`;
export function sessionIds(state, family) {
  return state.setup.judges.map((judge) => `${family}-${judge}`);
}
export function sessionsDone(state, family) {
  return sessionIds(state, family).every((id) => state.sessions[id]?.verdicts);
}
export function panel(state, family) {
  return sessionIds(state, family).map((id) => state.sessions[id]);
}

function pairsFor(state, family) {
  const confirmation = family.startsWith("fin-");
  const comparison = family.endsWith("cmp") || family === "fin-base";
  const current =
    state.captures[
      confirmation
        ? state.lastKept
        : family.startsWith("cal-")
          ? state.baseline
          : state.active.candidate
    ];
  assert(current, "missing current capture for session");
  const other = comparison
    ? [{ name: "previous", ...state.captures[confirmation ? state.baseline : state.lastKept] }]
    : state.references.length
      ? state.references
      : [{ name: "baseline", ...state.captures[state.baseline] }];
  const sets = confirmation ? ["confirmation"] : ["working", "validation"];
  const pairs = [];
  for (const set of sets)
    for (const reference of other) {
      for (const item of current.items.filter((i) => state.setup.sets[set].includes(i.unit))) {
        const match = reference.items.find((i) => i.id === item.id);
        if (!match) {
          assert(!comparison, `previous capture missing item ${item.id}`);
          continue;
        }
        assert(match.unit === item.unit, `reference unit differs for item ${item.id}`);
        pairs.push({
          key: JSON.stringify([reference.name, item.id]),
          item: item.id,
          unit: item.unit,
          critical: item.critical === true,
          set,
          reference: reference.name,
          currentFile: path.join(current.directory, item.file),
          otherFile: path.join(reference.directory, match.file),
          self: current.directory === reference.directory,
        });
      }
    }
  if (family === "cal-rev") {
    for (const unit of state.setup.sets.working.slice(0, 2)) {
      const item = current.items.find((i) => i.unit === unit);
      pairs.push({
        key: `duplicate:${item.id}`,
        item: item.id,
        unit,
        set: "working",
        reference: "duplicate",
        currentFile: path.join(current.directory, item.file),
        otherFile: path.join(current.directory, item.file),
        self: true,
        duplicate: true,
      });
    }
  }
  return pairs;
}

export function stageJudge(directory, state, family, judge, index) {
  if (family.endsWith("-crit")) return stageCritique(directory, state, family, judge);
  const id = `${family}-${judge}`;
  const sessionDirectory = path.join(directory, "sessions", id);
  const pairs = pairsFor(state, family)
    .sort((a, b) =>
      seededHash(state.runId, id, a.key).localeCompare(seededHash(state.runId, id, b.key)),
    )
    .map((pair, i) => {
      const side = currentSide(
        state.runId,
        family === "cal-rev" ? "cal-fwd" : family,
        pair.key,
        index,
        family === "cal-rev",
      );
      const fileA = side === "A" ? pair.currentFile : pair.otherFile;
      const fileB = side === "B" ? pair.currentFile : pair.otherFile;
      return {
        ...pair,
        pair: `p${i + 1}`,
        currentSide: side,
        location: pair.set === "validation" ? "validation" : ".",
        extensionA: path.extname(fileA),
        extensionB: path.extname(fileB),
      };
    });
  for (const pair of pairs) {
    const destination = path.join(sessionDirectory, pair.location);
    mkdirSync(destination, { recursive: true });
    const fileA = pair.currentSide === "A" ? pair.currentFile : pair.otherFile;
    const fileB = pair.currentSide === "B" ? pair.currentFile : pair.otherFile;
    copyFileSync(fileA, path.join(destination, `${pair.pair}-A${pair.extensionA}`));
    copyFileSync(fileB, path.join(destination, `${pair.pair}-B${pair.extensionB}`));
  }
  const brief = path.join(sessionDirectory, "brief.md");
  writeFileSync(brief, judgeBrief(sessionDirectory, pairs, state.setup.criteria));
  return {
    id,
    judge,
    family,
    directory: sessionDirectory,
    brief,
    pairs,
  };
}

export function readVerdicts(session, criteria) {
  if (session.family.endsWith("-crit")) return readCritique(session, criteria);
  const { verdicts } = readJson(path.join(session.directory, "verdicts.json"));
  assert(Array.isArray(verdicts), "verdicts.json requires verdicts");
  const expected = new Set(
    session.pairs.flatMap((p) =>
      criteria.filter((c) => c.type === "judged").map((c) => JSON.stringify([p.pair, c.id])),
    ),
  );
  for (const v of verdicts) {
    const key = JSON.stringify([v.pair, v.criterion]);
    assert(expected.delete(key), `unexpected or duplicate verdict ${v.pair}/${v.criterion}`);
    assert(["A", "B", "same"].includes(v.verdict), `invalid verdict ${v.pair}/${v.criterion}`);
    assert(
      typeof v.observations === "string" && v.observations.trim(),
      `missing observations ${v.pair}/${v.criterion}`,
    );
  }
  assert(!expected.size, `missing verdicts: ${[...expected].join(", ")}`);
  return { verdicts };
}

export function rankedRecommendations(state) {
  const available = state.recommendations.filter((r) => !state.tried.includes(r.id));
  return available
    .map((rec) => {
      const criterion = state.setup.criteria.find((c) => c.id === rec.criterion);
      const supported = state.recommendations.some(
        (r) => r.criterion === rec.criterion && r.item === rec.item && r.judge !== rec.judge,
      );
      return {
        ...rec,
        rank:
          { high: 3, medium: 2, low: 1 }[rec.severity] *
          criterion.weight *
          Math.max(1, criterion.target - state.standings[criterion.id].working.standing) *
          (supported ? 1.5 : 1),
      };
    })
    .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
}
