import { perspective } from "./scoring.mjs";
import { panel } from "./sessions.mjs";
import { measuredStanding, median } from "./stats.mjs";

export function calibrationSummary(state, standings) {
  const lines = ["Calibration standings:"];
  if (!state.references.length)
    lines.push(
      "No references were set. Baseline standing is 5 by definition; future standing compares against the baseline.",
    );
  const baseline = state.captures[state.baseline];
  for (const c of state.setup.criteria.filter((c) => c.type !== "judged")) {
    lines.push(
      `${c.id}: ${c.type === "gate" ? (baseline.gates[c.id] ? "gate passed" : "gate failed") : `measured standing ${measuredStanding(c, median(baseline.measurements[c.id])).toFixed(2)}`}`,
    );
  }
  for (const c of state.setup.criteria.filter((c) => c.type === "judged")) {
    const sets = standings[c.id];
    lines.push(
      `${c.id}: ${["working", "validation"].map((set) => `${set} ${sets[set].standing.toFixed(2)} [${sets[set].lower.toFixed(2)}, ${sets[set].upper.toFixed(2)}], n=${sets[set].count}, agreement=${sets[set].agreement.toFixed(2)}`).join("; ")}`,
    );
  }
  const forward = state.references.length ? panel(state, "cal-fwd") : [],
    reverse = panel(state, "cal-rev");
  for (const [index, session] of forward.entries()) {
    const reversed = reverse[index];
    let directional = 0,
      flipped = 0;
    for (const pair of session.pairs)
      for (const c of state.setup.criteria.filter((c) => c.type === "judged")) {
        const otherPair = reversed.pairs.find((p) => p.key === pair.key);
        const a = session.verdicts.find((v) => v.pair === pair.pair && v.criterion === c.id);
        const b = reversed.verdicts.find((v) => v.pair === otherPair.pair && v.criterion === c.id);
        if (a.verdict !== "same" && b.verdict !== "same") {
          directional++;
          flipped += Number(
            perspective(a.verdict, pair.currentSide) !==
              perspective(b.verdict, otherPair.currentSide),
          );
        }
      }
    const duplicates = reversed.verdicts.filter(
      (v) => reversed.pairs.find((p) => p.pair === v.pair).duplicate,
    );
    const tieRate = duplicates.filter((v) => v.verdict === "same").length / duplicates.length;
    lines.push(
      `${session.judge}: position bias ${directional ? (flipped / directional).toFixed(2) : "n/a (no directional pairs)"}; duplicate tie rate ${tieRate.toFixed(2)}; sessions per round 1 if reverted, 3 if kept including critique.`,
    );
  }
  lines.push(
    `Minimum units: working ${state.minimum.working}; validation ${state.minimum.validation} and confirmation ${state.minimum.confirmation} reference-unit pairs. Round cap: ${state.cap}.`,
  );
  return lines.join("\n");
}
