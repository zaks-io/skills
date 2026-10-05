import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateInput } from "../skills/ziw-orchestrate/scripts/planner-input-validator.mjs";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "skills", "ziw-orchestrate", "scripts", "tick-snapshot.mjs");

test("tick-snapshot paginates and retains current and renamed paths for planner collision checks", (t) => {
  const bin = mkdtempSync(path.join(tmpdir(), "ziw-gh-"));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  const gh = path.join(bin, "gh");
  const baselineHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  writeFileSync(
    gh,
    `#!/usr/bin/env node
const endpoint = process.argv.find((arg) => arg.includes("/pulls/") && arg.includes("/files"));
if (endpoint) {
  const number = Number(endpoint.match(/pulls\\/(\\d+)/)[1]);
  process.stdout.write(JSON.stringify([[{
    filename: "src/shared.js",
    previous_filename: "src/previous.js",
    status: "renamed",
    sha: number === 1 ? "same-reviewed-blob" : "changed-blob",
    additions: 2,
    deletions: 1,
    changes: 3
  }]]));
  process.exit(0);
}
const after = process.argv.find((arg) => arg.startsWith("after="));
const second = Boolean(after);
const number = second ? 2 : 1;
const repository = {
  defaultBranchRef: { name: "main", target: { oid: ${JSON.stringify(baselineHead)}, statusCheckRollup: null } },
  pullRequests: {
    totalCount: 2,
    pageInfo: { hasNextPage: !second, endCursor: second ? null : "cursor-1" },
    nodes: [{
      number,
      title: "PR " + number,
      body: "Fix https://linear.app/example/issue/SKI-12/title and https://linear.app/example/issue/SKI-12. Ignore SKI-13 and https://linear.app.evil/example/issue/SKI-14",
      url: "https://example.com/pr/" + number,
      isDraft: false,
      updatedAt: "2026-07-20T00:00:00Z",
      changedFiles: 1,
      author: { login: "worker", __typename: "User" },
      headRefName: "work-" + number,
      headRefOid: "head-" + number,
      baseRefName: "main",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: null,
      labels: { nodes: [] },
      reviewThreads: { totalCount: 0, nodes: [] },
      reviews: { nodes: [] },
      commits: { nodes: [] }
    }]
  }
};
process.stdout.write(JSON.stringify({ data: { repository } }));
`,
  );
  chmodSync(gh, 0o755);

  const output = JSON.parse(
    execFileSync("node", [script, "--repo", "zaks-io/skills", "--limit", "1"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    }),
  );

  assert.equal(validateInput(output), true, JSON.stringify(validateInput.errors));
  assert.equal(output.v, 3);
  assert.deepEqual(output.prs[0].linkedIssues, [{ issueKey: "SKI-12" }]);
  assert.equal("body" in output.prs[0], false);
  assert.equal(output.footprint.openPrCount, 2);
  assert.deepEqual(
    output.prs.map((pr) => pr.number),
    [1, 2],
  );
  assert.match(output.prs[0].reviewDiffFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(output.prs[0].reviewDiffFingerprint, output.prs[1].reviewDiffFingerprint);
  assert.equal(output.prs[0].changedFiles, 1);
  assert.deepEqual(output.prs[0].footprint, ["src/shared.js", "src/previous.js"]);

  const input = path.join(bin, "planner-input.json");
  writeFileSync(
    input,
    JSON.stringify({
      snapshot: output,
      config: { workerConcurrencyCap: 3 },
      state: {
        startableTickets: [
          { issueKey: "SKI-100", footprint: ["src/shared.js"] },
          { issueKey: "SKI-101", footprint: ["src/previous.js"] },
          { issueKey: "SKI-102", footprint: ["src/separate.js"] },
        ],
      },
    }),
  );
  const planned = JSON.parse(
    execFileSync(
      "node",
      [path.join(root, "skills/ziw-orchestrate/scripts/tick-plan.mjs"), input, "--debug"],
      { cwd: root, encoding: "utf8" },
    ),
  );
  assert.deepEqual(
    planned.decisions.dispatch.selected.map((ticket) => ticket.id),
    ["SKI-102"],
  );
  assert.deepEqual(
    planned.decisions.dispatch.deferred.map((ticket) => ticket.id),
    ["SKI-100", "SKI-101"],
  );
});

const lookupUuid = "11111111-2222-4333-8444-555555555555";
const outsideUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const tickPlan = path.join(root, "skills", "ziw-orchestrate", "scripts", "tick-plan.mjs");

function offlineCollector(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-collector-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ghLog = path.join(dir, "gh.log");
  const linearLog = path.join(dir, "linear.log");
  const preload = path.join(dir, "offline-linear.mjs");
  const gh = path.join(dir, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(ghLog)}, "called\\n");
process.stdout.write(JSON.stringify({ data: { repository: {
  defaultBranchRef: { name: "main", target: { oid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", statusCheckRollup: { state: "SUCCESS", contexts: { nodes: [] } } } },
  pullRequests: { totalCount: 0, pageInfo: { hasNextPage: false }, nodes: [] }
} } }));
`,
  );
  chmodSync(gh, 0o755);
  writeFileSync(
    preload,
    `import { appendFileSync } from "node:fs";
const issue = (identifier, id, route = "zaks-io/skills") => ({
  identifier, ...(id ? { id } : {}), title: identifier, priority: 1, estimate: 1,
  url: "https://linear.app/offline/issue/" + identifier,
  state: { name: "Todo", type: "unstarted" },
  labels: { nodes: ["kind-slice", "ready-for-agent", route].map(name => ({ name })) },
  description: "## File footprint\\n\\n- src/candidate/" + identifier + ".ts",
  inverseRelations: { pageInfo: { hasNextPage: false }, nodes: [] }
});
globalThis.fetch = async (url, options) => {
  if (url !== "https://api.linear.app/graphql") throw new Error("unexpected offline transport target");
  const { query, variables } = JSON.parse(options.body);
  let data;
  if (query.includes("teams(first")) {
    appendFileSync(${JSON.stringify(linearLog)}, JSON.stringify({ type: "teams" }) + "\\n");
    data = { teams: { nodes: [{ id: "offline-team", key: "SKI", name: "Offline" }] } };
  } else if (query.includes("issue(id:")) {
    appendFileSync(${JSON.stringify(linearLog)}, JSON.stringify({ type: "lookup", id: variables.id }) + "\\n");
    const issueById = {
      ${JSON.stringify(lookupUuid)}: issue("SKI-12", ${JSON.stringify(lookupUuid)}),
      ${JSON.stringify(outsideUuid)}: issue("SKI-999", ${JSON.stringify(outsideUuid)}, "zaks-io/another-repo")
    };
    if (!issueById[variables.id]) throw new Error("unexpected offline lookup identity");
    data = { issue: issueById[variables.id] };
  } else {
    appendFileSync(${JSON.stringify(linearLog)}, JSON.stringify({ type: "issues" }) + "\\n");
    data = { issues: { pageInfo: { hasNextPage: false }, nodes: [issue("SKI-12"), issue("SKI-13")] } };
  }
  return { ok: true, json: async () => ({ data }) };
};
`,
  );
  return {
    dir,
    ghLog,
    linearLog,
    preload,
    env: {
      ...process.env,
      LINEAR_API_KEY: "offline-fixture-credential",
      PATH: `${dir}${path.delimiter}${process.env.PATH}`,
    },
  };
}

const collectorCases = [
  {
    name: "v2 dedicated worker issueId",
    state: {
      dispatches: [
        {
          issueId: lookupUuid,
          sessionId: "live-worker",
          state: "running",
          footprint: ["src/worker.ts"],
        },
      ],
    },
  },
  {
    name: "v3 worker UUID",
    state: {
      dispatches: [
        {
          issueUuid: lookupUuid,
          sessionId: "live-worker",
          state: "running",
          footprint: ["src/worker.ts"],
        },
      ],
    },
  },
  {
    name: "v3 scope UUID",
    state: {
      dispatches: [
        {
          issueKey: "SKI-12",
          sessionId: "live-worker",
          state: "running",
          footprint: ["src/worker.ts"],
        },
      ],
      scopeIssues: [{ issueUuid: lookupUuid }, { issueUuid: outsideUuid }],
    },
  },
];

for (const { name, state } of collectorCases) {
  test(`tick-snapshot --state automatically hydrates ${name} before planner duplicate protection`, (t) => {
    const fixture = offlineCollector(t);
    const stateFile = path.join(fixture.dir, "state.json");
    writeFileSync(stateFile, JSON.stringify(state));
    const snapshot = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          fixture.preload,
          script,
          "--repo",
          "zaks-io/skills",
          "--linear-team",
          "SKI",
          "--linear-state",
          "Todo",
          "--no-local-worktrees",
          "--state",
          stateFile,
        ],
        { cwd: root, encoding: "utf8", env: fixture.env },
      ),
    );
    assert.equal(validateInput(snapshot), true, JSON.stringify(validateInput.errors));
    const calls = readFileSync(fixture.linearLog, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(
      calls.filter((call) => call.type === "lookup" && call.id === lookupUuid).length,
      1,
    );
    assert.deepEqual(snapshot.linear.candidateIssues, [
      { issueKey: "SKI-12" },
      { issueKey: "SKI-13" },
    ]);
    assert.deepEqual(
      snapshot.linear.issues.map((issue) => issue.issueKey),
      ["SKI-12", "SKI-13"],
    );
    assert.ok(
      snapshot.linear.issueMetadata.some(
        (issue) => issue.issueUuid === lookupUuid && issue.issueKey === "SKI-12",
      ),
    );
    if (state.scopeIssues) {
      assert.equal(
        calls.filter((call) => call.type === "lookup" && call.id === outsideUuid).length,
        1,
      );
      assert.ok(snapshot.linear.issueMetadata.some((issue) => issue.issueKey === "SKI-999"));
    }
    const planInput = path.join(fixture.dir, "plan.json");
    writeFileSync(planInput, JSON.stringify(snapshot));
    const planned = JSON.parse(
      execFileSync(process.execPath, [tickPlan, planInput, "--state", stateFile, "--debug"], {
        cwd: root,
        encoding: "utf8",
        env: fixture.env,
      }),
    );
    assert.ok(
      !planned.actions.some(
        (action) => action.kind === "dispatch" && action.target === "ticket:SKI-12",
      ),
    );
    assert.ok(
      planned.holds.some(
        (hold) => hold.reason === "DELIVERY_ALREADY_ACTIVE" && hold.target === "ticket:SKI-12",
      ),
    );
    assert.equal(
      planned.actions.some(
        (action) => action.kind === "dispatch" && action.target === "ticket:SKI-13",
      ),
      !state.scopeIssues,
    );
    assert.ok(
      !planned.actions.some(
        (action) => action.kind === "dispatch" && action.target === "ticket:SKI-999",
      ),
    );
    const compact = JSON.parse(
      execFileSync(process.execPath, [tickPlan, planInput, "--state", stateFile], {
        cwd: root,
        encoding: "utf8",
        env: fixture.env,
      }),
    );
    for (const field of ["actions", "holds", "waits", "warnings", "capacity"])
      assert.deepEqual(compact[field], planned[field]);
    assert.equal(planned.capacity.used, 1);
    assert.deepEqual(planned.warnings, []);
  });
}

for (const rawState of [
  "not valid JSON",
  JSON.stringify({ dispatches: "invalid-array" }),
  JSON.stringify({ dispatches: [{ sessionId: "live", issueUuId: lookupUuid }] }),
]) {
  test(`tick-snapshot rejects invalid --state before gh ${rawState.slice(0, 20)}`, (t) => {
    const fixture = offlineCollector(t);
    const stateFile = path.join(fixture.dir, "invalid-state.json");
    writeFileSync(stateFile, rawState);
    const result = spawnSync(
      process.execPath,
      ["--import", fixture.preload, script, "--repo", "zaks-io/skills", "--state", stateFile],
      { cwd: root, encoding: "utf8", env: fixture.env },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--state(?::|\/)/);
    assert.equal(existsSync(fixture.ghLog), false);
    assert.equal(existsSync(fixture.linearLog), false);
  });
}

test("tick-plan rejects misspelled external state identities before emitting actions", (t) => {
  const fixture = offlineCollector(t);
  const snapshotFile = path.join(fixture.dir, "snapshot.json");
  const stateFile = path.join(fixture.dir, "state.json");
  writeFileSync(
    snapshotFile,
    JSON.stringify({
      v: 3,
      repo: "zaks-io/skills",
      prs: [],
      worktrees: [],
      linear: { issues: [] },
    }),
  );
  writeFileSync(
    stateFile,
    JSON.stringify({ dispatches: [{ sessionId: "live", issueUuId: lookupUuid }] }),
  );
  const result = spawnSync(process.execPath, [tickPlan, snapshotFile, "--state", stateFile], {
    cwd: root,
    encoding: "utf8",
    env: fixture.env,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /state|schema/);
  assert.equal(result.stdout, "");
  assert.equal(existsSync(fixture.ghLog), false);
  assert.equal(existsSync(fixture.linearLog), false);
});

test("tick-snapshot rejects --state without a file before gh", (t) => {
  const fixture = offlineCollector(t);
  const result = spawnSync(
    process.execPath,
    ["--import", fixture.preload, script, "--repo", "zaks-io/skills", "--state"],
    { cwd: root, encoding: "utf8", env: fixture.env },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--state/);
  assert.equal(existsSync(fixture.ghLog), false);
  assert.equal(existsSync(fixture.linearLog), false);
});
