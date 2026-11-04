import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assert, readJson } from "./io.mjs";
import { rubricText } from "./session-briefs.mjs";

export function critiqueFamily(state) {
  const round = state.rounds.findLast((r) => r.outcome === "kept")?.number ?? 0;
  return `r${String(round).padStart(2, "0")}-crit`;
}

export function stageCritique(directory, state, family, judge) {
  const id = `${family}-${judge}`;
  const sessionDirectory = path.join(directory, "sessions", id);
  mkdirSync(sessionDirectory, { recursive: true });
  const current = state.captures[state.lastKept];
  const items = current.items.filter((i) => state.setup.sets.working.includes(i.unit));
  const listing = [];
  const sources = [
    { name: "Current working evidence", ...current },
    ...state.references.map((r, i) => ({ ...r, name: `Reference ${i + 1} to learn from` })),
  ];
  for (const [index, source] of sources.entries()) {
    for (const item of source.items.filter((i) => items.some((working) => working.id === i.id))) {
      const file = `${index}-item-${encodeURIComponent(item.id)}${path.extname(item.file)}`;
      copyFileSync(path.join(source.directory, item.file), path.join(sessionDirectory, file));
      listing.push(`- ${source.name}, item ${item.id}: ${file}`);
    }
  }
  const brief = path.join(sessionDirectory, "brief.md");
  writeFileSync(
    brief,
    `Critique the current working evidence in ${sessionDirectory}. This session is not blind. References, when supplied, are examples to learn from. Find concrete issues against each judged criterion's definition and checks. Use only the staged files.

${rubricText(state.setup.criteria)}

${listing.join("\n")}

Write critique.json here as {"issues":[{"criterion":"id","item":"item id","severity":"high|medium|low","issue":"what is wrong","fix":"one concrete change"}]}. Return at most 15 issues; return an empty array if none remain. Each criterion and item combination may appear once. Issues must concern the current working evidence.
`,
  );
  return { id, judge, family, directory: sessionDirectory, brief, items };
}

export function readCritique(session, criteria) {
  const { issues } = readJson(path.join(session.directory, "critique.json"));
  assert(Array.isArray(issues) && issues.length <= 15, "critique requires at most 15 issues");
  const seen = new Set();
  const recommendations = issues.map((issue, index) => {
    assert(
      criteria.some((c) => c.type === "judged" && c.id === issue.criterion),
      "critique requires a judged criterion",
    );
    assert(
      session.items.some((item) => item.id === issue.item),
      "critique requires a working item",
    );
    assert(["high", "medium", "low"].includes(issue.severity), "invalid critique severity");
    for (const key of ["issue", "fix"])
      assert(typeof issue[key] === "string" && issue[key].trim(), `critique requires ${key}`);
    const key = JSON.stringify([issue.criterion, issue.item]);
    assert(!seen.has(key), "duplicate critique issue");
    seen.add(key);
    return { ...issue, id: `${session.id}-issue${index + 1}`, judge: session.judge };
  });
  return { verdicts: [], recommendations };
}
