#!/usr/bin/env node
// Calculate the dependency DAG start for Linear issue snapshots.
//
// Usage:
//   node linear-dag-start.mjs <snapshot-or-issues.json> [--config config.json]
//
// Accepts tick-snapshot output, an envelope with snapshot/state, a direct
// { issues: [...] } object, or a raw issue array.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_DONE_STATES = ["done", "closed", "complete", "completed"];
const TERMINAL_STATE_TYPES = ["completed", "canceled"];
const usage = "Usage: node linear-dag-start.mjs <snapshot-or-issues.json> [--config config.json]";

const toArray = (value) => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const compact = (values) => [
  ...new Set(
    values
      .map(String)
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];

const labelName = (label) => (typeof label === "string" ? label : label?.name);
const issueStateName = (issue) =>
  issue?.state?.name ?? issue?.state ?? issue?.status ?? issue?.workflowState;

const issueId = (issue) =>
  String(issue?.identifier ?? issue?.key ?? issue?.id ?? issue?.url ?? "").trim();

const blockerId = (blocker) =>
  String(
    typeof blocker === "string"
      ? blocker
      : (blocker?.identifier ?? blocker?.key ?? blocker?.id ?? blocker?.issue?.identifier ?? ""),
  ).trim();

const blockerStateType = (blocker) =>
  normalize(typeof blocker === "string" ? "" : (blocker?.stateType ?? blocker?.state?.type ?? ""));

const blockerRefs = (issue) =>
  compact(
    [
      ...toArray(issue?.blockedBy),
      ...toArray(issue?.blockers),
      ...toArray(issue?.dependsOn),
      ...toArray(issue?.dependencies),
    ]
      .filter((blocker) => !TERMINAL_STATE_TYPES.includes(blockerStateType(blocker)))
      .map(blockerId),
  );

const isDoneIssue = (issue, config = {}) => {
  const doneStates = new Set(
    [...DEFAULT_DONE_STATES, ...toArray(config.doneStates), config.doneState]
      .map(normalize)
      .filter(Boolean),
  );
  const state = normalize(issueStateName(issue));
  const stateType = normalize(issue?.stateType ?? issue?.state?.type);
  return doneStates.has(state) || TERMINAL_STATE_TYPES.includes(stateType);
};

const readinessMatches = (issue, config = {}) => {
  if (issue?.implementationReady || issue?.readyForImplementation) return true;

  const readyStates = new Set(
    [config.readyState, ...toArray(config.readyStates)].map(normalize).filter(Boolean),
  );
  const readinessLabels = new Set(
    [config.readinessLabel, ...toArray(config.readinessLabels)].map(normalize).filter(Boolean),
  );
  const state = normalize(issueStateName(issue));
  const labels = toArray(issue?.labels).map((label) => normalize(labelName(label)));

  if (readyStates.size === 0 && readinessLabels.size === 0) return true;
  return readyStates.has(state) || labels.some((label) => readinessLabels.has(label));
};

export function extractLinearIssues(input = {}) {
  if (Array.isArray(input)) return input;
  return (
    input.linear?.issues ??
    input.snapshot?.linear?.issues ??
    input.state?.tickets ??
    input.queue?.tickets ??
    input.issues ??
    input.nodes ??
    []
  );
}

export function linearDagStart(issuesInput = [], config = {}) {
  const issues = toArray(issuesInput).filter(
    (issue) => issueId(issue) && !isDoneIssue(issue, config),
  );
  const idByKey = new Map();
  const order = new Map();

  issues.forEach((issue, index) => {
    const id = issueId(issue);
    idByKey.set(normalize(id), id);
    order.set(id, index);
  });

  const nodes = new Map();
  for (const issue of issues) {
    const id = issueId(issue);
    const blockedBy = blockerRefs(issue);
    const inScopeBlockedBy = [];
    const externalBlockedBy = [];

    for (const blocker of blockedBy) {
      const inScopeId = idByKey.get(normalize(blocker));
      if (inScopeId) inScopeBlockedBy.push(inScopeId);
      else externalBlockedBy.push(blocker);
    }

    nodes.set(id, {
      id,
      title: issue.title ?? null,
      url: issue.url ?? null,
      state: issueStateName(issue) ?? null,
      stateType: issue.stateType ?? issue.state?.type ?? null,
      labels: toArray(issue.labels).map(labelName).filter(Boolean),
      blockedBy,
      inScopeBlockedBy: compact(inScopeBlockedBy),
      externalBlockedBy: compact(externalBlockedBy),
      blocks: [],
      root: false,
      unblocked: false,
      ready: readinessMatches(issue, config),
      layer: null,
    });
  }

  for (const node of nodes.values()) {
    for (const blocker of node.inScopeBlockedBy) {
      nodes.get(blocker)?.blocks.push(node.id);
    }
  }

  for (const node of nodes.values()) {
    node.blocks = compact(node.blocks).sort((a, b) => order.get(a) - order.get(b));
    node.root = node.inScopeBlockedBy.length === 0;
    node.unblocked = node.root && node.externalBlockedBy.length === 0;
  }

  const indegree = new Map(
    [...nodes.values()].map((node) => [node.id, node.inScopeBlockedBy.length]),
  );
  let queue = [...nodes.values()]
    .filter((node) => node.inScopeBlockedBy.length === 0)
    .map((node) => node.id)
    .sort((a, b) => order.get(a) - order.get(b));
  const layers = [];
  let layerIndex = 0;

  while (queue.length > 0) {
    layers.push(queue);
    const next = [];
    for (const id of queue) {
      nodes.get(id).layer = layerIndex;
      for (const child of nodes.get(id).blocks) {
        indegree.set(child, indegree.get(child) - 1);
        if (indegree.get(child) === 0) next.push(child);
      }
    }
    queue = compact(next).sort((a, b) => order.get(a) - order.get(b));
    layerIndex += 1;
  }

  const cycles = [...nodes.values()]
    .filter((node) => indegree.get(node.id) > 0)
    .map((node) => node.id);
  const roots = [...nodes.values()].filter((node) => node.root).map((node) => node.id);
  const starts = [...nodes.values()].filter((node) => node.unblocked).map((node) => node.id);
  const readyStarts = [...nodes.values()]
    .filter((node) => node.unblocked && node.ready)
    .map((node) => node.id);

  return {
    totalIssues: nodes.size,
    roots,
    starts,
    readyStarts,
    layers,
    cycles,
    missingBlockers: [...nodes.values()].flatMap((node) =>
      node.externalBlockedBy.map((blocker) => ({ ticket: node.id, blocker })),
    ),
    nodes: [...nodes.values()],
  };
}

const readJson = (source, label) => {
  if (!source) return {};
  try {
    const text = source === "-" ? readFileSync(0, "utf8") : readFileSync(source, "utf8");
    return text.trim() ? JSON.parse(text) : {};
  } catch (error) {
    console.error(`linear-dag-start: cannot read ${label}: ${error.message}`);
    process.exit(1);
  }
};

const main = () => {
  const args = process.argv.slice(2);
  const argValue = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const positional = args.filter(
    (arg, index) => !arg.startsWith("--") && args[index - 1] !== "--config",
  );

  if (positional.length !== 1) {
    console.error(`linear-dag-start: expected exactly one input\n${usage}`);
    process.exit(1);
  }

  const input = readJson(positional[0], "input");
  const config = { ...(input.config ?? {}), ...readJson(argValue("--config"), "--config") };
  process.stdout.write(
    `${JSON.stringify(linearDagStart(extractLinearIssues(input), config), null, 2)}\n`,
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
