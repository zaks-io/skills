#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { isMain, parseCli, runCli } from "./cli.mjs";
import { readJson, validatePlannerConfig } from "./planner-input.mjs";
import { loadPlannerState, recordPlannerState } from "./planner-state.mjs";
import { collectSnapshot } from "./tick-snapshot.mjs";
import { planTick } from "./tick-plan.mjs";
import { enrichActions } from "./action-briefs.mjs";

const usage =
  "Usage: node tick.mjs [--config docs/agents/workflow/planner.json] [--worker-cap N] [--pretty] [--debug] [--help]";
export async function main(args) {
  const parsed = parseCli(args, {
    usage,
    options: {
      config: { type: "string" },
      "worker-cap": { type: "string" },
      pretty: { type: "boolean" },
      debug: { type: "boolean" },
    },
  });
  if (!parsed) return;
  const { values } = parsed;
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const config = readJson(
    path.resolve(root, values.config ?? "docs/agents/workflow/planner.json"),
    "--config",
  );
  validatePlannerConfig(config);
  for (const name of ["repo", "linearTeam", "linearRouteLabel", "stateFile", "branchPrefix"])
    if (!config[name]?.trim()) throw new Error(`planner config requires ${name}`);
  if (values["worker-cap"] != null) {
    const cap = Number(values["worker-cap"]);
    const configured = config.workerConcurrencyCap ?? config.cap ?? 3;
    if (!/^\d+$/.test(values["worker-cap"]) || !Number.isSafeInteger(cap) || cap > configured)
      throw new Error(
        "--worker-cap must be a non-negative integer no higher than the configured cap",
      );
    config.workerConcurrencyCap = cap;
  }
  const stateFile = path.resolve(root, config.stateFile);
  let state = loadPlannerState({ file: stateFile, repo: config.repo });
  if (values["worker-cap"] != null)
    state = recordPlannerState({
      file: stateFile,
      repo: config.repo,
      observation: { workerLimit: config.workerConcurrencyCap },
    });
  const snapshot = await collectSnapshot({
    repo: config.repo,
    linearTeam: config.linearTeam,
    linearRouteLabel: config.linearRouteLabel,
    hostedReviewBots: config.hostedReviewBots,
    state,
  });
  const plan = enrichActions(
    planTick({ snapshot, config, state, debug: values.debug, stateValidated: true }),
    { snapshot, config, state, stateFile },
  );
  console.log(JSON.stringify(plan, null, values.pretty || values.debug ? 2 : 0));
}
if (isMain(import.meta.url)) await runCli("tick", () => main(process.argv.slice(2)));
