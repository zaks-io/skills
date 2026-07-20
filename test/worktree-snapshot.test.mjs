import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { localWorktrees } from "../skills/ziw-orchestrate/scripts/worktree-snapshot.mjs";

const git = (cwd, args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  }).trim();

test("localWorktrees reports baseline membership and dirty state", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "ziw-worktrees-"));
  git(repo, ["init", "-b", "main"]);
  writeFileSync(path.join(repo, "README.md"), "baseline\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "baseline"]);
  const headSha = git(repo, ["rev-parse", "HEAD"]);

  const [worktree] = localWorktrees({
    baseline: { branch: "main", headSha },
    cwd: repo,
    repo: "zaks-io/example",
  });

  assert.equal(path.basename(worktree.path), path.basename(repo));
  assert.equal(worktree.branch, "main");
  assert.equal(worktree.dirty, false);
  assert.equal(worktree.mergedIntoBaseline, true);
});

test("localWorktrees fails loud when the checkout cannot be inspected", () => {
  assert.throws(
    () =>
      localWorktrees({
        baseline: { branch: "main" },
        cwd: path.join(tmpdir(), "ziw-missing-worktree-root"),
        repo: "zaks-io/example",
      }),
    /cannot inspect git worktrees/,
  );
});
