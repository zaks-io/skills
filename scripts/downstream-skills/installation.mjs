import fs from "node:fs";
import path from "node:path";

import { run } from "./process.mjs";
import {
  CANONICAL_ROOT,
  parseSourceTree,
  validateInstallation,
  readLock,
  lockNames,
} from "./installation-verification.mjs";

const CLI = "skills@1.7.0";
const RUNTIME_ROOTS = new Map([
  [".claude/skills", "claude-code"],
  ["agent/skills", "eve"],
  [".codex/skills", null],
  ["skills", null],
]);
const ALL_INSTALL_ROOTS = [CANONICAL_ROOT, ...RUNTIME_ROOTS.keys()];

export function refreshInstallation(checkoutRoot, source) {
  const logs = { stdout: [], stderr: [] };
  let sourceSha = "";
  let skillCount = 0;
  try {
    validateSource(source);
    const root = path.resolve(checkoutRoot);
    const commitResult = run("gh", ["api", `repos/${source}/commits/HEAD`, "--jq", ".sha"], root);
    record(logs, commitResult);
    if (commitResult.status !== 0) return failure(logs, sourceSha, skillCount);
    sourceSha = commitResult.stdout.trim();
    if (!/^[0-9a-f]{40}$/.test(sourceSha))
      throw new Error("GitHub returned an invalid source commit");

    const treeResult = run(
      "gh",
      ["api", `repos/${source}/git/trees/${sourceSha}?recursive=1`],
      root,
    );
    record(logs, treeResult);
    if (treeResult.status !== 0) return failure(logs, sourceSha, skillCount);

    const sourceTree = parseSourceTree(JSON.parse(treeResult.stdout));
    skillCount = sourceTree.skills.size;
    const lockPath = path.join(root, "skills-lock.json");
    const lock = readLock(lockPath);
    const sourceNames = lockNames(lock, source);
    if (sourceNames.size === 0) throw new Error(`skills-lock.json has no skills from ${source}`);
    rejectNameCollisions(root, lock, source, sourceNames, sourceTree.skills);

    const tracked = trackedEntries(root);
    const runtimeRoots = inferRuntimeRoots(tracked, sourceNames);
    const retired = [...sourceNames].filter((name) => !sourceTree.skills.has(name)).sort();
    rejectUntrackedMutation(root, new Set(sourceTree.skills.keys()), [
      CANONICAL_ROOT,
      ...runtimeRoots,
    ]);
    rejectUntrackedMutation(root, new Set(retired), ALL_INSTALL_ROOTS);

    const agents = ["codex"];
    for (const [runtimeRoot, agent] of RUNTIME_ROOTS) {
      if (agent && runtimeRoots.has(runtimeRoot)) agents.push(agent);
    }
    const add = run(
      "npx",
      ["--yes", CLI, "add", source, "--skill", "*", "--agent", ...agents, "-y"],
      root,
    );
    record(logs, add);
    if (add.status !== 0) return failure(logs, sourceSha, skillCount);

    if (retired.length > 0) {
      const remove = run("npx", ["--yes", CLI, "remove", ...retired, "-y"], root);
      record(logs, remove);
      if (remove.status !== 0) return failure(logs, sourceSha, skillCount);
    }

    syncLegacyLinks(root, runtimeRoots, sourceTree.skills.keys(), retired);
    assertRetiredRemoved(root, retired);
    validateInstallation(root, source, sourceTree, runtimeRoots);
    return result(0, logs, sourceSha, skillCount);
  } catch (error) {
    logs.stderr.push(error instanceof Error ? error.message : String(error));
    return failure(logs, sourceSha, skillCount);
  }
}

function validateSource(source) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(source)) {
    throw new Error(`Invalid GitHub source: ${source}`);
  }
}

function rejectNameCollisions(root, lock, source, oldNames, skills) {
  for (const name of skills.keys()) {
    const entry = lock.skills[name];
    if (entry && entry.source !== source)
      throw new Error(`Skill name collision: ${name} belongs to ${entry.source}`);
    if (oldNames.has(name)) continue;
    for (const installRoot of ALL_INSTALL_ROOTS) {
      if (lexists(path.join(root, installRoot, name)))
        throw new Error(`Skill name collision at ${installRoot}/${name}`);
    }
  }
}

function trackedEntries(root) {
  const tracked = run("git", ["ls-files", "-s", "-z"], root);
  if (tracked.status !== 0) throw new Error("Cannot inspect tracked skill paths");
  return tracked.stdout
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+) [0-9a-f]+ \d+\t(.+)$/s);
      if (!match) throw new Error("Malformed git ls-files output");
      return { mode: match[1], path: match[2] };
    });
}

function inferRuntimeRoots(tracked, sourceNames) {
  const roots = new Set();
  for (const entry of tracked) {
    const parts = entry.path.split("/");
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (parts[index] !== "skills" || !sourceNames.has(parts[index + 1])) continue;
      const root = parts.slice(0, index + 1).join("/");
      if (root === CANONICAL_ROOT) continue;
      if (!RUNTIME_ROOTS.has(root))
        throw new Error(`Unsupported tracked runtime skill path: ${entry.path}`);
      if (
        (root === "skills" || root === ".codex/skills") &&
        (parts.length !== index + 2 || entry.mode !== "120000")
      ) {
        throw new Error(`Unsupported runtime copy at ${entry.path}`);
      }
      roots.add(root);
    }
  }
  return roots;
}

function rejectUntrackedMutation(root, names, installRoots) {
  if (names.size === 0) return;
  const paths = installRoots.flatMap((installRoot) =>
    [...names].map((name) => `${installRoot}/${name}`),
  );
  const untracked = run("git", ["ls-files", "--others", "-z", "--", ...paths], root);
  if (untracked.status !== 0) throw new Error("Cannot inspect untracked skill files");
  const affected = untracked.stdout
    .split("\0")
    .filter(Boolean)
    .filter((file) =>
      installRoots.some((installRoot) =>
        [...names].some(
          (name) => file === `${installRoot}/${name}` || file.startsWith(`${installRoot}/${name}/`),
        ),
      ),
    );
  if (affected.length > 0)
    throw new Error(
      `Refusing to overwrite or remove untracked skill files: ${affected.join(", ")}`,
    );
}

function syncLegacyLinks(root, runtimeRoots, names, retired) {
  const skillNames = [...names];
  for (const runtimeRoot of runtimeRoots) {
    if (RUNTIME_ROOTS.get(runtimeRoot) !== null) continue;
    const base = path.join(root, runtimeRoot);
    fs.mkdirSync(base, { recursive: true });
    for (const name of retired) {
      const link = path.join(base, name);
      if (!lexists(link)) continue;
      if (
        !fs.lstatSync(link).isSymbolicLink() ||
        path.resolve(base, fs.readlinkSync(link)) !== path.join(root, CANONICAL_ROOT, name)
      ) {
        throw new Error(`Retired runtime link does not target canonical skill: ${link}`);
      }
      fs.unlinkSync(link);
    }
    for (const name of skillNames) {
      const link = path.join(base, name);
      if (lexists(link)) continue;
      fs.symlinkSync(path.relative(base, path.join(root, CANONICAL_ROOT, name)), link);
    }
  }
}

function assertRetiredRemoved(root, retired) {
  for (const name of retired) {
    for (const installRoot of ALL_INSTALL_ROOTS) {
      if (lexists(path.join(root, installRoot, name))) {
        throw new Error(`Retired source skill remains at ${installRoot}/${name}`);
      }
    }
  }
}

function lexists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function record(logs, command) {
  if (command.stdout) logs.stdout.push(command.stdout.trimEnd());
  if (command.stderr) logs.stderr.push(command.stderr.trimEnd());
  if (command.error) logs.stderr.push(command.error.message);
}

function result(status, logs, sourceSha, skillCount) {
  return {
    status,
    stdout: logs.stdout.filter(Boolean).join("\n"),
    stderr: logs.stderr.filter(Boolean).join("\n"),
    sourceSha,
    skillCount,
  };
}

function failure(logs, sourceSha, skillCount) {
  return result(1, logs, sourceSha, skillCount);
}
