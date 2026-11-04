import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}
export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`cannot read JSON ${file}: ${error.message}`);
  }
}
export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}
export function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function fileHash(file) {
  return hash(readFileSync(file));
}
export function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
export function clean(root) {
  assert(!git(root, "status", "--porcelain"), "working tree must be clean");
}
export function inside(root, relative) {
  assert(
    typeof relative === "string" && relative.trim() && !path.isAbsolute(relative),
    `expected relative path: ${relative}`,
  );
  const resolved = path.resolve(root, relative);
  assert(resolved.startsWith(root + path.sep), `path escapes root: ${relative}`);
  let ancestor = resolved;
  while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const real = realpathSync(ancestor);
  assert(real === root || real.startsWith(root + path.sep), `symlink escapes root: ${relative}`);
  return resolved;
}
export function filesUnder(root, prefixes) {
  const output = {};
  function visit(file) {
    const info = lstatSync(file);
    assert(!info.isSymbolicLink(), `protected/reference symlinks are unsupported: ${file}`);
    if (info.isDirectory())
      for (const entry of readdirSync(file).sort()) visit(path.join(file, entry));
    else {
      assert(info.isFile(), `expected regular file: ${file}`);
      output[path.relative(root, file)] = fileHash(file);
    }
  }
  for (const prefix of prefixes) visit(inside(root, prefix));
  return Object.fromEntries(Object.entries(output).sort(([a], [b]) => a.localeCompare(b)));
}
export function shell(root, command, extraEnv = {}) {
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    signal: result.signal,
  };
}
export function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
export function prefixMatches(file, prefix) {
  const normalized = prefix.replace(/\/+$/, "");
  return file === normalized || file.startsWith(normalized + "/");
}

function running(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
function readOwner(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const owner = Number(text);
  assert(
    Number.isSafeInteger(owner) && owner > 0,
    `${file} is corrupt; remove it once no ratchet command is running`,
  );
  return owner;
}
// link() publishes a lock whose owner is already written, so no reader ever
// sees an empty claim.
function claim(file) {
  const draft = `${file}.${process.pid}`;
  writeFileSync(draft, String(process.pid));
  try {
    linkSync(draft, file);
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(draft, { force: true });
  }
}
const busy = (file, owner) =>
  `another ratchet command${owner ? ` (pid ${owner})` : ""} holds ${file}; rerun after it exits`;
function acquire(file) {
  if (claim(file)) return;
  const owner = readOwner(file);
  if (owner) assert(!running(owner), busy(file, owner));
  // Only the guard holder may replace a dead owner's lock, so two reclaimers
  // cannot remove each other's fresh claims.
  const guard = `${file}.reclaim`;
  assert(
    claim(guard),
    `another ratchet command is recovering ${file}; rerun after it exits, or remove ${guard} if none is running`,
  );
  try {
    const current = readOwner(file);
    if (current) {
      assert(!running(current), busy(file, current));
      rmSync(file);
    }
    assert(claim(file), busy(file, readOwner(file)));
  } finally {
    rmSync(guard, { force: true });
  }
}
// Scheduled wakes and completion callbacks can overlap, so each command holds
// the run for its whole load, transition, Git, and journal transaction.
export function withRunLock(directory, operation) {
  if (!existsSync(directory)) return operation();
  const file = path.join(directory, ".lock");
  acquire(file);
  try {
    return operation();
  } finally {
    rmSync(file, { force: true });
  }
}
