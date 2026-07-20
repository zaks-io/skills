import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { outputTail, run } from "./process.mjs";

export const DEFAULT_WORKTREE_ROOT = path.join(os.tmpdir(), "ziw-skills-worktrees");
export const DEFAULT_BASE_REF = "main";

export function ensureBranch(repoRoot, branchPrefix) {
  const branchName = branchNameForDate(branchPrefix);
  const current = run("git", ["branch", "--show-current"], repoRoot).stdout.trim();
  if (current === branchName) {
    return { status: "ok", branchName };
  }

  const exists = branchExists(repoRoot, branchName);
  const switched = exists
    ? run("git", ["switch", branchName], repoRoot)
    : run("git", ["switch", "-c", branchName], repoRoot);
  return switched.status === 0
    ? { status: "ok", branchName }
    : { status: "failed", branchName, error: outputTail(switched) };
}

export function createUpdateWorktree(repoRoot, options) {
  const base = resolveBaseRef(repoRoot, options.baseRef ?? DEFAULT_BASE_REF);
  if (base.status !== "ok") {
    return {
      status: "failed",
      error: base.error,
    };
  }

  const branchName = branchNameForDate(options.branchPrefix);
  const branchAlreadyExists = branchExists(repoRoot, branchName);
  const worktreePath = path.join(
    options.worktreeRoot,
    `${repoSlug(repoRoot)}-${Date.now().toString(36)}-${randomSuffix()}`,
  );

  mkdirSync(options.worktreeRoot, { recursive: true });
  const args = branchAlreadyExists
    ? ["worktree", "add", worktreePath, branchName]
    : ["worktree", "add", "-b", branchName, worktreePath, base.baseRef];
  const added = run("git", args, repoRoot);
  if (added.status !== 0) {
    return {
      status: "failed",
      baseRef: base.baseRef,
      branchName,
      worktreePath,
      error: outputTail(added),
    };
  }

  if (branchAlreadyExists) {
    const merged = run("git", ["merge", "--no-edit", base.baseRef], worktreePath);
    if (merged.status !== 0) {
      return {
        status: "failed",
        baseRef: base.baseRef,
        branchName,
        reusedBranch: true,
        worktreePath,
        error: `Cannot update existing branch from ${base.baseRef}: ${outputTail(merged)}`,
      };
    }
  }

  return {
    status: "ok",
    baseRef: base.baseRef,
    branchName,
    reusedBranch: branchAlreadyExists,
    worktreePath,
  };
}

export function removeUpdateWorktree(repoRoot, worktreePath) {
  const removed = run("git", ["worktree", "remove", "--force", worktreePath], repoRoot);
  return removed.status === 0
    ? { status: "removed" }
    : { status: "failed", error: outputTail(removed) };
}

export function deleteUpdateBranch(repoRoot, branchName) {
  const deleted = run("git", ["branch", "-D", branchName], repoRoot);
  return deleted.status === 0
    ? { status: "deleted" }
    : { status: "failed", error: outputTail(deleted) };
}

function resolveBaseRef(repoRoot, requestedRef) {
  // A stale local main silently produces update branches that conflict with
  // origin/main, so the default fetches and prefers the remote ref.
  if (requestedRef === DEFAULT_BASE_REF) {
    const origin = run("git", ["remote", "get-url", "origin"], repoRoot);
    if (origin.status === 0) {
      const fetched = run("git", ["fetch", "origin", "main", "--quiet"], repoRoot);
      if (fetched.status !== 0) {
        return { status: "failed", error: `Cannot refresh origin/main: ${outputTail(fetched)}` };
      }
      return commitExists(repoRoot, "origin/main")
        ? { status: "ok", baseRef: "origin/main" }
        : { status: "failed", error: "Fetched origin/main but the ref is unavailable" };
    }
  }
  const candidates = [requestedRef];
  const baseRef = candidates.find((ref) => commitExists(repoRoot, ref));
  return baseRef
    ? { status: "ok", baseRef }
    : {
        status: "failed",
        error: `Base ref not found: ${candidates.join(" or ")}`,
      };
}

function branchNameForDate(branchPrefix) {
  return `${branchPrefix}-${new Date().toISOString().slice(0, 10)}`;
}

function branchExists(repoRoot, branchName) {
  return (
    run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], repoRoot).status ===
    0
  );
}

function commitExists(repoRoot, ref) {
  return run("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], repoRoot).status === 0;
}

function repoSlug(repoRoot) {
  return (
    path
      .basename(repoRoot)
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(0, 40) || "repo"
  );
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}
