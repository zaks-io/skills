import assert from "node:assert/strict";
import test from "node:test";

import {
  extractLinearFootprint,
  loadLinearSnapshot,
  linearIssueMatchesRoute,
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
    snapshot.issues.map((item) => item.issueKey),
    ["SPL-1", "SPL-2"],
  );
  assert.deepEqual(snapshot.activeIssues, []);
  assert.deepEqual(snapshot.candidateIssues, [{ issueKey: "SPL-1" }]);
  assert.deepEqual(snapshot.candidateScope, { routeLabel: null, states: ["Todo"] });
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
    snapshot.issues.map((item) => [item.issueKey, item.blockedBy]),
  );

  assert.deepEqual(
    blockers["SPL-1"],
    [{ issueKey: "OTHER-9" }],
    "canonical in another team still blocks",
  );
  assert.deepEqual(
    blockers["SPL-4"],
    [{ issueKey: "SPL-3" }],
    "duplicate chains resolve to the open end",
  );
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
    { issueKey: "SPL-1", state: "Todo", blockedBy: [{ issueKey: "SPL-2" }] },
    { issueKey: "SPL-2", state: "Blocked", blockedBy: [{ issueKey: "SPL-3" }] },
    { issueKey: "SPL-3", state: "Blocked", blockedBy: [] },
  ];

  assert.deepEqual(
    selectScopedLinearIssues(issues, ["Todo"]).map((issue) => issue.issueKey),
    ["SPL-1", "SPL-2"],
  );
});

test("linearIssueMatchesRoute accepts exact case-insensitive names and never prefix routes", () => {
  assert.equal(linearIssueMatchesRoute({ labels: "zaks-io/splitch" }, "zaks-io/splitch"), true);
  assert.equal(
    linearIssueMatchesRoute({ labels: { name: "zaks-io/splitch" } }, "zaks-io/splitch"),
    true,
  );
  assert.equal(linearIssueMatchesRoute({ labels: [" ZAKS-IO/SPLITCH "] }, "zaks-io/splitch"), true);
  assert.equal(
    linearIssueMatchesRoute({ labels: [{ name: "zaks-io/splitch" }] }, "zaks-io/splitch"),
    true,
  );
  assert.equal(
    linearIssueMatchesRoute({ labels: ["zaks-io/splitch-other"] }, "zaks-io/splitch"),
    false,
  );
  assert.equal(linearIssueMatchesRoute({ labels: [] }, "zaks-io/splitch"), false);
  assert.equal(linearIssueMatchesRoute({ labels: [] }), true);
});

test("loadLinearSnapshot restricts candidates by route and state while retaining direct blockers", async () => {
  const route = "zaks-io/splitch";
  const request = async ({ query }) => {
    if (query.includes("teams(first")) {
      return { data: { teams: { nodes: [{ id: "team-id", key: "SPL", name: "Splitch" }] } } };
    }
    return {
      data: {
        issues: {
          pageInfo: { hasNextPage: false },
          nodes: [
            issue({ identifier: "SPL-1", labels: [route], blockedBy: "SPL-2" }),
            issue({ identifier: "SPL-2", labels: ["zaks-io/other"] }),
            issue({ identifier: "SPL-3", labels: ["zaks-io/other"] }),
            issue({ identifier: "SPL-4", labels: [route], state: "Backlog" }),
            issue({ identifier: "SPL-5" }),
            issue({
              identifier: "SPL-6",
              labels: [route],
              state: "In Progress",
              blockedBy: "SPL-7",
            }),
            issue({ identifier: "SPL-7", labels: [route] }),
          ],
        },
      },
    };
  };
  const snapshot = await loadLinearSnapshot({
    request,
    selector: "SPL",
    states: ["Todo"],
    routeLabel: route,
  });
  assert.deepEqual(snapshot.candidateIssues, [{ issueKey: "SPL-1" }, { issueKey: "SPL-7" }]);
  assert.deepEqual(snapshot.candidateScope, { routeLabel: route, states: ["Todo"] });
  assert.deepEqual(snapshot.unroutedIssueIds, ["SPL-5"]);
  assert.deepEqual(snapshot.issueMetadata, [
    { issueKey: "SPL-1", labels: [route] },
    { issueKey: "SPL-2", labels: ["zaks-io/other"] },
    { issueKey: "SPL-3", labels: ["zaks-io/other"] },
    { issueKey: "SPL-4", labels: [route] },
    { issueKey: "SPL-5", labels: ["kind-slice", "ready-for-agent"] },
    { issueKey: "SPL-6", labels: [route] },
    { issueKey: "SPL-7", labels: [route] },
  ]);
  assert.deepEqual(
    snapshot.issues.map((item) => item.issueKey),
    ["SPL-1", "SPL-2", "SPL-7"],
  );
  assert.deepEqual(
    snapshot.activeIssues.map((item) => item.issueKey),
    ["SPL-6", "SPL-7"],
  );
});

test("loadLinearSnapshot emits no configured-route candidates when all route labels are missing", async () => {
  const request = async ({ query }) =>
    query.includes("teams(first")
      ? { data: { teams: { nodes: [{ id: "team-id", key: "SPL", name: "Splitch" }] } } }
      : {
          data: {
            issues: { pageInfo: { hasNextPage: false }, nodes: [issue({ identifier: "SPL-1" })] },
          },
        };
  const snapshot = await loadLinearSnapshot({
    request,
    selector: "SPL",
    routeLabel: "zaks-io/splitch",
  });
  assert.deepEqual(snapshot.candidateIssues, []);
  assert.deepEqual(snapshot.unroutedIssueIds, ["SPL-1"]);
  assert.deepEqual(snapshot.issues, []);
  assert.deepEqual(snapshot.activeIssues, []);
});

test("requested states do not make an otherwise dispatchable direct blocker a candidate", async () => {
  const request = async ({ query }) =>
    query.includes("teams(first")
      ? { data: { teams: { nodes: [{ id: "team-id", key: "SPL", name: "Splitch" }] } } }
      : {
          data: {
            issues: {
              pageInfo: { hasNextPage: false },
              nodes: [
                issue({ identifier: "SPL-1", state: "In Progress", blockedBy: "SPL-2" }),
                issue({ identifier: "SPL-2", state: "Todo" }),
              ],
            },
          },
        };
  const snapshot = await loadLinearSnapshot({ request, selector: "SPL", states: ["In Progress"] });
  assert.deepEqual(
    snapshot.issues.map((item) => item.issueKey),
    ["SPL-1", "SPL-2"],
  );
  assert.deepEqual(snapshot.candidateIssues, [{ issueKey: "SPL-1" }]);
  assert.deepEqual(snapshot.unroutedIssueIds, []);
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
    selectActiveLinearIssues(issues, "zaks-io/splitch").map((item) => item.issueKey),
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
    selectActiveLinearIssues(issues, "zaks-io/splitch").map((item) => item.issueKey),
    ["SPL-1", "SPL-2"],
  );
});

test("selectActiveLinearIssues never falls back when a configured route is unused", () => {
  const issues = [
    normalizedIssue({ identifier: "SPL-1", labels: ["kind-slice"], workerSession: "bc-1" }),
    normalizedIssue({ identifier: "SPL-2", labels: ["kind-slice"], assignee: "Isaac" }),
  ];

  assert.deepEqual(
    selectActiveLinearIssues(issues, "zaks-io/splitch").map((item) => item.issueKey),
    [],
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
    selectActiveLinearIssues(issues).map((item) => item.issueKey),
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
    snapshot.activeIssues.map((item) => item.issueKey),
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
  return {
    issueKey: identifier,
    labels,
    state,
    stateType,
    assignee,
    workerSession,
    blockedBy: blockedBy.map((issueKey) => ({ issueKey })),
  };
}

function issue({
  identifier,
  state = "Todo",
  labels = ["kind-slice", "ready-for-agent"],
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
      type: { Todo: "unstarted", Backlog: "backlog", Triage: "triage" }[state] ?? "started",
    },
    labels: { nodes: labels.map((name) => ({ name })) },
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

test("default unrouted warnings exclude intake and parked work but requested states remain visible", async () => {
  const request = async ({ query }) =>
    query.includes("teams(first")
      ? { data: { teams: { nodes: [{ id: "team-id", key: "SPL", name: "Splitch" }] } } }
      : {
          data: {
            issues: {
              pageInfo: { hasNextPage: false },
              nodes: [
                issue({ identifier: "SPL-1", state: "Todo" }),
                issue({ identifier: "SPL-2", state: "Triage" }),
                issue({ identifier: "SPL-3", state: "Backlog" }),
                issue({ identifier: "SPL-4", state: "In Progress" }),
              ],
            },
          },
        };
  const base = { request, selector: "SPL", routeLabel: "zaks-io/splitch" };
  assert.deepEqual((await loadLinearSnapshot(base)).unroutedIssueIds, ["SPL-1"]);
  assert.deepEqual((await loadLinearSnapshot({ ...base, states: ["Backlog"] })).unroutedIssueIds, [
    "SPL-3",
  ]);
});

test("referenced UUID lookup preserves aliases and risk metadata without expanding dispatch scope", async () => {
  const uuid = "11111111-2222-4333-8444-555555555555";
  const observed = [];
  const request = async (input) => {
    observed.push(input);
    if (input.query.includes("teams(first")) {
      return { data: { teams: { nodes: [{ id: "team", key: "SPL", name: "Splitch" }] } } };
    }
    if (input.query.includes("issue(id:")) {
      assert.equal(input.variables.id, uuid);
      return {
        data: { issue: { ...issue({ identifier: "SPL-9", labels: ["risk-schema"] }), id: uuid } },
      };
    }
    return {
      data: {
        issues: { pageInfo: { hasNextPage: false }, nodes: [issue({ identifier: "SPL-1" })] },
      },
    };
  };
  const output = await loadLinearSnapshot({
    request,
    selector: "SPL",
    states: ["Todo"],
    issueRefs: [{ issueUuid: uuid }, { issueUuid: uuid }, { issueKey: "SPL-9" }],
  });
  assert.deepEqual(output.candidateIssues, [{ issueKey: "SPL-1" }]);
  assert.deepEqual(
    output.issues.map((item) => item.issueKey),
    ["SPL-1"],
  );
  assert.deepEqual(output.activeIssues, []);
  assert.deepEqual(output.issueMetadata.at(-1), {
    issueKey: "SPL-9",
    issueUuid: uuid,
    labels: ["risk-schema"],
  });
  assert.equal(observed.filter(({ query }) => query.includes("issue(id:")).length, 1);
});

test("typed tracker dependencies carry both identifiers from provider relations", async () => {
  const parentUuid = "11111111-2222-4333-8444-555555555555";
  const blockerUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const raw = { ...issue({ identifier: "SPL-1", blockedBy: "SPL-2" }), id: parentUuid };
  raw.inverseRelations.nodes[0].issue.id = blockerUuid;
  const request = async ({ query }) =>
    query.includes("teams(first")
      ? { data: { teams: { nodes: [{ id: "team", key: "SPL", name: "Splitch" }] } } }
      : { data: { issues: { pageInfo: { hasNextPage: false }, nodes: [raw] } } };
  const output = await loadLinearSnapshot({ request, selector: "SPL" });
  assert.deepEqual(output.candidateIssues, [{ issueKey: "SPL-1", issueUuid: parentUuid }]);
  assert.deepEqual(output.issues[0].blockedBy, [{ issueKey: "SPL-2", issueUuid: blockerUuid }]);
  assert.equal("id" in output.issues[0], false);
  assert.equal("identifier" in output.issues[0], false);
});

test("referenced lookup diagnoses missing issues and rejects conflicting pairs or over-budget requests", async () => {
  const uuid = "11111111-2222-4333-8444-555555555555";
  const request = async ({ query }) => {
    if (query.includes("teams(first"))
      return { data: { teams: { nodes: [{ id: "team", key: "SPL", name: "Splitch" }] } } };
    if (query.includes("issue(id:")) return { data: { issue: null } };
    return {
      data: {
        issues: {
          pageInfo: { hasNextPage: false },
          nodes: [{ ...issue({ identifier: "SPL-1" }), id: uuid }],
        },
      },
    };
  };
  const base = { request, selector: "SPL" };
  const missing = await loadLinearSnapshot({ ...base, issueRefs: [{ issueKey: "SPL-2" }] });
  assert.deepEqual(missing.identityDiagnostics, [
    {
      code: "REFERENCED_ISSUE_NOT_FOUND",
      path: "issueRefs/0",
      issueKey: "SPL-2",
      blockingStarts: true,
    },
  ]);
  assert.equal(
    missing.issueMetadata.some((issue) => issue.issueKey === "SPL-2"),
    false,
  );
  await assert.rejects(
    loadLinearSnapshot({ ...base, issueRefs: [{ issueUuid: uuid, issueKey: "SPL-2" }] }),
    /identity conflicts/,
  );
  await assert.rejects(
    loadLinearSnapshot({
      ...base,
      issueRefs: [{ issueUuid: uuid }, { issueUuid: uuid, issueKey: "SPL-2" }],
    }),
    /identity conflicts/,
  );
  await assert.rejects(
    loadLinearSnapshot({
      ...base,
      issueRefs: Array.from({ length: 52 }, (_, index) => ({ issueKey: `SPL-${index + 1}` })),
    }),
    /exceeds 50/,
  );
  await assert.rejects(
    loadLinearSnapshot({ ...base, issueRefs: [{ issueId: uuid }] }),
    /typed issueKey/,
  );
});

test("missing referenced lookup is cached and reports each deterministic source path", async () => {
  const observed = [];
  const request = async (input) => {
    observed.push(input);
    if (input.query.includes("teams(first"))
      return { data: { teams: { nodes: [{ id: "team", key: "SPL", name: "Splitch" }] } } };
    if (input.query.includes("issue(id:")) return { data: { issue: null } };
    return {
      data: {
        issues: { pageInfo: { hasNextPage: false }, nodes: [issue({ identifier: "SPL-1" })] },
      },
    };
  };
  const output = await loadLinearSnapshot({
    request,
    selector: "SPL",
    issueRefs: [{ issueKey: "SPL-2" }, { issueKey: "SPL-2" }, { issueKey: "SPL-2" }],
    issueRefPaths: ["state/scopeIssues/0", "state/tickets/0/blockedBy/0", "state/scopeIssues/0"],
  });
  assert.deepEqual(output.identityDiagnostics, [
    {
      code: "REFERENCED_ISSUE_NOT_FOUND",
      path: "state/scopeIssues/0",
      issueKey: "SPL-2",
      blockingStarts: true,
    },
    {
      code: "REFERENCED_ISSUE_NOT_FOUND",
      path: "state/tickets/0/blockedBy/0",
      issueKey: "SPL-2",
      blockingStarts: true,
    },
  ]);
  assert.equal(observed.filter(({ query }) => query.includes("issue(id:")).length, 1);
  assert.deepEqual(output.candidateIssues, [{ issueKey: "SPL-1" }]);
});

test("a dual-field reference fetches the missing alias for a key-only tracker record", async () => {
  const uuid = "11111111-2222-4333-8444-555555555555";
  const requests = [];
  const request = async (input) => {
    requests.push(input);
    if (input.query.includes("teams(first"))
      return { data: { teams: { nodes: [{ id: "team", key: "SPL", name: "Splitch" }] } } };
    if (input.query.includes("issue(id:"))
      return { data: { issue: { ...issue({ identifier: "SPL-1" }), id: uuid } } };
    return {
      data: {
        issues: { pageInfo: { hasNextPage: false }, nodes: [issue({ identifier: "SPL-1" })] },
      },
    };
  };
  const output = await loadLinearSnapshot({
    request,
    selector: "SPL",
    issueRefs: [{ issueKey: "SPL-1", issueUuid: uuid }],
  });
  assert.deepEqual(output.identityDiagnostics, []);
  assert.ok(
    output.issueMetadata.some((item) => item.issueUuid === uuid && item.issueKey === "SPL-1"),
  );
  assert.deepEqual(output.candidateIssues, [{ issueKey: "SPL-1" }]);
  assert.equal(requests.filter(({ query }) => query.includes("issue(id:")).length, 1);
});

test("malformed referenced lookup responses are provider failures rather than missing records", async () => {
  const request = async ({ query }) => {
    if (query.includes("teams(first"))
      return { data: { teams: { nodes: [{ id: "team", key: "SPL", name: "Splitch" }] } } };
    if (query.includes("issue(id:")) return { data: {} };
    return { data: { issues: { pageInfo: { hasNextPage: false }, nodes: [] } } };
  };
  await assert.rejects(
    loadLinearSnapshot({
      request,
      selector: "SPL",
      issueRefs: [{ issueKey: "SPL-2" }],
      issueRefPaths: ["state/scopeIssues/0"],
    }),
    /state\/scopeIssues\/0:.*no issue field/,
  );
});
