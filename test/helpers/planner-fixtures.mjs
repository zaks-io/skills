import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migratePlannerState } from "../../skills/ziw-orchestrate/scripts/planner-state.mjs";

// Historical test data crosses the explicit migration boundary before consumer tests run.
export function migrateFixtureState(state, repo = "example/repo") {
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-fixture-migration-"));
  try {
    const file = path.join(directory, "state.json");
    writeFileSync(file, JSON.stringify({ repo, ...state }));
    return migratePlannerState({ file, repo: state.repo ?? repo, dryRun: true }).state;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
export function currentFixture(input) {
  const snapshot = input.snapshot ?? input;
  const repo = snapshot.repo ?? input.state?.repo ?? "example/repo";
  const state = migrateFixtureState({ ...input.queue, ...input.state }, repo);
  const fixtures = { pullRequests: snapshot.prs ?? [], worktrees: snapshot.worktrees ?? [] };
  const linear = { ...snapshot.linear };
  if (linear.candidateIssueIds) {
    linear.candidateIssues = linear.candidateIssueIds.map((issueKey) => ({ issueKey }));
    delete linear.candidateIssueIds;
  }
  for (const name of ["issues", "activeIssues", "issueMetadata"]) {
    if (linear[name])
      linear[name] = migrateFixtureState({ linearIssues: linear[name] }, repo).linearIssues;
  }
  const converted = migrateFixtureState(fixtures, repo);
  const config = { ...input.config };
  delete config.requireConformanceEvidence;
  return {
    snapshot: {
      ...snapshot,
      v: 3,
      repo,
      prs: converted.pullRequests,
      worktrees: converted.worktrees,
      linear,
    },
    state,
    config,
  };
}
