import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTargets,
  discoverLockfiles,
  extractFullLocalGate,
  lockfileUsesSource,
} from "../scripts/downstream-skills/discovery.mjs";
import { expandHome, parseArgs } from "../scripts/downstream-skills/options.mjs";
import {
  extractPrUrl,
  prBody,
  statusLinesChanged,
  updateTargets,
} from "../scripts/downstream-skills/update.mjs";

const tempDir = () => mkdtempSync(path.join(os.tmpdir(), "ziw-skills-test-"));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

test("parseArgs keeps downstream updater dry-run by default", () => {
  const options = parseArgs(["--root", "~/src", "--source", "zaks-io/skills"]);

  assert.equal(options.apply, false);
  assert.equal(options.source, "zaks-io/skills");
  assert.match(options.root, /src$/);
});

test("parseArgs makes PR fanout explicit and mutation-safe", () => {
  const options = parseArgs(["--pr", "--check", "--trust-check-commands"]);

  assert.equal(options.apply, true);
  assert.equal(options.commit, true);
  assert.equal(options.push, true);
  assert.equal(options.pr, true);
  assert.equal(options.check, true);
  assert.equal(options.trustCheckCommands, true);
  assert.equal(options.baseRef, "main");
  assert.equal(options.inPlace, false);
  assert.equal(options.keepWorktree, false);
  assert.match(options.worktreeRoot, /ziw-skills-worktrees$/);
  assert.doesNotThrow(() => parseArgs(["--commit", "--allow-dirty"]));
  assert.throws(() => parseArgs(["--commit", "--allow-dirty", "--in-place"]), /--commit/);
  assert.throws(() => parseArgs(["--check"]), /trust-check-commands/);
});

test("parseArgs accepts explicit worktree controls", () => {
  const options = parseArgs([
    "--apply",
    "--in-place",
    "--keep-worktree",
    "--base-ref",
    "origin/main",
    "--worktree-root",
    "~/tmp/skills-worktrees",
  ]);

  assert.equal(options.apply, true);
  assert.equal(options.inPlace, true);
  assert.equal(options.keepWorktree, true);
  assert.equal(options.baseRef, "origin/main");
  assert.equal(options.worktreeRoot, path.join(os.homedir(), "tmp/skills-worktrees"));
});

test("parseArgs accepts max depth zero", () => {
  assert.equal(parseArgs(["--max-depth", "0"]).maxDepth, 0);
});

test("expandHome handles bare home and home-relative paths explicitly", () => {
  assert.equal(expandHome("~"), os.homedir());
  assert.equal(expandHome("~/src"), path.join(os.homedir(), "src"));
});

test("lockfileUsesSource matches skills-lock source entries", () => {
  const root = tempDir();
  try {
    const lockfile = path.join(root, "skills-lock.json");
    writeJson(lockfile, {
      version: 1,
      skills: {
        "ziw-pr": {
          source: "zaks-io/skills",
          sourceType: "github",
          skillPath: "skills/ziw-pr/SKILL.md",
        },
      },
    });

    assert.equal(lockfileUsesSource(lockfile, "zaks-io/skills"), true);
    assert.equal(lockfileUsesSource(lockfile, "other/source"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lockfileUsesSource rejects malformed skills entries", () => {
  const root = tempDir();
  try {
    const lockfile = path.join(root, "skills-lock.json");
    writeJson(lockfile, { version: 1, skills: [] });

    assert.equal(lockfileUsesSource(lockfile, "zaks-io/skills"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("extractFullLocalGate reads the configured full local gate", () => {
  const root = tempDir();
  try {
    const config = path.join(root, "config.md");
    writeFileSync(config, "# Agent Config\n\n- Full local gate: `pnpm ci:check`\n");

    assert.equal(extractFullLocalGate(config), "pnpm ci:check");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverLockfiles skips hidden agent worktrees", () => {
  const root = tempDir();
  try {
    mkdirSync(path.join(root, "real-repo"), { recursive: true });
    mkdirSync(path.join(root, "real-repo", ".claude", "worktrees", "agent-1"), {
      recursive: true,
    });
    writeJson(path.join(root, "real-repo", "skills-lock.json"), { version: 1, skills: {} });
    writeJson(path.join(root, "real-repo", ".claude", "worktrees", "agent-1", "skills-lock.json"), {
      version: 1,
      skills: {},
    });

    assert.deepEqual(discoverLockfiles(root, 5), [
      path.join(root, "real-repo", "skills-lock.json"),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverLockfiles rejects invalid maxDepth values", () => {
  const root = tempDir();
  try {
    assert.throws(() => discoverLockfiles(root, -1), /maxDepth/);
    assert.throws(() => discoverLockfiles(root, 1.5), /maxDepth/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("statusLinesChanged detects additions, removals, and replacements", () => {
  assert.equal(statusLinesChanged([], [" M file"]), true);
  assert.equal(statusLinesChanged([" M file"], []), true);
  assert.equal(statusLinesChanged([" M a"], [" M b"]), true);
  assert.equal(statusLinesChanged([" M a"], [" M a"]), false);
});

test("buildTargets and updateTargets handle clean and dirty git repos", () => {
  const root = tempDir();
  try {
    const repo = path.join(root, "consumer");
    mkdirSync(repo, { recursive: true });
    writeJson(path.join(repo, "skills-lock.json"), ziwLockfile());
    git(repo, "init");
    git(repo, "add", "skills-lock.json");
    git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init");

    const options = {
      allowDirty: false,
      apply: false,
      maxDepth: 1,
      repos: [],
      root,
      source: "zaks-io/skills",
    };

    assert.equal(buildTargets(options).length, 1);
    assert.equal(updateTargets(options)[0].status, "dry-run");

    writeFileSync(path.join(repo, "dirty.txt"), "dirty\n");
    assert.equal(updateTargets(options)[0].status, "skipped-dirty");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generated PR body disables optional CodeRabbit review", () => {
  const body = prBody({ checkCommand: "pnpm ci:check" }, "custom/source");

  assert.match(body, /custom\/source/);
  assert.match(body, /@coderabbitai ignore/);
  assert.match(body, /CodeRabbit disabled/);
  assert.match(body, /pnpm ci:check/);
});

test("extractPrUrl returns one output line", () => {
  assert.equal(extractPrUrl("noise\nhttps://example.com/pr/1\nmore\n"), "https://example.com/pr/1");
  assert.equal(extractPrUrl("first line\nsecond line\n"), "first line");
});

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
