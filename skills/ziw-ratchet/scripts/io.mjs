import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  mkdirSync,
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
