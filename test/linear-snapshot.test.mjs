import assert from "node:assert/strict";
import test from "node:test";

import {
  extractLinearFootprint,
  loadLinearSnapshot,
  resolveLinearTeam,
  selectScopedLinearIssues,
} from "../skills/ziw-orchestrate/scripts/linear-snapshot.mjs";

test("extractLinearFootprint accepts current and legacy footprint headings", () => {
  assert.deepEqual(
    extractLinearFootprint(`
## Likely files, packages, or artifacts

* \`.github/workflows/sdk-publish.yml\`
* \`packages/sdk/package.json\`

## In scope

Publish the SDK.
`),
    [".github/workflows/sdk-publish.yml", "packages/sdk/package.json"],
  );
  assert.deepEqual(
    extractLinearFootprint(`
## File footprint

* \`packages/control-plane-sdk/src/index.ts\`
`),
    ["packages/control-plane-sdk/src/index.ts"],
  );
  assert.deepEqual(
    extractLinearFootprint(`
## Predicted file footprint

* Hot files: \`.github/workflows/sdk-publish.yml\`
* Overlap note: serialized after another ticket.
`),
    [".github/workflows/sdk-publish.yml"],
  );
});

test("resolveLinearTeam supports key, exact name, and UUID selectors", async () => {
  const observed = [];
  const request = async (input) => {
    observed.push(input);
    return {
      data: {
        teams: {
          nodes: [{ id: "eba9c622-4d28-4db2-93fe-12c43bd218b0", key: "SPL", name: "Splitch" }],
        },
      },
    };
  };

  await resolveLinearTeam(request, "SPL");
  await resolveLinearTeam(request, "Splitch");
  await resolveLinearTeam(request, "eba9c622-4d28-4db2-93fe-12c43bd218b0");

  assert.match(observed[0].query, /key:/);
  assert.match(observed[1].query, /name:/);
  assert.match(observed[2].query, /id:/);
});

test("resolveLinearTeam fails loud instead of returning an empty queue", async () => {
  await assert.rejects(
    resolveLinearTeam(async () => ({ data: { teams: { nodes: [] } } }), "unknown"),
    /was not found/,
  );
});

test("loadLinearSnapshot paginates, derives footprints, and includes direct blockers", async () => {
  const requests = [];
  const request = async (input) => {
    requests.push(input);
    if (input.query.includes("teams(first")) {
      return {
        data: { teams: { nodes: [{ id: "team-id", key: "SPL", name: "Splitch" }] } },
      };
    }
    const secondPage = input.variables.after === "page-2";
    return {
      data: {
        issues: {
          pageInfo: { hasNextPage: !secondPage, endCursor: secondPage ? null : "page-2" },
          nodes: secondPage
            ? [issue({ identifier: "SPL-2", state: "Blocked" })]
            : [
                issue({
                  identifier: "SPL-1",
                  description: "## Predicted file footprint\n\n* `apps/api/src/index.ts`",
                  blockedBy: "SPL-2",
                }),
                issue({ identifier: "SPL-3", state: "Backlog" }),
              ],
        },
      },
    };
  };

  const snapshot = await loadLinearSnapshot({ request, selector: "SPL", states: ["Todo"] });

  assert.equal(requests.length, 3);
  assert.equal(snapshot.teamId, "team-id");
  assert.deepEqual(
    snapshot.issues.map((item) => item.identifier),
    ["SPL-1", "SPL-2"],
  );
  assert.deepEqual(snapshot.issues[0].footprint, ["apps/api/src/index.ts"]);
});

test("selectScopedLinearIssues does not silently expand beyond direct blockers", () => {
  const issues = [
    { identifier: "SPL-1", state: "Todo", blockedBy: ["SPL-2"] },
    { identifier: "SPL-2", state: "Blocked", blockedBy: ["SPL-3"] },
    { identifier: "SPL-3", state: "Blocked", blockedBy: [] },
  ];

  assert.deepEqual(
    selectScopedLinearIssues(issues, ["Todo"]).map((issue) => issue.identifier),
    ["SPL-1", "SPL-2"],
  );
});

function issue({ identifier, state = "Todo", description = "", blockedBy }) {
  return {
    identifier,
    title: identifier,
    description,
    url: `https://linear.example/${identifier}`,
    priority: 0,
    estimate: 1,
    updatedAt: "2026-07-17T00:00:00.000Z",
    state: { name: state, type: state === "Todo" ? "unstarted" : "started" },
    labels: { nodes: [{ name: "kind-slice" }, { name: "ready-for-agent" }] },
    assignee: null,
    inverseRelations: {
      pageInfo: { hasNextPage: false },
      nodes: blockedBy
        ? [{ type: "blocks", issue: { identifier: blockedBy, state: { type: "started" } } }]
        : [],
    },
  };
}
