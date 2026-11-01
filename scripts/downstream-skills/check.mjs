import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { extractFullLocalGate } from "./discovery.mjs";
import { outputTail, run } from "./process.mjs";

// Fresh worktrees have no dependencies. Frozen installs keep the lockfile out
// of the generated diff, which the coordinator commits with `git add -A`.
const FROZEN_INSTALLS = new Map([
  ["pnpm", { lockfiles: ["pnpm-lock.yaml"], command: "pnpm install --frozen-lockfile" }],
  ["bun", { lockfiles: ["bun.lock", "bun.lockb"], command: "bun install --frozen-lockfile" }],
  ["npm", { lockfiles: ["package-lock.json"], command: "npm ci" }],
]);

export function frozenInstall(repoRoot) {
  const { declared, error } = declaredPackageManager(repoRoot);
  if (error) return { error };
  if (declared) {
    const install = FROZEN_INSTALLS.get(declared);
    return install
      ? { command: install.command }
      : { error: `packageManager ${declared} has no supported frozen install` };
  }
  const present = [...FROZEN_INSTALLS].filter(([, { lockfiles }]) =>
    lockfiles.some((lockfile) => existsSync(path.join(repoRoot, lockfile))),
  );
  if (present.length > 1)
    return {
      error: `lockfiles for ${present.map(([name]) => name).join(", ")} without a packageManager field; declare one`,
    };
  return { command: present[0]?.[1].command ?? null };
}

function declaredPackageManager(repoRoot) {
  const manifest = path.join(repoRoot, "package.json");
  if (!existsSync(manifest)) return {};
  let packageManager;
  try {
    ({ packageManager } = JSON.parse(readFileSync(manifest, "utf8")));
  } catch {
    return { error: "package.json is not valid JSON" };
  }
  return typeof packageManager === "string" ? { declared: packageManager.split("@")[0] } : {};
}

export function runConfiguredCheck(result, repoRoot) {
  const gate = extractFullLocalGate(path.join(repoRoot, "docs/agents/workflow/config.md"));
  if (!gate) {
    return { ...result, checkStatus: "missing-full-local-gate" };
  }

  const before = stagedTree(repoRoot);
  const install = frozenInstall(repoRoot);
  if (install.error) {
    return { ...result, checkStatus: "install-unresolved", checkOutput: install.error };
  }
  if (install.command) {
    const installed = run(install.command, [], repoRoot, { shell: true });
    if (installed.status !== 0) {
      return checkResult(result, install.command, installed);
    }
  }

  // Repo-configured gates are trusted repo commands; only use --check on repos
  // whose workflow config you are willing to execute with full shell behavior.
  const checked = checkResult(result, gate, run(gate, [], repoRoot, { shell: true }));
  if (checked.checkStatus !== "passed") return checked;
  return unchangedByCheck(checked, repoRoot, before, stagedTree(repoRoot));
}

// The tree `git add -A` would commit, built in a copy of the index so the real
// one is untouched. It covers content, modes, and files in untracked directories.
function stagedTree(repoRoot) {
  const index = run(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-path", "index"],
    repoRoot,
  );
  if (index.status !== 0) return null;
  const directory = mkdtempSync(path.join(tmpdir(), "ziw-check-index-"));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: path.join(directory, "index") };
    if (existsSync(index.stdout.trim())) copyFileSync(index.stdout.trim(), env.GIT_INDEX_FILE);
    if (run("git", ["add", "-A"], repoRoot, { env }).status !== 0) return null;
    const tree = run("git", ["write-tree"], repoRoot, { env });
    return tree.status === 0 ? tree.stdout.trim() : null;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// The refresh commit stages everything, so the install and gate must leave it
// exactly as the skill refresh did.
function unchangedByCheck(checked, repoRoot, before, after) {
  if (before === null || after === null) {
    return {
      ...checked,
      checkStatus: "failed",
      checkOutput:
        "git could not snapshot the worktree, so the check's file changes are unverified",
    };
  }
  if (before === after) return checked;
  const changed = run("git", ["diff", "--name-status", before, after], repoRoot).stdout.trim();
  return {
    ...checked,
    checkStatus: "changed-files",
    checkOutput: `The install or gate changed files the refresh commit would include:\n${changed}`,
  };
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
