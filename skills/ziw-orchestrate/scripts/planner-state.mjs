#!/usr/bin/env node
import { isMain, parseCli, runCli } from "./cli.mjs";
import { applyObservations } from "./state-observations.mjs";
import { assertStateVersion, updateStateFile, validateBoundState } from "./state-file.mjs";
import { convertState } from "./state-migration.mjs";
import { commandObservation } from "./state-commands.mjs";

const usage = `Usage: node planner-state.mjs <init|record|worker|review-request|review-result|preparation|merge-result|migrate> --repo <owner/repo> --state <file>
  init [--scope K,K|default] [--worker-cap N|default]
  record <observations.json|->
  worker [--issue K] [--branch B] [--footprint F ...] [--session S] [--receipt R] [--run W] --status running|returned|failed|stopped [--pr N]
  review-request --pr N [--session S] [--receipt R] [--head H --fingerprint F] [--status running|failed|stopped]
  review-result --pr N [--session S] [--receipt R] --verdict APPROVE|"NEEDS REVISION" --count N
  preparation --issue K --outcome ready|needs-slicing|needs-human --reason TEXT --updated-at TIME
  merge-result --pr N --issue K --head H --merge-commit H --check passed|failed [--tracker-updated-at TIME]
  migrate [--dry-run]`;
export function loadPlannerState({ file, repo }) {
  return updateStateFile({ file, repo, initializeOnly: true, transform: (state) => state }).state;
}
export function recordPlannerState({ file, repo, observation = {}, buildObservation }) {
  return updateStateFile({
    file,
    repo,
    transform: (state) => {
      validateBoundState(state, repo, file);
      return applyObservations(state, buildObservation ? buildObservation(state) : observation);
    },
  }).state;
}
export function migratePlannerState({ file, repo, dryRun = false }) {
  return updateStateFile({
    file,
    repo,
    dryRun,
    backup: true,
    requireExisting: true,
    transform: (state) => {
      if (state.v === 3) return validateBoundState(state, repo, file);
      if (state.v > 3) assertStateVersion(state, file, repo);
      if (state.v != null && ![1, 2].includes(state.v))
        throw new Error("unsupported state version");
      return convertState({ ...state, repo: state.repo ?? repo });
    },
  });
}
export function main(args) {
  const parsed = parseCli(args, {
    usage,
    allowPositionals: true,
    options: {
      ...Object.fromEntries(
        [
          "state",
          "repo",
          "issue",
          "branch",
          "session",
          "receipt",
          "run",
          "status",
          "pr",
          "head",
          "fingerprint",
          "verdict",
          "count",
          "scope",
          "worker-cap",
          "outcome",
          "reason",
          "updated-at",
          "merge-commit",
          "check",
          "tracker-updated-at",
          "pr-url",
          "worktree",
        ].map((name) => [name, { type: "string" }]),
      ),
      footprint: { type: "string", multiple: true },
      "dry-run": { type: "boolean" },
    },
  });
  if (!parsed) return;
  const {
    values,
    positionals: [command, ...positionals],
  } = parsed;
  if (!values.state || !values.repo) throw new Error(`--state and --repo are required\n${usage}`);
  if (command === "migrate") {
    const result = migratePlannerState({
      file: values.state,
      repo: values.repo,
      dryRun: values["dry-run"],
    });
    console.log(
      result.alreadyV3
        ? "already v3"
        : values["dry-run"]
          ? JSON.stringify(result.state, null, 2)
          : "Planner state migrated to v3.",
    );
    return;
  }
  if (
    ![
      "init",
      "record",
      "worker",
      "review-request",
      "review-result",
      "preparation",
      "merge-result",
    ].includes(command)
  )
    throw new Error(`unknown command: ${command ?? "(missing)"}\n${usage}`);
  if (values["dry-run"]) throw new Error("--dry-run is only supported by migrate");
  if (command !== "record" && positionals.length)
    throw new Error(`unexpected positional: ${positionals[0]}\n${usage}`);
  recordPlannerState({
    file: values.state,
    repo: values.repo,
    buildObservation: (state) => commandObservation(command, values, positionals, state),
  });
  console.log("Planner state saved.");
}
if (isMain(import.meta.url)) await runCli("planner-state", () => main(process.argv.slice(2)));
