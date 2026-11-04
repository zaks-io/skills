import { createHash } from "node:crypto";
import { wilson } from "./stats.mjs";

export function seededHash(run, session, item) {
  return createHash("sha256")
    .update(JSON.stringify([run, session, item]))
    .digest("hex");
}
export function currentSide(run, family, item, judgeIndex, reverse = false) {
  const bit = parseInt(seededHash(run, family, item).slice(0, 2), 16) % 2;
  return (bit + judgeIndex + Number(reverse)) % 2 ? "B" : "A";
}
export function perspective(verdict, side) {
  if (!["A", "B", "same"].includes(verdict) || !["A", "B"].includes(side))
    throw new Error("invalid blind verdict or side");
  return verdict === "same" ? "tie" : verdict === side ? "win" : "loss";
}
export function combineJudges(verdicts) {
  if (verdicts.length < 2 || verdicts.some((v) => !["win", "loss", "tie"].includes(v)))
    throw new Error("an item requires the complete judge panel");
  return verdicts.every((v) => v === verdicts[0]) ? verdicts[0] : "tie";
}
export function combineUnit(verdicts) {
  if (!verdicts.length) throw new Error("unit has no evidence");
  const balance = verdicts.reduce((sum, v) => sum + (v === "win" ? 1 : v === "loss" ? -1 : 0), 0);
  return balance > 0 ? "win" : balance < 0 ? "loss" : "tie";
}
export function standing(verdicts, confidence) {
  if (!verdicts.length) throw new Error("standing has no reference-unit pairs");
  const wins = verdicts.filter((v) => v === "win").length;
  const losses = verdicts.filter((v) => v === "loss").length;
  const ties = verdicts.length - wins - losses;
  const interval = wilson(wins + ties / 2, verdicts.length, confidence);
  return {
    wins,
    losses,
    ties,
    count: verdicts.length,
    standing: (10 * (wins + ties / 2)) / verdicts.length,
    lower: 10 * interval.lower,
    upper: 10 * interval.upper,
  };
}

export function scoreSessions(sessions, criteria, confidence) {
  if (sessions.length < 2 || sessions.some((s) => !s.verdicts))
    throw new Error("scoring requires every judge's recorded verdicts");
  const output = Object.create(null);
  for (const criterion of criteria.filter((c) => c.type === "judged")) {
    const sets = {};
    for (const first of sessions[0].pairs.filter((p) => !p.duplicate)) {
      const mapped = sessions.map((session) => {
        const pair = session.pairs.find((p) => p.key === first.key);
        if (!pair) throw new Error(`judge missing pair ${first.key}`);
        const verdict = session.verdicts.find(
          (v) => v.pair === pair.pair && v.criterion === criterion.id,
        );
        if (!verdict) throw new Error(`judge missing ${pair.pair}/${criterion.id}`);
        return perspective(verdict.verdict, pair.currentSide);
      });
      const set = (sets[first.set] ??= {
        groups: {},
        panels: {},
        agreements: 0,
        items: 0,
        itemVerdicts: [],
      });
      const group = JSON.stringify([first.reference, first.unit]);
      const verdict = first.self ? "tie" : combineJudges(mapped);
      (set.groups[group] ??= []).push(verdict);
      set.itemVerdicts.push({
        item: first.item,
        unit: first.unit,
        critical: first.critical === true,
        verdict,
      });
      (set.panels[group] ??= []).push(mapped);
      set.items++;
      set.agreements += Number(mapped.every((v) => v === mapped[0]));
    }
    output[criterion.id] = Object.fromEntries(
      Object.entries(sets).map(([set, data]) => [
        set,
        {
          ...standing(Object.values(data.groups).map(combineUnit), confidence),
          agreement: data.agreements / data.items,
          items: data.items,
          itemVerdicts: data.itemVerdicts,
          unitAgreement:
            Object.values(data.panels).filter((items) => {
              const units = sessions.map((_, judge) =>
                combineUnit(items.map((item) => item[judge])),
              );
              return units.every((v) => v === units[0]);
            }).length / Object.keys(data.panels).length,
          units: Object.fromEntries(
            Object.entries(data.groups).map(([unit, items]) => [unit, combineUnit(items)]),
          ),
        },
      ]),
    );
  }
  return output;
}

// The panel-health check pools every judged criterion and set: per-criterion
// agreement over a handful of items swings too much to declare the panel broken.
export function pooledAgreement(scores) {
  const results = Object.values(scores).flatMap((sets) => Object.values(sets));
  const items = results.reduce((sum, r) => sum + r.items, 0);
  if (!items) throw new Error("agreement requires scored items");
  return results.reduce((sum, r) => sum + r.agreement * r.items, 0) / items;
}

export function baselineStanding(state) {
  const capture = state.captures[state.baseline];
  return Object.fromEntries(
    state.setup.criteria
      .filter((c) => c.type === "judged")
      .map((c) => [
        c.id,
        Object.fromEntries(
          ["working", "validation"].map((set) => [
            set,
            {
              ...standing(
                state.setup.sets[set].map(() => "tie"),
                state.setup.thresholds.confidence,
              ),
              agreement: 1,
              items: capture.items.filter((item) => state.setup.sets[set].includes(item.unit))
                .length,
            },
          ]),
        ),
      ]),
  );
}
