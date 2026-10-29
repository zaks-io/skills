#!/usr/bin/env node
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
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { validateState } from "./planner-input-validator.mjs";
import { adaptExternalPlannerState } from "./legacy-planner-input.mjs";
import { applyObservations, validatePlannerState } from "./state-observations.mjs";

const usage =
  "Usage: node planner-state.mjs --state <file> --repo <owner/repo> [--record <observations.json|->]";

function readJson(file, label) {
  let source;
  try {
    source = readFileSync(file === "-" ? 0 : file, "utf8");
  } catch {
    throw new Error(`${label}: cannot read input`);
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label}: invalid JSON`);
  }
}

export function recordPlannerState({ file, repo, observation = {} }) {
  if (!file?.trim() || file === "-") throw new Error("state needs a file path");
  if (!/^[^\s/]+\/[^\s/]+$/.test(repo ?? "")) throw new Error("repo must be owner/repo");
  const directory = path.dirname(path.resolve(file));
  mkdirSync(directory, { recursive: true });
  const target = path.join(realpathSync(directory), path.basename(file));
  const lock = `${target}.lock`;
  let lockFd;
  try {
    lockFd = openSync(lock, "wx", 0o600);
  } catch {
    throw new Error("cannot lock state; check its writer before retrying");
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    let exists = true;
    try {
      if (!lstatSync(target).isFile()) throw new Error("state must be a regular file");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      exists = false;
    }
    let state = exists ? readJson(target, "state") : {};
    try {
      validatePlannerState(state);
    } catch {
      if (!validateState(state)) throw new Error("invalid saved state; no changes written");
      state = adaptExternalPlannerState(state).state;
      validatePlannerState(state);
    }
    if (state.repo != null && state.repo !== repo) throw new Error("state belongs to another repo");
    const next = applyObservations({ ...state, repo }, observation);
    const fd = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(next, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, target);
    return next;
  } finally {
    rmSync(temporary, { force: true });
    closeSync(lockFd);
    rmSync(lock);
  }
}

export function main(args) {
  const { values } = parseArgs({
    args,
    options: {
      state: { type: "string" },
      repo: { type: "string" },
      record: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  if (!values.state || !values.repo) throw new Error(usage);
  const observation = values.record === undefined ? {} : readJson(values.record, "observation");
  recordPlannerState({ file: values.state, repo: values.repo, observation });
  console.log("Planner state saved.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`planner-state: ${error.message}`);
    process.exitCode = 1;
  }
}
