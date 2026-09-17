import assert from "node:assert/strict";
import test from "node:test";
import { hasFailures, printReport } from "../scripts/downstream-skills/report.mjs";

test("incomplete downstream targets and checks fail the batch", () => {
  for (const status of [
    "missing-lockfile",
    "invalid-lockfile",
    "not-git-repo",
    "skipped-dirty",
    "update-failed",
  ]) {
    assert.equal(hasFailures([{ status }]), true, status);
  }
  assert.equal(hasFailures([{ status: "updated", checkStatus: "missing-full-local-gate" }]), true);
  assert.equal(hasFailures([{ status: "unchanged", worktreeCleanup: "failed" }]), true);
  assert.equal(hasFailures([{ status: "pr-created", checkStatus: "passed" }]), false);
});

test("default report preserves configured check output", (t) => {
  const lines = [];
  t.mock.method(console, "log", (line) => lines.push(line));
  const output = Array.from({ length: 30 }, (_, i) => `failure detail ${i}`).join("\n");
  printReport(
    [
      {
        repoRoot: "/repo",
        status: "updated",
        checkStatus: "failed",
        checkCommand: "pnpm verify",
        checkOutput: output,
      },
    ],
    { source: "zaks-io/skills", apply: true },
  );
  assert.ok(lines.includes(output));
});
