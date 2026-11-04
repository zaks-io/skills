import { measuredStanding, median } from "./stats.mjs";
import { scoreSessions } from "./scoring.mjs";
import { panel, sessionsDone } from "./sessions.mjs";

const display = (result) =>
  result
    ? `${result.standing.toFixed(2)} [${result.lower.toFixed(2)}, ${result.upper.toFixed(2)}], n=${result.count}`
    : "not scored";
export function scoreboard(state) {
  const baseline = state.captures[state.baseline];
  const kept = state.captures[state.lastKept];
  const rows = ["| Criterion / set | Baseline | Last kept | Target |", "| --- | --- | --- | --- |"];
  for (const c of state.setup.criteria) {
    if (c.type === "judged")
      for (const set of ["working", "validation"]) {
        rows.push(
          `| ${c.id} / ${set} | ${display(state.baselineStanding?.[c.id]?.[set])} | ${display(state.standings?.[c.id]?.[set])} | ${c.target} |`,
        );
      }
    else if (c.type === "measured") {
      const show = (capture) =>
        capture
          ? measuredStanding(c, median(capture.measurements[c.id])).toFixed(2)
          : "not captured";
      rows.push(`| ${c.id} / measured | ${show(baseline)} | ${show(kept)} | ${c.target} |`);
    } else
      rows.push(
        `| ${c.id} / gate | ${baseline ? (baseline.gates[c.id] ? "pass" : "fail") : "not captured"} | ${kept ? (kept.gates[c.id] ? "pass" : "fail") : "not captured"} | pass |`,
      );
  }
  return rows.join("\n");
}
export function commentText(state, round) {
  const previous =
    state.rounds.filter((r) => r.outcome === "kept" && r.number < round.number).at(-1)?.anchored
      .standings ?? state.baselineStanding;
  const delta = state.setup.criteria
    .filter((c) => c.type === "judged")
    .map(
      (c) =>
        `${c.id}: ${["working", "validation"].map((set) => `${set} ${previous[c.id][set].standing.toFixed(1)} to ${round.anchored.standings[c.id][set].standing.toFixed(1)}`).join(", ")}`,
    )
    .join("; ");
  return `Round ${round.number} kept by ${round.compared.result.rule}. ${delta}\n${state.keeps} kept, ${state.rounds.length - state.keeps} reverted; full gate passed.`;
}
export function report(state) {
  const lines = [];
  if (sessionsDone(state, "fin-base") && sessionsDone(state, "fin-ref")) {
    const base = scoreSessions(
      panel(state, "fin-base"),
      state.setup.criteria,
      state.setup.thresholds.confidence,
    );
    const reference = scoreSessions(
      panel(state, "fin-ref"),
      state.setup.criteria,
      state.setup.thresholds.confidence,
    );
    const confirmation = [];
    let weak = false;
    for (const c of state.setup.criteria.filter((c) => c.type === "judged")) {
      const b = base[c.id].confirmation,
        r = reference[c.id].confirmation;
      weak ||= r.lower < c.target || b.wins <= b.losses;
      confirmation.push(
        `${c.id}: references ${display(r)}, target ${c.target}; against baseline ${b.wins} wins, ${b.losses} losses, ${b.ties} ties.`,
      );
    }
    lines.push(
      `${weak ? "Confirmation is below target or does not beat baseline. " : "Confirmation passed. "}${confirmation.join(" ")}`,
      "",
    );
  }
  lines.push(
    `Outcome: ${state.status}. Stop reason: ${state.stopReason ?? "in progress"}. ${state.keeps} kept, ${state.rounds.length - state.keeps} reverted.`,
    "",
    scoreboard(state),
    "",
  );
  const short = [];
  for (const c of state.setup.criteria) {
    if (c.type === "judged")
      for (const set of ["working", "validation"]) {
        const result = state.standings?.[c.id]?.[set];
        if (!result || result.lower < c.target) short.push(`${c.id}/${set}`);
        const comparisons = [...state.rounds, ...(state.active ? [state.active] : [])].map(
          (r) => r.compared?.comparison[c.id]?.[set],
        );
        if (result?.unitAgreement < 0.5 || comparisons.some((r) => r?.unitAgreement < 0.5))
          lines.push(`Judges disagreed on most units for ${c.id}/${set}.`);
      }
    else if (c.type === "measured") {
      const values = state.captures[state.lastKept]?.measurements[c.id];
      if (!values || values.some((v) => measuredStanding(c, v) < c.target)) short.push(c.id);
    } else if (state.captures[state.lastKept]?.gates[c.id] !== true) short.push(c.id);
  }
  lines.push(`Short of target: ${short.join(", ") || "none"}.`);
  for (const round of state.rounds.filter((r) => r.outcome === "kept"))
    lines.push(`Round ${round.number} kept by ${round.compared.result.rule}.`);
  const recommendations = Object.values(state.sessions).flatMap((s) => s.recommendations ?? []);
  for (const round of state.rounds.filter((r) => r.outcome === "reverted")) {
    lines.push(
      `Round ${round.number} reverted: ${round.reason}. ${round.recs.map((id) => `${id}: ${recommendations.find((r) => r.id === id)?.fix ?? id}`).join("; ")}`,
    );
  }
  lines.push(
    "",
    `Next step: ${state.status === "failed" ? "resolve the reported failure before starting a new run" : short.length ? "review the remaining criteria and references before another run" : state.keeps ? "review the draft PR" : "review the rubric and working recommendations"}.`,
  );
  return lines.join("\n") + "\n";
}
