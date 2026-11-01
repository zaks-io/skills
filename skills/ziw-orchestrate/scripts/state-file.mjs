import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlannerState } from "./state-observations.mjs";

export function parseJson(source, label) {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label}: invalid JSON`);
  }
}
export function assertStateVersion(state, file, repo) {
  if (state?.v == null || [1, 2].includes(state.v))
    throw new Error(
      `state file ${file} uses a retired format; run: node ${fileURLToPath(new URL("./planner-state.mjs", import.meta.url))} migrate --repo ${repo ?? state?.repo ?? "<owner/repo>"} --state ${file}`,
    );
  if (state.v > 3)
    throw new Error(`state file ${file} was written by a newer skill version; refresh skills`);
}
export function validateBoundState(state, repo, file) {
  assertStateVersion(state, file, repo);
  validatePlannerState(state);
  if (repo && state.repo !== repo) throw new Error("state belongs to another repo");
  return state;
}
function regular(file, label) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`${label} must be a regular file, not a symlink`);
}
export function readPlannerState(file, repo) {
  regular(file, "state");
  return validateBoundState(parseJson(readFileSync(file, "utf8"), "state"), repo, file);
}
function writeFlushed(file, bytes) {
  const fd = openSync(file, "wx", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function flush(file) {
  const fd = openSync(file, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function updateStateFile({
  file,
  repo,
  transform,
  backup = false,
  dryRun = false,
  requireExisting = false,
  initializeOnly = false,
}) {
  if (!file?.trim() || file === "-") throw new Error("state needs a file path");
  if (!/^[^\s/]+\/[^\s/]+$/.test(repo ?? "")) throw new Error("repo must be owner/repo");
  const directory = path.dirname(path.resolve(file));
  if (!dryRun && !requireExisting) mkdirSync(directory, { recursive: true });
  const target = path.join(realpathSync(directory), path.basename(file));
  const lock = `${target}.lock`;
  let lockFd;
  if (!dryRun) {
    try {
      lockFd = openSync(lock, "wx", 0o600);
    } catch {
      throw new Error("cannot lock state; check its writer before retrying");
    }
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    let bytes;
    try {
      regular(target, "state");
      bytes = readFileSync(target);
    } catch (error) {
      if (error.code !== "ENOENT" || requireExisting) throw error;
    }
    const state = bytes == null ? { v: 3, repo } : parseJson(bytes.toString("utf8"), "state");
    if (state.repo != null && state.repo !== repo) throw new Error("state belongs to another repo");
    const next = transform(state);
    validateBoundState(next, repo, file);
    if (dryRun || (backup && state.v === 3) || (initializeOnly && bytes != null))
      return { state: next, alreadyV3: state.v === 3 };
    if (backup) {
      const backupFile = `${target}.pre-v3.json`;
      let existing;
      try {
        regular(backupFile, "backup");
        existing = readFileSync(backupFile);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (existing && !existing.equals(bytes))
        throw new Error("existing pre-v3 backup has different bytes; no changes written");
      // A matching backup may be left by an attempt whose flush failed.
      if (existing) flush(backupFile);
      else writeFlushed(backupFile, bytes);
    }
    writeFlushed(temporary, `${JSON.stringify(next, null, 2)}\n`);
    // Directory syncs make the backup entry durable before replacement and the replacement after it.
    flush(path.dirname(target));
    renameSync(temporary, target);
    flush(path.dirname(target));
    return { state: next, alreadyV3: false };
  } finally {
    if (!dryRun) {
      rmSync(temporary, { force: true });
      closeSync(lockFd);
      rmSync(lock);
    }
  }
}
