import { readFileSync } from "node:fs";
import { validateInput, validateConfig } from "./planner-input-validator.mjs";
import { parseCli } from "./cli.mjs";
import { assertStateVersion, readPlannerState } from "./state-file.mjs";

export const plannerUsage =
  "Usage: node tick-plan.mjs <snapshot-or-envelope.json> [--config config.json] [--state state.json] [--pretty] [--debug] [--help]";
export function validate(value, validator, source) {
  if (validator(value)) return;
  const error = validator.errors[0];
  const field = error.params.additionalProperty ?? error.params.missingProperty;
  throw new Error(
    `${source}${error.instancePath || ""}${field ? `/${field}` : ""}: ${error.message}`,
  );
}
export function readJson(source, label) {
  if (source === undefined) return {};
  if (!source.trim()) throw new Error(`${label}: expected a file path`);
  let content;
  try {
    content = readFileSync(source === "-" ? 0 : source, "utf8");
  } catch (error) {
    throw new Error(`${label}: cannot read JSON input (${error.code})`);
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`${label}: invalid JSON; expected a non-empty JSON object`);
  }
}
export function validatePlannerConfig(config, source = "config") {
  if (config && Object.hasOwn(config, "requireConformanceEvidence"))
    throw new Error(
      `${source}/requireConformanceEvidence is retired; the review verdict now carries conformance`,
    );
  validate(config, validateConfig, source);
  const soft = config.localBudgetSoftStopPercent;
  const hard = config.localBudgetHardStopPercent;
  if ((soft == null) !== (hard == null) || soft > hard)
    throw new Error("config: local budget thresholds must be supplied together with soft <= hard");
  return config;
}
export function validatePlannerArguments({
  snapshot,
  config = {},
  state = { v: 3, repo: snapshot?.repo },
  stateValidated = false,
}) {
  if (!stateValidated) assertStateVersion(state, "<inline state>", snapshot?.repo);
  validatePlannerConfig(config);
  validate({ snapshot, config, ...(stateValidated ? {} : { state }) }, validateInput, "input");
  if (!snapshot.repo && !state.repo)
    throw new Error(
      "snapshot is missing repo identity; refusing to plan from empty or partial evidence",
    );
  if (snapshot.repo && state.repo && snapshot.repo !== state.repo)
    throw new Error("snapshot.repo and state.repo must identify the same repository");
}
export function loadPlannerInput(args) {
  const parsed = parseCli(args, {
    usage: plannerUsage,
    allowPositionals: true,
    options: {
      config: { type: "string" },
      state: { type: "string" },
      pretty: { type: "boolean" },
      debug: { type: "boolean" },
    },
  });
  if (!parsed) return null;
  const { values, positionals } = parsed;
  if (positionals.length !== 1) throw new Error(`expected exactly one input\n${plannerUsage}`);
  if ([positionals[0], values.config, values.state].filter((file) => file === "-").length > 1)
    throw new Error("stdin can supply only one planner input");
  const input = readJson(positionals[0], "input");
  if (input?.config) validatePlannerConfig(input.config, "input/config");
  if (input?.state)
    assertStateVersion(input.state, positionals[0], input.snapshot?.repo ?? input.repo);
  if (input?.queue)
    assertStateVersion(input.queue, positionals[0], input.snapshot?.repo ?? input.repo);
  const configFile = readJson(values.config, "--config");
  validatePlannerConfig(configFile, "--config");
  const repo = input?.snapshot?.repo ?? input?.repo;
  const stateFile = values.state ? readPlannerState(values.state, repo) : {};
  validate(input, validateInput, "input");
  const {
    snapshot: nestedSnapshot,
    config: inlineConfig,
    state: inlineState,
    queue,
    ...direct
  } = input;
  if (nestedSnapshot && Object.keys(direct).length)
    throw new Error("input: use either snapshot or direct snapshot fields, not both");
  const snapshot = nestedSnapshot ?? direct;
  const state = { v: 3, repo: snapshot.repo, ...queue, ...inlineState, ...stateFile };
  const config = { ...inlineConfig, ...configFile };
  validatePlannerArguments({ snapshot, state, config });
  return { snapshot, state, config, debug: values.debug ?? false, pretty: values.pretty ?? false };
}
