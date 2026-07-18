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

test("updateTargets opens PRs while skipping downstream pre-push hooks", () => {
  const root = tempDir();
  const oldPath = process.env.PATH;
  try {
    const repo = createConsumerRepo(root);
    addBareOrigin(root, repo);
    installFailingPrePushHook(root, repo);

    const bin = path.join(root, "bin");
    installFakeNpx(bin, "echo generated > generated-skill.txt\n");
    installFakeGh(bin, "https://example.com/pull/1");
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;

    const result = updateTargets(
      worktreeOptions(root, {
        commit: true,
        pr: true,
        push: true,
      }),
    )[0];

    assert.equal(result.status, "pr-created");
    assert.equal(result.pushHooks, "skipped");
    assert.equal(result.prUrl, "https://example.com/pull/1");
    assert.equal(existsSync(result.worktreePath), false);
    assert.equal(gitShowStatus(repo, `origin/${result.branchName}:generated-skill.txt`), 0);
  } finally {
    process.env.PATH = oldPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("updateTargets publishes an existing update branch on rerun", () => {
  const root = tempDir();
  const oldPath = process.env.PATH;
  try {
    const repo = createConsumerRepo(root);
    addBareOrigin(root, repo);
    const branchName = dailyBranchName("codex/test-skills");
    git(repo, "switch", "-c", branchName);
    writeFileSync(path.join(repo, "generated-skill.txt"), "generated\n");
    git(repo, "add", "generated-skill.txt");
    git(repo, "commit", "-m", "chore: update workflow skills");
    const commit = gitOutput(repo, "rev-parse", "--short", "HEAD");
    git(repo, "switch", "main");

    const bin = path.join(root, "bin");
    installFakeNpx(bin, "echo generated > generated-skill.txt\n");
    installFakeGh(bin, "https://example.com/pull/2");
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;

    const result = updateTargets(
      worktreeOptions(root, {
        commit: true,
        pr: true,
        push: true,
      }),
    )[0];

    assert.equal(result.status, "pr-created");
    assert.equal(result.branchName, branchName);
    assert.equal(result.reusedBranch, true);
    assert.equal(result.commit, commit);
    assert.equal(result.prUrl, "https://example.com/pull/2");
    assert.equal(existsSync(result.worktreePath), false);
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
    skipPushHooks: true,
    source: "zaks-io/skills",
    worktreeRoot: path.join(root, "worktrees"),
    ...overrides,
  };
}

function addBareOrigin(root, repo) {
  const remote = path.join(root, "remote.git");
  git(root, "init", "--bare", remote);
  // Point the bare remote's HEAD at main so clones check out main regardless
  // of the host's init.defaultBranch.
  git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "-u", "origin", "main");
}

function installFailingPrePushHook(root, repo) {
  const hooks = path.join(root, "hooks");
  mkdirSync(hooks, { recursive: true });
  const hook = path.join(hooks, "pre-push");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  chmodSync(hook, 0o755);
  git(repo, "config", "core.hooksPath", hooks);
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

function dailyBranchName(branchPrefix) {
  return `${branchPrefix}-${new Date().toISOString().slice(0, 10)}`;
}

function installFakeNpx(bin, body) {
  mkdirSync(bin, { recursive: true });
  const executable = path.join(bin, "npx");
  writeFileSync(executable, `#!/bin/sh\n${body}`);
  chmodSync(executable, 0o755);
}

function installFakeGh(bin, url) {
  mkdirSync(bin, { recursive: true });
  const executable = path.join(bin, "gh");
  writeFileSync(
    executable,
    [
      "#!/bin/sh",
      'if [ "$1" = "pr" ] && [ "$2" = "list" ]; then exit 0; fi',
      `if [ "$1" = "pr" ] && [ "$2" = "create" ]; then echo "${url}"; exit 0; fi`,
      'echo "unexpected gh call: $*" >&2',
      "exit 1",
      "",
    ].join("\n"),
  );
  chmodSync(executable, 0o755);
}

test("updateTargets branches from origin/main when local main is stale", () => {
  const root = tempDir();
  const otherRoot = tempDir();
  const oldPath = process.env.PATH;
  try {
    const repo = createConsumerRepo(root);
    addBareOrigin(root, repo);

    const other = path.join(otherRoot, "other");
    git(otherRoot, "clone", path.join(root, "remote.git"), other);
    git(other, "config", "user.name", "Test");
    git(other, "config", "user.email", "test@example.com");
    writeFileSync(path.join(other, "upstream.txt"), "upstream\n");
    git(other, "add", "upstream.txt");
    git(other, "commit", "-m", "upstream change");
    git(other, "push", "origin", "main");

    const bin = path.join(root, "bin");
    installFakeNpx(bin, "echo generated > generated-skill.txt\n");
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;

    const result = updateTargets(worktreeOptions(root, { commit: true }))[0];

    assert.equal(result.status, "committed");
    assert.equal(result.baseRef, "origin/main");
    assert.equal(gitOutput(repo, "show", `${result.branchName}:upstream.txt`), "upstream");
    assert.equal(gitOutput(repo, "show", `${result.branchName}:generated-skill.txt`), "generated");
  } finally {
    process.env.PATH = oldPath;
    rmSync(root, { recursive: true, force: true });
    rmSync(otherRoot, { recursive: true, force: true });
  }
});
