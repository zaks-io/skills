import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadLinearSnapshot } from "../skills/ziw-orchestrate/scripts/linear-snapshot.mjs";

const routeLabel = "zaks-io/splitch";
const planner = path.resolve(
  import.meta.dirname,
  "../skills/ziw-orchestrate/scripts/tick-plan.mjs",
);

function issue(identifier, { route = routeLabel, state = "Todo", blockedBy } = {}) {
  return {
    identifier,
    title: identifier,
    description: `## Predicted file footprint\n\n- \`src/${identifier}.ts\``,
    state: { name: state, type: state === "In Progress" ? "started" : "unstarted" },
    labels: {
      nodes: ["kind-slice", "ready-for-agent", route].filter(Boolean).map((name) => ({ name })),
    },
    inverseRelations: {
      nodes: blockedBy
        ? [{ type: "blocks", issue: { identifier: blockedBy, state: { type: "unstarted" } } }]
        : [],
    },
  };
}

async function snapshot(issues, states = ["Todo"]) {
  const request = async ({ query }) =>
    query.includes("teams(first")
      ? { data: { teams: { nodes: [{ id: "team-id", key: "SPL", name: "Splitch" }] } } }
      : { data: { issues: { pageInfo: { hasNextPage: false }, nodes: issues } } };
  return loadLinearSnapshot({ request, selector: "SPL", routeLabel, states });
}

function plan(linear, state = {}, prs = []) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-snapshot-safety-"));
  try {
    const file = path.join(dir, "input.json");
    writeFileSync(
      file,
      JSON.stringify({
        snapshot: { repo: routeLabel, prs, linear },
        config: { workerConcurrencyCap: 3, mergeAuthority: "agent" },
        state,
      }),
    );
    return JSON.parse(execFileSync("node", [planner, file, "--debug"], { encoding: "utf8" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function frontier(linear, state = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-frontier-safety-"));
  try {
    const file = path.join(dir, "input.json");
    writeFileSync(file, JSON.stringify({ snapshot: { repo: routeLabel, linear }, state }));
    return JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(path.dirname(planner), "linear-dag-start.mjs"), file],
        { encoding: "utf8" },
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("Linear load through planner keeps wrong-repository blockers as dependencies and never dispatches them", async () => {
  const linear = await snapshot([
    issue("SPL-1", { blockedBy: "SPL-2" }),
    issue("SPL-2", { route: "zaks-io/other" }),
    issue("SPL-3", { route: "zaks-io/other" }),
    issue("SPL-4", { route: null }),
    issue("SPL-5"),
  ]);
  assert.deepEqual(linear.candidateIssueIds, ["SPL-1", "SPL-5"]);
  assert.deepEqual(
    linear.issues.map((item) => item.identifier),
    ["SPL-1", "SPL-2", "SPL-5"],
  );
  const output = plan(linear);
  assert.deepEqual(
    output.decisions.dispatch.selected.map((ticket) => ticket.id),
    ["SPL-5"],
  );
  const blocked = output.decisions.linearDag.nodes.find((node) => node.id === "SPL-1");
  assert.deepEqual(blocked.blockedBy, ["SPL-2"]);
  assert.deepEqual(frontier(linear).starts, ["SPL-5"]);
});

test("requested state scope survives the planner merging active issues and direct Todo blockers", async () => {
  const linear = await snapshot(
    [issue("SPL-1", { state: "In Progress", blockedBy: "SPL-2" }), issue("SPL-2")],
    ["In Progress"],
  );
  assert.deepEqual(linear.candidateIssueIds, ["SPL-1"]);
  assert.deepEqual(
    linear.activeIssues.map((item) => item.identifier),
    ["SPL-1", "SPL-2"],
  );
  const output = plan(linear);
  assert.deepEqual(output.decisions.dispatch.selected, []);
  assert.deepEqual(frontier(linear).starts, []);
});

test("configured route with no matching labels yields no dispatch after the complete pipeline", async () => {
  const linear = await snapshot([issue("SPL-1", { route: null })]);
  assert.deepEqual(linear.candidateIssueIds, []);
  const output = plan(linear);
  assert.deepEqual(output.decisions.dispatch.selected, []);
});

test("route-excluded issue metadata still carries risk labels into PR merge routing", async () => {
  const raw = issue("SPL-1", { route: "zaks-io/other" });
  raw.labels.nodes.push({ name: "risk-schema" });
  const linear = await snapshot([raw]);
  assert.deepEqual(linear.issues, []);
  const output = plan(linear, {}, [
    {
      number: 12,
      title: "SPL-1 schema update",
      state: "open",
      headRefName: "spl-1-schema-update",
      headSha: "reviewed-head",
      checks: { state: "SUCCESS" },
      latestReviews: { reviewer: { state: "APPROVED", headSha: "reviewed-head" } },
    },
  ]);
  assert.equal(
    output.actions.some(({ kind }) => kind === "arm-auto-merge"),
    false,
  );
  assert.equal(
    output.actions.some(({ kind }) => kind === "route-human-merge"),
    true,
  );
  assert.deepEqual(output.decisions.dispatch.selected, []);
});
