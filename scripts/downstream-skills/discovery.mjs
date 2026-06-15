import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { gitRoot } from "./process.mjs";

const SKIP_DIRS = new Set([
  ".claude",
  ".codex",
  ".git",
  ".next",
  ".t3",
  ".turbo",
  "dist",
  "node_modules",
  "vendor",
  "worktrees",
]);

export function lockfileUsesSource(lockfilePath, source) {
  const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8"));
  if (!lockfile.skills || typeof lockfile.skills !== "object" || Array.isArray(lockfile.skills)) {
    return false;
  }
  return Object.values(lockfile.skills).some((skill) => skill?.source === source);
}

export function extractFullLocalGate(configPath) {
  if (!existsSync(configPath)) {
    return null;
  }

  const text = readFileSync(configPath, "utf8");
  const match = text.match(/^- Full local gate:\s*`([^`]+)`\s*$/m);
  return match?.[1] ?? null;
}

export function discoverLockfiles(root, maxDepth) {
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new Error("maxDepth must be a non-negative integer");
  }

  const lockfiles = [];
  const start = path.resolve(root);

  const visit = (dir, depth) => {
    if (depth > maxDepth) {
      return;
    }

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === "skills-lock.json") {
        lockfiles.push(fullPath);
      } else if (shouldDescend(entry)) {
        visit(fullPath, depth + 1);
      }
    }
  };

  visit(start, 0);
  return lockfiles.sort();
}

export function buildTargets(options) {
  const lockfiles =
    options.repos.length > 0
      ? options.repos.map((repo) => path.join(path.resolve(repo), "skills-lock.json"))
      : discoverLockfiles(options.root, options.maxDepth);
  const targets = [];
  const seenRoots = new Set();

  for (const lockfilePath of lockfiles) {
    const target = buildTarget(lockfilePath, options.source);
    if (!target || seenRoots.has(target.repoRoot)) {
      continue;
    }
    seenRoots.add(target.repoRoot);
    targets.push(target);
  }

  return targets.sort((a, b) => a.repoRoot.localeCompare(b.repoRoot));
}

function buildTarget(lockfilePath, source) {
  if (!existsSync(lockfilePath)) {
    return {
      lockfilePath,
      repoRoot: path.dirname(lockfilePath),
      status: "missing-lockfile",
    };
  }

  try {
    if (!lockfileUsesSource(lockfilePath, source)) {
      return null;
    }
  } catch (error) {
    return {
      lockfilePath,
      repoRoot: path.dirname(lockfilePath),
      status: "invalid-lockfile",
      error: error.message,
    };
  }

  const repoRoot = gitRoot(path.dirname(lockfilePath)) ?? path.dirname(lockfilePath);
  return { lockfilePath, repoRoot, status: "candidate" };
}

function shouldDescend(entry) {
  return entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".");
}
