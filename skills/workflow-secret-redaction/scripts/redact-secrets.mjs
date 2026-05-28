#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";
import { analyzeSecret, createFingerprint } from "./lib/analyze.mjs";
import {
  checkExpectations,
  diffSources,
  parseEnv,
  parseSchema,
  strictFailures,
} from "./lib/env.mjs";
import {
  renderChecks,
  renderDiff,
  renderEnvSource,
  renderFailures,
  renderJson,
  renderTextSource,
  toPublicSource,
} from "./lib/render.mjs";

const usage = `Usage:
  node redact-secrets.mjs [options] <file...>
  command | node redact-secrets.mjs --stdin [--mode env|text]
  node redact-secrets.mjs --diff <old.env> <new.env> [options]

Options:
  --stdin                    Read input from stdin.
  --mode env|text            Redact .env-style assignments or raw text. Default: env.
  --text                     Alias for --mode text.
  --hide-keys                Replace key names with KEY_1, KEY_2, ...
  --expect KEY[,KEY...]      Check required keys for present, missing, empty, duplicate.
  --schema FILE              Check expected formats from KEY=Format lines.
  --strict                   Exit nonzero on missing, empty, duplicate, parse, or format failures.
  --json                     Emit machine-readable redacted output.
  --diff OLD NEW             Compare two .env-style files by key without showing values.
  --no-fingerprint           Omit per-run HMAC fingerprints.
  --fingerprint-key-env VAR  Use VAR as the HMAC key for stable local comparisons.
  --help                     Show this help.
`;

const fail = (message, exitCode = 2) => {
  console.error(message);
  process.exit(exitCode);
};

const readText = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    fail(`Cannot read ${file}: ${error.message}`, 1);
  }
};

const splitKeys = (value) =>
  value
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

const parseArgs = (argv) => {
  const options = {
    diff: null,
    expect: [],
    fingerprint: true,
    fingerprintKeyEnv: null,
    hideKeys: false,
    json: false,
    mode: "env",
    schema: null,
    stdin: false,
    strict: false,
  };
  const files = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    } else if (arg === "--stdin") options.stdin = true;
    else if (arg === "--text") options.mode = "text";
    else if (arg === "--hide-keys") options.hideKeys = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--no-fingerprint") options.fingerprint = false;
    else if (arg === "--mode") {
      options.mode = argv[++index];
      if (!["env", "text"].includes(options.mode)) fail("--mode must be env or text");
    } else if (arg === "--expect") {
      const value = argv[++index] ?? fail("--expect requires a key list");
      options.expect.push(...splitKeys(value));
    } else if (arg === "--schema")
      options.schema = argv[++index] ?? fail("--schema requires a file");
    else if (arg === "--fingerprint-key-env") {
      options.fingerprintKeyEnv = argv[++index] ?? fail("--fingerprint-key-env requires a name");
    } else if (arg === "--diff") {
      options.diff = [argv[++index], argv[++index]];
      if (!options.diff[0] || !options.diff[1]) fail("--diff requires two files");
    } else if (arg.startsWith("-")) fail(`Unknown option: ${arg}`);
    else files.push(arg);
  }

  return { files, options };
};

const fingerprintKeyFor = (options) => {
  if (!options.fingerprint) return null;
  if (!options.fingerprintKeyEnv) return randomBytes(32);

  const key = process.env[options.fingerprintKeyEnv];
  if (!key) fail(`Environment variable ${options.fingerprintKeyEnv} is not set`);
  return Buffer.from(key, "utf8");
};

const buildSource = ({ fingerprint, hideKeys, label, mode, text }) => {
  if (mode === "text") {
    return { analysis: analyzeSecret(text, { fingerprint }), kind: "text", label };
  }

  return { env: parseEnv(text, { fingerprint, hideKeys }), kind: "env", label };
};

const renderPayload = ({ checks, diffs, failures, options, sources }) => {
  if (options.json) {
    return renderJson({
      checks,
      diff: diffs,
      ok: failures.length === 0,
      sources: sources.map(toPublicSource),
      strictFailures: failures,
    });
  }

  if (diffs) return `${renderDiff(diffs)}\n`;
  const showLabels = sources.length > 1;
  const body = sources
    .map((source) =>
      source.kind === "text" ? renderTextSource(source) : renderEnvSource(source, showLabels),
    )
    .join("\n");
  const checkOutput = renderChecks(checks);
  const failureOutput = renderFailures(failures);
  return `${[body, checkOutput, failureOutput].filter(Boolean).join("\n")}\n`;
};

const { files, options } = parseArgs(process.argv.slice(2));
if (options.diff && (files.length > 0 || options.stdin))
  fail("--diff cannot be combined with files or stdin");
if (!options.diff && !options.stdin && files.length === 0) fail(usage);
if ((options.expect.length > 0 || options.schema) && options.mode !== "env") {
  fail("--expect and --schema require env mode");
}

const fingerprintKey = fingerprintKeyFor(options);
const fingerprint = fingerprintKey ? createFingerprint(fingerprintKey) : null;
const schemaEntries = options.schema ? parseSchema(readText(options.schema)) : [];
const sourceSpecs = options.diff
  ? options.diff.map((file) => ({ label: file, mode: "env", text: readText(file) }))
  : [
      ...files.map((file) => ({ label: file, mode: options.mode, text: readText(file) })),
      ...(options.stdin
        ? [{ label: "stdin", mode: options.mode, text: readFileSync(0, "utf8") }]
        : []),
    ];
const sources = sourceSpecs.map((source) =>
  buildSource({ ...source, fingerprint, hideKeys: options.hideKeys }),
);
const checks =
  options.diff || options.mode !== "env"
    ? []
    : checkExpectations(sources, options.expect, schemaEntries);
const diffs = options.diff
  ? diffSources(sources[0], sources[1], { hideKeys: options.hideKeys })
  : null;
const failures = options.strict ? strictFailures({ checks, mode: options.mode, sources }) : [];

process.stdout.write(renderPayload({ checks, diffs, failures, options, sources }));
if (failures.length > 0) process.exitCode = 1;
