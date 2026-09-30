import assert from "node:assert/strict";
import test from "node:test";

import {
  extractLinearFootprint,
  loadLinearSnapshot,
  resolveLinearTeam,
  selectActiveLinearIssues,
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

test("extractLinearFootprint accepts heading variants writers actually use", () => {
  for (const heading of [
    "## Likely files/packages/artifacts",
    "## Likely files, packages, and artifacts",
    "### Likely files",
    "## Likely files:",
  ]) {
    assert.deepEqual(
      extractLinearFootprint(`${heading}\n\n- \`src/a.ts\`\n`),
      ["src/a.ts"],
      heading,
    );
  }
});

test("extractLinearFootprint keeps nested sections and ignores fences and prose", () => {
  assert.deepEqual(
    extractLinearFootprint(`
## Likely files

### Backend

- \`api/x.ts\`

### Frontend

- \`web/y.tsx\`

\`\`\`sh
# regenerate
\`\`\`

- N/A for docs, and/or e.g. see https://example.com/page

- \`web/z.tsx\`

## In scope

- \`src/not-footprint.ts\`
`),
    ["api/x.ts", "web/y.tsx", "web/z.tsx"],
  );
});

test("extractLinearFootprint reads links, mixed bullets, and nested fences", () => {
  assert.deepEqual(
    extractLinearFootprint(`
## Likely files

### Likely files

- [src/a.ts](https://github.com/o/r/blob/main/src/a.ts)
- \`src/b.ts\` plus src/c.ts (verify with \`pnpm test\`)
- \`Dockerfile\`

### Frontend

\`\`\`\`md
\`\`\`
\`\`\`\`

- web/d.tsx
`),
    ["src/a.ts", "src/b.ts", "src/c.ts", "Dockerfile", "web/d.tsx"],
  );
});

test("extractLinearFootprint keeps every path in annotated bullets", () => {
  assert.deepEqual(
    extractLinearFootprint(`
## Likely files, packages, or artifacts

- src/a.ts (new)
- Updates packages/api/routes.ts and apps/web/page.tsx.
- Overlap note: serialized after another ticket.

## In scope

- src/not-footprint.ts
`),
    ["src/a.ts", "packages/api/routes.ts", "apps/web/page.tsx"],
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
            ? [issue({ identifier: "SPL-2", state: "Backlog" })]
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
  assert.deepEqual(snapshot.activeIssues, []);
  assert.deepEqual(snapshot.issues[0].footprint, ["apps/api/src/index.ts"]);
});

test("loadLinearSnapshot ignores canceled blockers", async () => {
  let request = async (input) => {
    if (input.query.includes("teams(first")) {
      return {
        data: { teams: { nodes: [{ id: "team-id", key: "SPL", name: "Splitch" }] } },
      };
    }
    return {
      data: {
        issues: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [issue({ identifier: "SPL-1", blockedBy: "SPL-2", blockerState: "canceled" })],
        },
      },
    };
  };
  const answer = request;
  request = async (input) =>
    input.query.includes("issue(id:")
      ? { data: { issue: relationsIssue("SPL-2", "canceled") } }
      : answer(input);

  const snapshot = await loadLinearSnapshot({ request, selector: "SPL", states: ["Todo"] });

  assert.deepEqual(snapshot.issues[0].blockedBy, []);
});

test("loadLinearSnapshot repoints closed blockers to their open canonical issue", async () => {
  const lookups = {
    "SPL-2": relationsIssue("SPL-2", "duplicate", { id: "OTHER-9", type: "started" }),
    "SPL-5": relationsIssue("SPL-5", "canceled", { id: "SPL-8", type: "duplicate" }),
    "SPL-8": relationsIssue("SPL-8", "duplicate", { id: "SPL-3", type: "unstarted" }),
    "SPL-7": relationsIssue("SPL-7", "duplicate", { id: "SPL-9", type: "completed" }),
    "SPL-10": relationsIssue("SPL-10", "canceled", { id: "SPL-11", type: "canceled" }),
    "SPL-11": relationsIssue("SPL-11", "canceled", { id: "SPL-10", type: "canceled" }),
  };
  const looked = [];
  const request = async (input) => {
    if (input.query.includes("teams(first")) {
      return { data: { teams: { nodes: [{ id: "team-id", key: "SPL", name: "Splitch" }] } } };
    }
    if (input.query.includes("issue(id:")) {
      looked.push(input.variables.id);
      return { data: { issue: lookups[input.variables.id] ?? null } };
    }
    return {
      data: {
        issues: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            issue({ identifier: "SPL-1", blockedBy: "SPL-2", blockerState: "duplicate" }),
            issue({ identifier: "SPL-4", blockedBy: "SPL-5", blockerState: "canceled" }),
            issue({ identifier: "SPL-6", blockedBy: "SPL-7", blockerState: "duplicate" }),
            issue({ identifier: "SPL-12", blockedBy: "SPL-10", blockerState: "canceled" }),
            issue({ identifier: "SPL-13", blockedBy: "SPL-2", blockerState: "duplicate" }),
          ],
        },
      },
    };
  };

  const snapshot = await loadLinearSnapshot({ request, selector: "SPL" });
  const blockers = Object.fromEntries(
    snapshot.issues.map((item) => [item.identifier, item.blockedBy]),
  );

  assert.deepEqual(blockers["SPL-1"], ["OTHER-9"], "canonical in another team still blocks");
  assert.deepEqual(blockers["SPL-4"], ["SPL-3"], "duplicate chains resolve to the open end");
  assert.deepEqual(blockers["SPL-6"], [], "a completed canonical satisfies the blocker");
  assert.deepEqual(blockers["SPL-12"], [], "a cycle of closed issues has no open work");
  assert.equal(looked.filter((id) => id === "SPL-2").length, 1, "lookups are cached");
});

test("loadLinearSnapshot fails loud when a closed blocker cannot be looked up", async () => {
  const request = async (input) => {
    if (input.query.includes("teams(first")) {
      return { data: { teams: { nodes: [{ id: "team-id", key: "SPL", name: "Splitch" }] } } };
    }
    if (input.query.includes("issue(id:")) return { data: { issue: null } };
    return {
      data: {
        issues: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [issue({ identifier: "SPL-1", blockedBy: "SPL-2", blockerState: "canceled" })],
        },
      },
    };
  };

  await assert.rejects(loadLinearSnapshot({ request, selector: "SPL" }), /SPL-2 was not found/);
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

test("selectActiveLinearIssues scopes active claims to the repo route label", () => {
  const issues = [
    normalizedIssue({ identifier: "SPL-1", labels: ["zaks-io/splitch"], workerSession: "bc-1" }),
    normalizedIssue({ identifier: "SPL-2", labels: ["zaks-io/other"], workerSession: "bc-2" }),
    normalizedIssue({
      identifier: "SPL-3",
      labels: ["zaks-io/splitch"],
      stateType: "unstarted",
      assignee: "Isaac",
    }),
  ];

  assert.deepEqual(
    selectActiveLinearIssues(issues, "zaks-io/splitch").map((item) => item.identifier),
    ["SPL-1"],
  );
});

test("selectActiveLinearIssues includes only direct blockers of routed active claims", () => {
  const issues = [
    normalizedIssue({
      identifier: "SPL-1",
      labels: ["zaks-io/splitch"],
      workerSession: "bc-1",
      blockedBy: ["SPL-2"],
    }),
    normalizedIssue({ identifier: "SPL-2", blockedBy: ["SPL-3"] }),
    normalizedIssue({ identifier: "SPL-3" }),
    normalizedIssue({
      identifier: "SPL-4",
      labels: ["zaks-io/other"],
      workerSession: "bc-4",
      blockedBy: ["SPL-5"],
    }),
    normalizedIssue({ identifier: "SPL-5", stateType: "started" }),
    normalizedIssue({ identifier: "SPL-6", state: "Backlog" }),
    normalizedIssue({
      identifier: "SPL-7",
      labels: ["zaks-io/splitch"],
      stateType: "completed",
      workerSession: "bc-7",
      blockedBy: ["SPL-8"],
    }),
    normalizedIssue({ identifier: "SPL-8" }),
  ];

  assert.deepEqual(
    selectActiveLinearIssues(issues, "zaks-io/splitch").map((item) => item.identifier),
    ["SPL-1", "SPL-2"],
  );
});

test("selectActiveLinearIssues falls back to team scope when route labels are unused", () => {
  const issues = [
    normalizedIssue({ identifier: "SPL-1", labels: ["kind-slice"], workerSession: "bc-1" }),
    normalizedIssue({ identifier: "SPL-2", labels: ["kind-slice"], assignee: "Isaac" }),
  ];

  assert.deepEqual(
    selectActiveLinearIssues(issues, "zaks-io/splitch").map((item) => item.identifier),
    ["SPL-1"],
  );
});

test("selectActiveLinearIssues returns no cross-repo claims when only another route is active", () => {
  const issues = [
    normalizedIssue({ identifier: "SPL-1", labels: ["zaks-io/other"], workerSession: "bc-1" }),
  ];

  assert.deepEqual(selectActiveLinearIssues(issues, "zaks-io/splitch"), []);
});

test("selectActiveLinearIssues includes started tracker state for reconciliation", () => {
  const issues = [
    normalizedIssue({ identifier: "SPL-1", stateType: "started" }),
    normalizedIssue({ identifier: "SPL-2", workerSession: "bc-2" }),
  ];

  assert.deepEqual(
    selectActiveLinearIssues(issues).map((item) => item.identifier),
    ["SPL-1", "SPL-2"],
  );
});

test("false activity signals do not hide later positive signals", () => {
  for (const field of ["delegated", "assignedWorker", "workerSession", "agentSession"]) {
    const target = {
      ...normalizedIssue({ identifier: "SPL-1" }),
      activeClaim: false,
      delegated: false,
      assignedWorker: false,
      workerSession: null,
      agentSession: null,
      [field]: "session-1",
    };
    assert.deepEqual(selectActiveLinearIssues([target]), [target], field);
  }
});

test("loadLinearSnapshot includes active targets with their direct blockers", async () => {
  const request = async ({ query }) => {
    if (query.includes("teams(first")) {
      return {
        data: { teams: { nodes: [{ id: "team-id", key: "SPL", name: "Splitch" }] } },
      };
    }
    return {
      data: {
        issues: {
          pageInfo: { hasNextPage: false },
          nodes: [
            issue({ identifier: "SPL-1", state: "In Progress", blockedBy: "SPL-2" }),
            issue({ identifier: "SPL-2", state: "Backlog" }),
            issue({ identifier: "SPL-3", state: "Backlog" }),
            issue({ identifier: "SPL-4", state: "Backlog" }),
          ],
        },
      },
    };
  };

  const snapshot = await loadLinearSnapshot({ request, selector: "SPL", states: ["Todo"] });

  assert.deepEqual(
    snapshot.activeIssues.map((item) => item.identifier),
    ["SPL-1", "SPL-2"],
  );
});

function normalizedIssue({
  identifier,
  labels = [],
  state = "Todo",
  stateType = "unstarted",
  assignee = null,
  workerSession = null,
  blockedBy = [],
}) {
  return { identifier, labels, state, stateType, assignee, workerSession, blockedBy };
}

function issue({
  identifier,
  state = "Todo",
  description = "",
  blockedBy,
  blockerState = "started",
}) {
  return {
    identifier,
    title: identifier,
    description,
    url: `https://linear.example/${identifier}`,
    priority: 0,
    estimate: 1,
    updatedAt: "2026-07-17T00:00:00.000Z",
    state: {
      name: state,
      type: ["Todo", "Backlog", "Triage"].includes(state) ? "unstarted" : "started",
    },
    labels: { nodes: [{ name: "kind-slice" }, { name: "ready-for-agent" }] },
    assignee: null,
    inverseRelations: {
      pageInfo: { hasNextPage: false },
      nodes: blockedBy
        ? [{ type: "blocks", issue: { identifier: blockedBy, state: { type: blockerState } } }]
        : [],
    },
  };
}

function relationsIssue(identifier, type, canonical) {
  return {
    identifier,
    state: { type },
    relations: {
      pageInfo: { hasNextPage: false },
      nodes: canonical
        ? [
            {
              type: "duplicate",
              relatedIssue: { identifier: canonical.id, state: { type: canonical.type } },
            },
          ]
        : [],
    },
  };
}
