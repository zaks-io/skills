import path from "node:path";

import { buildTargets, extractFullLocalGate } from "./discovery.mjs";
import { DEFAULT_SOURCE } from "./options.mjs";
import { gitStatus, outputTail, run } from "./process.mjs";
import {
  createUpdateWorktree,
  deleteUpdateBranch,
  ensureBranch,
  removeUpdateWorktree,
} from "./worktrees.mjs";

export function updateTargets(options) {
  return buildTargets(options).map((target) => updateTarget(target, options));
}

function updateTarget(target, options) {
  if (target.status !== "candidate") {
    return target;
  }

  const before = gitStatus(target.repoRoot);
  if (before === null) {
    return { ...target, status: "not-git-repo" };
  }
  if (before.length > 0 && !options.allowDirty && (!options.apply || options.inPlace)) {
    return { ...target, status: "skipped-dirty", before };
  }
  if (!options.apply) {
    return { ...target, status: "dry-run", before };
  }

  return options.inPlace
    ? updateTargetInPlace(target, options, before)
    : updateTargetInWorktree(target, options, before);
}

function updateTargetInPlace(target, options, before) {
  const branched = options.commit ? ensureBranch(target.repoRoot, options.branchPrefix) : null;
  if (branched && branched.status !== "ok") {
    return branchFailure(target, branched);
  }

  return updateInCheckout(target, options, target.repoRoot, before, branched?.branchName ?? null);
}

function updateTargetInWorktree(target, options, sourceBefore) {
  const worktree = createUpdateWorktree(target.repoRoot, options);
  if (worktree.status !== "ok") {
    return worktreeFailure(target, worktree);
  }

  const before = gitStatus(worktree.worktreePath) ?? [];
  const result = updateInCheckout(
    {
      ...target,
      baseRef: worktree.baseRef,
      reusedBranch: worktree.reusedBranch,
      sourceBefore,
      worktreePath: worktree.worktreePath,
    },
    options,
    worktree.worktreePath,
    before,
    worktree.branchName,
  );
  return maybeRemoveWorktree(result, target.repoRoot, options);
}

function updateInCheckout(target, options, checkoutRoot, before, branchName) {
  const result = runProjectUpdate(target, checkoutRoot, before);
  if (result.status !== "updated") {
    const branchResult = existingBranchResult(result, checkoutRoot, branchName);
    return publishResult(branchResult, options, checkoutRoot, branchName);
  }

  const checked = options.check ? runConfiguredCheck(result, checkoutRoot) : result;
  if (options.check && checked.checkStatus !== "passed") {
    return withBranch(checked, branchName);
  }
  if (!options.commit) {
    return withBranch(checked, branchName);
  }

  const committed = commitUpdate(checked, checkoutRoot, branchName);
  return publishResult(committed, options, checkoutRoot, branchName);
}

function runProjectUpdate(target, checkoutRoot, before) {
  const update = run("npx", ["skills", "update", "-p", "-y"], checkoutRoot);
  const after = gitStatus(checkoutRoot) ?? [];
  const changed = statusLinesChanged(before, after);
  return {
    ...target,
    after,
    before,
    changed,
    status: update.status === 0 ? (changed ? "updated" : "unchanged") : "update-failed",
    updateExitCode: update.status,
    updateOutput: outputTail(update),
  };
}

function runConfiguredCheck(result, repoRoot) {
  const gate = extractFullLocalGate(path.join(repoRoot, "docs/agents/workflow/config.md"));
  if (!gate) {
    return { ...result, checkStatus: "missing-full-local-gate" };
  }

  // Repo-configured gates are trusted repo commands; only use --check on repos
  // whose workflow config you are willing to execute with full shell behavior.
  const check = run(gate, [], repoRoot, { shell: true });
  return {
    ...result,
    checkCommand: gate,
    checkExitCode: check.status,
    checkOutput: outputTail(check),
    checkStatus: check.status === 0 ? "passed" : "failed",
  };
}

function commitUpdate(result, repoRoot, branchName) {
  const add = run("git", ["add", "-A"], repoRoot);
  if (add.status !== 0) {
    return { ...result, branchName, status: "commit-failed", error: outputTail(add) };
  }

  const commit = run("git", ["commit", "-m", "chore: update workflow skills"], repoRoot);
  if (commit.status !== 0) {
    return { ...result, branchName, status: "commit-failed", error: outputTail(commit) };
  }

  const hash = run("git", ["rev-parse", "--short", "HEAD"], repoRoot).stdout.trim();
  return { ...result, branchName, commit: hash, status: "committed" };
}

function publishResult(result, options, repoRoot, branchName) {
  if (!options.push || result.status !== "committed") {
    return result;
  }

  const pushed = pushBranch(result, repoRoot, branchName, options);
  return options.pr && pushed.status === "pushed"
    ? createPr(pushed, repoRoot, options.source)
    : pushed;
}

function existingBranchResult(result, repoRoot, branchName) {
  if (!result.baseRef || !branchName || !branchHasDiff(repoRoot, result.baseRef)) {
    return withBranch(result, branchName);
  }

  const hash = run("git", ["rev-parse", "--short", "HEAD"], repoRoot).stdout.trim();
  return {
    ...withBranch(result, branchName),
    commit: hash,
    status: "committed",
  };
}

function branchHasDiff(repoRoot, baseRef) {
  return run("git", ["diff", "--quiet", `${baseRef}...HEAD`], repoRoot).status === 1;
}

function pushBranch(result, repoRoot, branchName, options) {
  const args = ["push", "-u", "origin", branchName];
  const skipPushHooks = options.skipPushHooks !== false;
  if (skipPushHooks) {
    args.splice(1, 0, "--no-verify");
  }

  const push = run("git", args, repoRoot);
  return push.status === 0
    ? {
        ...result,
        pushHooks: skipPushHooks ? "skipped" : "verified",
        status: "pushed",
      }
    : { ...result, status: "push-failed", error: outputTail(push) };
}

function createPr(result, repoRoot, source) {
  const existing = existingPrUrl(repoRoot, result.branchName);
  if (existing) {
    return { ...result, prUrl: existing, status: "pr-existing" };
  }

  const pr = run(
    "gh",
    [
      "pr",
      "create",
      "--title",
      prTitle(),
      "--body",
      prBody(result, source),
      "--head",
      result.branchName,
    ],
    repoRoot,
  );
  const url = extractPrUrl(pr.stdout);
  return pr.status === 0
    ? { ...result, prUrl: url ?? "", status: "pr-created" }
    : { ...result, status: "pr-failed", error: outputTail(pr) };
}

function existingPrUrl(repoRoot, branchName) {
  const pr = run(
    "gh",
    ["pr", "list", "--head", branchName, "--state", "open", "--json", "url", "--jq", ".[0].url"],
    repoRoot,
  );
  return pr.status === 0 ? pr.stdout.trim() : "";
}

function prTitle() {
  return "chore: update workflow skills";
}

export function prBody(result, source = DEFAULT_SOURCE) {
  return [
    "## Summary",
    "",
    `- Refresh project-scoped workflow skills from \`${source}\`.`,
    "- Generated by `npx skills update -p -y`.",
    "",
    "## Review automation",
    "",
    "- @coderabbitai ignore",
    "- CodeRabbit disabled for this mechanical generated dependency update.",
    "",
    "## Test plan",
    "",
    result.checkCommand ? `- \`${result.checkCommand}\`` : "- Not run by coordinator",
  ].join("\n");
}

export function extractPrUrl(output) {
  const lines = output.trim().split("\n").filter(Boolean);
  return lines.find((line) => line.startsWith("http")) ?? lines[0];
}

function branchFailure(target, branch) {
  return {
    ...target,
    branchName: branch.branchName,
    status: "branch-failed",
    error: branch.error,
  };
}

function worktreeFailure(target, worktree) {
  return {
    ...target,
    baseRef: worktree.baseRef,
    branchName: worktree.branchName,
    error: worktree.error,
    status: "worktree-failed",
    worktreePath: worktree.worktreePath,
  };
}

function maybeRemoveWorktree(result, sourceRepoRoot, options) {
  if (options.keepWorktree) {
    return { ...result, worktreeCleanup: "kept" };
  }

  if (!shouldRemoveWorktree(result.status)) {
    return { ...result, worktreeCleanup: "kept" };
  }

  const removed = removeUpdateWorktree(sourceRepoRoot, result.worktreePath);
  if (removed.status !== "removed") {
    return {
      ...result,
      worktreeCleanup: "failed",
      worktreeCleanupError: removed.error,
    };
  }

  if (result.status !== "unchanged") {
    return { ...result, worktreeCleanup: "removed" };
  }

  const deleted = deleteUpdateBranch(sourceRepoRoot, result.branchName);
  return deleted.status === "deleted"
    ? { ...result, branchCleanup: "deleted", worktreeCleanup: "removed" }
    : {
        ...result,
        branchCleanup: "failed",
        branchCleanupError: deleted.error,
        worktreeCleanup: "removed",
      };
}

function shouldRemoveWorktree(status) {
  return ["unchanged", "committed", "pushed", "pr-created", "pr-existing"].includes(status);
}

function withBranch(result, branchName) {
  return branchName ? { ...result, branchName } : result;
}

export function statusLinesChanged(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return beforeSet.size !== afterSet.size || [...afterSet].some((line) => !beforeSet.has(line));
}
