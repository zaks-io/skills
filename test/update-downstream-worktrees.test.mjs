import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { updateTargets } from "../scripts/downstream-skills/update.mjs";

const tempDir = () => mkdtempSync(path.join(os.tmpdir(), "ziw-skills-test-"));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

test("updateTargets commits generated updates in a temporary worktree", () => {
  const root = tempDir();
  const oldPath = process.env.PATH;
  try {
    const repo = createConsumerRepo(root);
    const originalBranch = gitOutput(repo, "branch", "--show-current");

    const bin = path.join(root, "bin");
    installFakeNpx(bin, "echo generated > generated-skill.txt\n");
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;

    const result = updateTargets(worktreeOptions(root, { commit: true }))[0];

    assert.equal(result.status, "committed");
    assert.equal(result.repoRoot, realpathSync(repo));
    assert.equal(result.baseRef, "main");
    assert.match(result.branchName, /^codex\/test-skills-\d{4}-\d{2}-\d{2}/);
    assert.equal(result.worktreeCleanup, "removed");
    assert.equal(existsSync(result.worktreePath), false);
    assert.equal(gitOutput(repo, "branch", "--show-current"), originalBranch);
    assert.equal(gitOutput(repo, "status", "--short"), "");
    assert.equal(existsSync(path.join(repo, "generated-skill.txt")), false);
    assert.equal(gitOutput(repo, "show", `${result.branchName}:generated-skill.txt`), "generated");
  } finally {
    process.env.PATH = oldPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("updateTargets branches from main even when the source checkout is dirty", () => {
  const root = tempDir();
  const oldPath = process.env.PATH;
  try {
    const repo = createConsumerRepo(root);
    git(repo, "switch", "-c", "feature");
    writeFileSync(path.join(repo, "feature-only.txt"), "feature\n");
    git(repo, "add", "feature-only.txt");
    git(repo, "commit", "-m", "feature only");
    writeFileSync(path.join(repo, "dirty.txt"), "dirty\n");

    const bin = path.join(root, "bin");
    installFakeNpx(bin, "echo generated > generated-skill.txt\n");
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;

    const result = updateTargets(worktreeOptions(root, { commit: true }))[0];

    assert.equal(result.status, "committed");
    assert.equal(result.baseRef, "main");
    assert.equal(result.sourceBefore.length, 1);
    assert.equal(gitOutput(repo, "branch", "--show-current"), "feature");
    assert.equal(gitOutput(repo, "status", "--short"), "?? dirty.txt");
    assert.equal(gitShowStatus(repo, `${result.branchName}:feature-only.txt`), 128);
    assert.equal(gitOutput(repo, "show", `${result.branchName}:generated-skill.txt`), "generated");
  } finally {
    process.env.PATH = oldPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("updateTargets keeps changed apply-only worktrees for inspection", () => {
  const root = tempDir();
  const oldPath = process.env.PATH;
  try {
    const repo = createConsumerRepo(root);

    const bin = path.join(root, "bin");
    installFakeNpx(bin, "echo generated > generated-skill.txt\n");
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;

    const result = updateTargets(worktreeOptions(root, { commit: false }))[0];

    assert.equal(result.status, "updated");
    assert.equal(result.worktreeCleanup, "kept");
    assert.equal(existsSync(result.worktreePath), true);
    assert.equal(existsSync(path.join(repo, "generated-skill.txt")), false);
    assert.equal(existsSync(path.join(result.worktreePath, "generated-skill.txt")), true);
  } finally {
    process.env.PATH = oldPath;
    rmSync(root, { recursive: true, force: true });
  }
});

function createConsumerRepo(root) {
  const repo = path.join(root, "consumer");
  mkdirSync(repo, { recursive: true });
  writeJson(path.join(repo, "skills-lock.json"), ziwLockfile());
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "add", "skills-lock.json");
  git(repo, "commit", "-m", "init");
  return repo;
}

function worktreeOptions(root, overrides) {
  return {
    allowDirty: false,
    apply: true,
    branchPrefix: "codex/test-skills",
    check: false,
    inPlace: false,
    keepWorktree: false,
    maxDepth: 1,
    pr: false,
    push: false,
    repos: [],
    root,
    source: "zaks-io/skills",
    worktreeRoot: path.join(root, "worktrees"),
    ...overrides,
  };
}

function ziwLockfile() {
  return {
    version: 1,
    skills: {
      "ziw-pr": {
        source: "zaks-io/skills",
        sourceType: "github",
        skillPath: "skills/ziw-pr/SKILL.md",
      },
    },
  };
}

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function gitOutput(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function gitShowStatus(cwd, rev) {
  try {
    execFileSync("git", ["show", rev], { cwd, stdio: "ignore" });
    return 0;
  } catch (error) {
    return error.status;
  }
}

function installFakeNpx(bin, body) {
  mkdirSync(bin, { recursive: true });
  const executable = path.join(bin, "npx");
  writeFileSync(executable, `#!/bin/sh\n${body}`);
  chmodSync(executable, 0o755);
}
