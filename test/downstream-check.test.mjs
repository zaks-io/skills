import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { frozenInstallCommand, runConfiguredCheck } from "../scripts/downstream-skills/check.mjs";
import { extractFullLocalGate } from "../scripts/downstream-skills/discovery.mjs";

const tempDir = () => mkdtempSync(path.join(os.tmpdir(), "ziw-check-test-"));

function writeConfig(root, gateLine) {
  mkdirSync(path.join(root, "docs/agents/workflow"), { recursive: true });
  writeFileSync(path.join(root, "docs/agents/workflow/config.md"), `# Config\n\n${gateLine}\n`);
}

test("extractFullLocalGate reads table-form gates", () => {
  const root = tempDir();
  try {
    const config = path.join(root, "config.md");
    writeFileSync(config, "| Full gate | `bun run verify`: lint, tests |\n");
    assert.equal(extractFullLocalGate(config), "bun run verify");
    writeFileSync(config, "|  Full local gate   |   `pnpm verify` |\n");
    assert.equal(extractFullLocalGate(config), "pnpm verify");
    writeFileSync(config, "| Focused checks | `bun run verify:changed` |\n");
    assert.equal(extractFullLocalGate(config), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("frozenInstallCommand follows the repo lockfile", () => {
  const cases = [
    ["pnpm-lock.yaml", "pnpm install --frozen-lockfile"],
    ["bun.lock", "bun install --frozen-lockfile"],
    ["bun.lockb", "bun install --frozen-lockfile"],
    ["package-lock.json", "npm ci"],
  ];
  for (const [lockfile, command] of cases) {
    const root = tempDir();
    try {
      writeFileSync(path.join(root, lockfile), "");
      assert.equal(frozenInstallCommand(root), command);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  const empty = tempDir();
  try {
    assert.equal(frozenInstallCommand(empty), null);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("runConfiguredCheck runs the gate when no lockfile exists", () => {
  const root = tempDir();
  try {
    writeConfig(root, "- Full local gate: `echo ran > gate.txt`");
    const checked = runConfiguredCheck({ status: "updated" }, root);
    assert.equal(checked.checkStatus, "passed");
    assert.equal(checked.checkCommand, "echo ran > gate.txt");
    assert.equal(readFileSync(path.join(root, "gate.txt"), "utf8").trim(), "ran");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runConfiguredCheck stops before the gate when the install fails", () => {
  const root = tempDir();
  try {
    writeConfig(root, "- Full local gate: `echo ran > gate.txt`");
    writeFileSync(path.join(root, "package-lock.json"), "not json");
    const checked = runConfiguredCheck({ status: "updated" }, root);
    assert.equal(checked.checkStatus, "failed");
    assert.equal(checked.checkCommand, "npm ci");
    assert.throws(() => readFileSync(path.join(root, "gate.txt")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runConfiguredCheck reports a missing gate without installing", () => {
  const root = tempDir();
  try {
    writeConfig(root, "- Smoke: none");
    const checked = runConfiguredCheck({ status: "updated" }, root);
    assert.equal(checked.checkStatus, "missing-full-local-gate");
    assert.equal(checked.checkCommand, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
