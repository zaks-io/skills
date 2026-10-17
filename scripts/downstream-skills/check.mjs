import { existsSync } from "node:fs";
import path from "node:path";

import { extractFullLocalGate } from "./discovery.mjs";
import { outputTail, run } from "./process.mjs";

// Fresh worktrees have no dependencies. Frozen installs keep the lockfile out
// of the generated diff, which the coordinator commits with `git add -A`.
const FROZEN_INSTALLS = [
  ["pnpm-lock.yaml", "pnpm install --frozen-lockfile"],
  ["bun.lock", "bun install --frozen-lockfile"],
  ["bun.lockb", "bun install --frozen-lockfile"],
  ["package-lock.json", "npm ci"],
  ["yarn.lock", "yarn install --immutable"],
];

export function frozenInstallCommand(repoRoot) {
  const match = FROZEN_INSTALLS.find(([lockfile]) => existsSync(path.join(repoRoot, lockfile)));
  return match?.[1] ?? null;
}

export function runConfiguredCheck(result, repoRoot) {
  const gate = extractFullLocalGate(path.join(repoRoot, "docs/agents/workflow/config.md"));
  if (!gate) {
    return { ...result, checkStatus: "missing-full-local-gate" };
  }

  const install = frozenInstallCommand(repoRoot);
  if (install) {
    const installed = run(install, [], repoRoot, { shell: true });
    if (installed.status !== 0) {
      return checkResult(result, install, installed);
    }
  }

  // Repo-configured gates are trusted repo commands; only use --check on repos
  // whose workflow config you are willing to execute with full shell behavior.
  return checkResult(result, gate, run(gate, [], repoRoot, { shell: true }));
}

function checkResult(result, command, check) {
  return {
    ...result,
    checkCommand: command,
    checkExitCode: check.status,
    checkOutput: outputTail(check),
    checkStatus: check.status === 0 ? "passed" : "failed",
  };
}
