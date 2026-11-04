import { holm, signTest, measuredStanding, median } from "./stats.mjs";
import { pooledAgreement } from "./scoring.mjs";

function required(value, message) {
  if (value == null) throw new Error(message);
  return value;
}
export function compareDecision(setup, targets, comparison, before, after, units) {
  const { alpha, minAgreement, regressionTolerance } = setup.thresholds;
  if (!targets.length || targets.length > 3 || new Set(targets).size !== targets.length)
    throw new Error("round requires 1 to 3 distinct target criteria");
  for (const c of setup.criteria.filter((c) => c.type === "judged")) {
    for (const set of ["working", "validation"]) {
      const result = required(comparison[c.id]?.[set], `missing comparison ${c.id}:${set}`);
      if (!result.count || !Number.isFinite(result.agreement))
        throw new Error(`insufficient comparison ${c.id}:${set}`);
    }
  }
  for (const c of setup.criteria.filter((c) => c.type === "judged"))
    for (const set of ["working", "validation"]) {
      const critical = comparison[c.id][set].itemVerdicts?.find(
        (item) => item.critical && item.verdict === "loss",
      );
      if (critical) return { reason: `critical:${critical.item}:${c.id}` };
    }
  if (pooledAgreement(comparison) < minAgreement) return { failed: true, reason: "agreement" };
  for (const c of setup.criteria.filter((c) => c.type === "gate"))
    if (required(after.gates[c.id], `missing gate ${c.id}`) !== true)
      return { reason: `gate:${c.id}` };
  for (const id of targets)
    if (!setup.criteria.some((c) => c.id === id && c.type === "judged"))
      throw new Error(`target is not judged: ${id}`);
  if (
    units !== undefined &&
    (!Array.isArray(units) ||
      !units.length ||
      new Set(units).size !== units.length ||
      units.some((unit) => !setup.sets.working.includes(unit)))
  )
    throw new Error("local improvement requires distinct working units");
  const pValues = targets.map((id) =>
    signTest(comparison[id].working.wins, comparison[id].working.losses),
  );
  const improved =
    units === undefined
      ? holm(pValues, alpha).some(Boolean)
      : targets.some((id) => {
          const results = required(
            comparison[id].working.itemVerdicts,
            "local improvement requires item verdicts",
          );
          return units.every((unit) => {
            const expected = after.items.filter((item) => item.unit === unit);
            if (!expected.length) throw new Error(`local unit has no items: ${unit}`);
            return expected.every((item) => {
              const scored = results.filter(
                (result) => result.item === item.id && result.unit === unit,
              );
              if (scored.length !== 1)
                throw new Error(`missing or duplicate local item verdict: ${item.id}`);
              return scored[0].verdict === "win";
            });
          });
        });
  if (!improved) return { reason: "no-improvement" };
  for (const c of setup.criteria) {
    if (c.type === "judged") {
      for (const set of ["working", "validation"]) {
        const { wins, losses } = comparison[c.id][set];
        if (losses - wins > regressionTolerance) return { reason: `regression:${c.id}:${set}` };
      }
    } else if (c.type === "measured") {
      const previous = median(required(before.measurements[c.id], `missing measurement ${c.id}`));
      const current = median(required(after.measurements[c.id], `missing measurement ${c.id}`));
      const direction = Math.sign(c.map.at10 - c.map.at0);
      if ((previous - current) * direction > c.tolerance)
        return { reason: `regression:${c.id}:measured` };
    }
  }
  return { pass: true, pValues, rule: units === undefined ? "holm-sign-test" : "unit-unanimous" };
}

export function anchorDecision(setup, before, after) {
  if (pooledAgreement(after) < setup.thresholds.minAgreement)
    return { failed: true, reason: "agreement" };
  for (const c of setup.criteria.filter((c) => c.type === "judged")) {
    for (const set of ["working", "validation"]) {
      const previous = required(before[c.id]?.[set], `missing anchor ${c.id}:${set}`);
      const current = required(after[c.id]?.[set], `missing anchor ${c.id}:${set}`);
      if (previous.standing - current.standing > setup.thresholds.anchorTolerance)
        return { reason: `anchor:${c.id}:${set}` };
    }
  }
  return { pass: true };
}

export function keepDecision({
  setup,
  targets,
  comparison,
  before,
  after,
  previousStanding,
  currentStanding,
  fullGate,
  units,
}) {
  const compared = compareDecision(setup, targets, comparison, before, after, units);
  if (!compared.pass) return compared;
  const anchored = anchorDecision(setup, previousStanding, currentStanding);
  if (!anchored.pass) return anchored;
  return fullGate === true ? { keep: true, rule: compared.rule } : { reason: "full-gate" };
}
export function goalMet(setup, standings, capture) {
  return setup.criteria.every((c) => {
    if (c.type === "judged")
      return ["working", "validation"].every((set) => {
        const result = required(standings[c.id]?.[set], `missing goal standing ${c.id}:${set}`);
        return result.count > 0 && result.lower >= c.target;
      });
    if (c.type === "gate")
      return required(capture.gates[c.id], `missing goal gate ${c.id}`) === true;
    const values = required(capture.measurements[c.id], `missing goal measurement ${c.id}`);
    return (
      values.length === c.runs && values.every((value) => measuredStanding(c, value) >= c.target)
    );
  });
}
export function stopReason({
  setup,
  standings,
  capture,
  stop,
  plateau,
  rounds,
  cap,
  recommendations,
}) {
  if (stop) return "stopped";
  if (goalMet(setup, standings, capture)) return "goal";
  if (plateau >= 3) return "plateau";
  if (rounds >= cap) return "cap";
  if (!recommendations.length) return "exhausted";
  return null;
}
