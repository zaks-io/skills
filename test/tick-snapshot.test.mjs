import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "skills", "ziw-orchestrate", "scripts", "tick-snapshot.mjs");

test("tick-snapshot paginates the complete open PR footprint", () => {
  const bin = mkdtempSync(path.join(tmpdir(), "ziw-gh-"));
  const gh = path.join(bin, "gh");
  const baselineHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  writeFileSync(
    gh,
    `#!/usr/bin/env node
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
      url: "https://example.com/pr/" + number,
      isDraft: false,
      updatedAt: "2026-07-20T00:00:00Z",
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

  assert.equal(output.footprint.openPrCount, 2);
  assert.deepEqual(
    output.prs.map((pr) => pr.number),
    [1, 2],
  );
});
