import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function rubricText(criteria) {
  return criteria
    .filter((c) => c.type === "judged")
    .map((c) => `- ${c.id}: ${c.definition}\n${c.checks.map((check) => `  - ${check}`).join("\n")}`)
    .join("\n");
}

export function judgeBrief(directory, pairs, criteria) {
  const rubric = rubricText(criteria);
  const listing = pairs
    .map(
      (p) =>
        `- ${p.pair}: ${p.location}/${p.pair}-A${p.extensionA}, ${p.location}/${p.pair}-B${p.extensionB}`,
    )
    .join("\n");
  return `Judge each pair on each criterion using only files in ${directory}. Sides are random, so assume neither is newer or better. Ignore length and polish the checks do not ask about.

For each pair and criterion, note what you see for each check on A and on B, then choose A, B, or same. Write verdicts.json here as {"verdicts":[{"pair":"p1","criterion":"${criteria.find((c) => c.type === "judged").id}","observations":"checks on A and B","verdict":"A"}]}. Include every pair and judged criterion exactly once.

${rubric}

${listing}

Produce verdicts only. Do not write recommendations.
`;
}

export function implementerBrief(root, directory, state, recommendations) {
  mkdirSync(directory, { recursive: true });
  const setup = state.setup;
  const capture = state.captures[state.lastKept];
  const listing = [];
  const sources = [{ name: "current", ...capture }, ...state.references];
  let index = 0;
  for (const source of sources) {
    for (const item of source.items.filter((i) => setup.sets.working.includes(i.unit))) {
      const file = `e${++index}${path.extname(item.file)}`;
      copyFileSync(path.join(source.directory, item.file), path.join(directory, file));
      listing.push(`- ${source.name}, item ${item.id}: ${file}`);
    }
  }
  const changes = recommendations
    .map((r) => `- ${r.id}, criterion ${r.criterion}, item ${r.item}: ${r.issue}. Fix: ${r.fix}`)
    .join("\n");
  const text = `Goal: ${setup.goal}
${setup.notes ? `Context from the user: ${setup.notes}` : ""}

Judged criteria:
${rubricText(setup.criteria)}

Apply these planned changes to the target in your own worktree:

${changes}
${state.active?.units ? `Working units to improve: ${state.active.units.join(", ")}.` : ""}

Target paths, relative to the repository root: ${setup.boundary.target.join(", ")}.
Protected paths you must not touch: ${setup.boundary.protected.join(", ")}.
Context paths, relative to the repository root: ${setup.context.join(", ") || "none supplied"}.
You may run the app locally to check interactions.
${previousAttempts(state)}
Run the focused check: ${setup.checks.focused}
Commit your work as one commit and report its final SHA, or explain why you could not finish. Do not modify evaluation machinery or read the coordinator's run directory. Use the copied evidence below for evaluation feedback. Read the listed context paths as needed.

${listing.join("\n")}
`;
  const brief = path.join(directory, "brief.md");
  writeFileSync(brief, text);
  return brief;
}

// Only reasons about evidence the implementer can see pass through; anything
// else, including unknown reasons, would leak held-out results.
const visibleReasons =
  /^(no-improvement|full-gate|boundary|implement-failed|capture-failed|stopped|gate:[^:]+|regression:[^:]+:(working|measured)|anchor:[^:]+:working)$/;
function visibleReason(state, reason) {
  if (visibleReasons.test(reason)) return reason;
  const critical = /^critical:(.+):[^:]+$/.exec(reason);
  const item = critical && state.captures[state.baseline].items.find((i) => i.id === critical[1]);
  return item && state.setup.sets.working.includes(item.unit)
    ? reason
    : "a check on evidence you cannot see failed";
}
export function previousAttempts(state) {
  const lastKeep = state.rounds.findLastIndex((r) => r.outcome === "kept");
  const attempts = state.rounds.slice(lastKeep + 1).filter((r) => r.outcome === "reverted");
  if (!attempts.length) return "";
  const compact = (text) => text.replace(/\s+/g, " ").slice(0, 240);
  const allIssues = Object.values(state.sessions).flatMap((s) => s.recommendations ?? []);
  return (
    "Previous attempts since the last keep:\n" +
    attempts
      .map((r) => {
        const changes = r.recs.map((id) => allIssues.find((issue) => issue.id === id)?.fix ?? id);
        const observations = state.setup.judges.flatMap((judge) => {
          const session = state.sessions[`r${String(r.number).padStart(2, "0")}-cmp-${judge}`];
          return (session?.verdicts ?? [])
            .filter(
              (v) =>
                r.targets.includes(v.criterion) &&
                session.pairs.some((p) => p.pair === v.pair && p.set === "working"),
            )
            .slice(0, 3)
            .map((v) => {
              const pair = session.pairs.find((p) => p.pair === v.pair);
              return `${judge}, ${pair.item}/${v.criterion}, candidate ${pair.currentSide}: ${compact(v.observations)}`;
            });
        });
        return `- Round ${r.number}: ${r.changes ? compact(r.changes) + "; " : ""}${changes.map(compact).join("; ")}. Reverted: ${visibleReason(state, r.reason)}. ${observations.join("; ")}`;
      })
      .join("\n")
  );
}
