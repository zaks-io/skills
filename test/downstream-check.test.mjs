import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { frozenInstall, runConfiguredCheck } from "../scripts/downstream-skills/check.mjs";
import { extractFullLocalGate } from "../scripts/downstream-skills/discovery.mjs";

function tempRepo(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ziw-check-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

function writeConfig(root, gateLine) {
  mkdirSync(path.join(root, "docs/agents/workflow"), { recursive: true });
  writeFileSync(path.join(root, "docs/agents/workflow/config.md"), `# Config\n\n${gateLine}\n`);
}

test("extractFullLocalGate reads table-form gates", (t) => {
  const config = path.join(tempRepo(t), "config.md");
  writeFileSync(config, "| Full gate | `bun run verify`: lint, tests |\n");
  assert.equal(extractFullLocalGate(config), "bun run verify");
  writeFileSync(config, "|  Full local gate   |   `pnpm verify` |\n");
  assert.equal(extractFullLocalGate(config), "pnpm verify");
  writeFileSync(config, "| Focused checks | `bun run verify:changed` |\n");
  assert.equal(extractFullLocalGate(config), null);
});

test("extractFullLocalGate ignores fenced examples and rows split across lines", (t) => {
  const config = path.join(tempRepo(t), "config.md");
  writeFileSync(
    config,
    "```md\n| Full gate | `true` |\n```\n\n- Full local gate: `pnpm ci:check`\n",
  );
  assert.equal(extractFullLocalGate(config), "pnpm ci:check");
  writeFileSync(config, "|\nFull gate |\n`true` |\n");
  assert.equal(extractFullLocalGate(config), null);
  // A fence closes only on its own character and at least its length.
  for (const [open, inner] of [
    ["```", "~~~"],
    ["````", "```"],
  ]) {
    writeFileSync(
      config,
      `${open}md\n${inner}\n| Full gate | \`true\` |\n${open}\n\n- Full local gate: \`pnpm ci:check\`\n`,
    );
    assert.equal(extractFullLocalGate(config), "pnpm ci:check", `${open} fence with ${inner}`);
  }
});

test("frozenInstall follows the repo lockfile", (t) => {
  const cases = [
    ["pnpm-lock.yaml", "pnpm install --frozen-lockfile"],
    ["bun.lock", "bun install --frozen-lockfile"],
    ["bun.lockb", "bun install --frozen-lockfile"],
    ["package-lock.json", "npm ci"],
  ];
  for (const [lockfile, command] of cases) {
    const root = tempRepo(t);
    writeFileSync(path.join(root, lockfile), "");
    assert.deepEqual(frozenInstall(root), { command });
  }
  assert.deepEqual(frozenInstall(tempRepo(t)), { command: null });
});

test("frozenInstall prefers the declared package manager and refuses ambiguity", (t) => {
  const declared = tempRepo(t);
  writeFileSync(path.join(declared, "pnpm-lock.yaml"), "");
  writeFileSync(path.join(declared, "bun.lock"), "");
  writeFileSync(path.join(declared, "package.json"), '{"packageManager":"bun@1.3.0"}');
  assert.deepEqual(frozenInstall(declared), { command: "bun install --frozen-lockfile" });

  const ambiguous = tempRepo(t);
  writeFileSync(path.join(ambiguous, "pnpm-lock.yaml"), "");
  writeFileSync(path.join(ambiguous, "package-lock.json"), "");
  assert.match(frozenInstall(ambiguous).error, /pnpm, npm without a packageManager/);

  const yarn = tempRepo(t);
  writeFileSync(path.join(yarn, "package.json"), '{"packageManager":"yarn@4.0.0"}');
  assert.match(frozenInstall(yarn).error, /yarn has no supported frozen install/);
});

test("runConfiguredCheck runs the gate when no lockfile exists", (t) => {
  const root = tempRepo(t);
  writeFileSync(path.join(root, ".gitignore"), "gate.txt\n");
  writeConfig(root, "- Full local gate: `echo ran > gate.txt`");
  const checked = runConfiguredCheck({ status: "updated" }, root);
  assert.equal(checked.checkStatus, "passed");
  assert.equal(checked.checkCommand, "echo ran > gate.txt");
  assert.equal(readFileSync(path.join(root, "gate.txt"), "utf8").trim(), "ran");
});

test("runConfiguredCheck refuses files the install or gate adds to the refresh commit", (t) => {
  const root = tempRepo(t);
  writeConfig(root, "- Full local gate: `echo leaked > generated.txt`");
  const checked = runConfiguredCheck({ status: "updated" }, root);
  assert.equal(checked.checkStatus, "changed-files");
  assert.match(checked.checkOutput, /generated\.txt/);
});

test("runConfiguredCheck refuses content changes that keep the same git status", (t) => {
  const root = tempRepo(t);
  writeFileSync(path.join(root, "skills-lock.json"), "{}\n");
  execFileSync("git", ["add", "skills-lock.json"], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
    ].concat(["commit", "-qm", "base"]),
    { cwd: root },
  );
  // The refresh has already modified the lockfile and added an untracked directory.
  writeFileSync(path.join(root, "skills-lock.json"), '{"refreshed":true}\n');
  mkdirSync(path.join(root, "generated"));
  writeFileSync(path.join(root, "generated/a.txt"), "refresh\n");
  writeConfig(
    root,
    "- Full local gate: `echo '{}' > skills-lock.json && echo extra > generated/b.txt`",
  );
  const checked = runConfiguredCheck({ status: "updated" }, root);
  assert.equal(checked.checkStatus, "changed-files");
  assert.match(checked.checkOutput, /skills-lock\.json/);
  assert.match(checked.checkOutput, /generated\/b\.txt/);
});

test("runConfiguredCheck stops before the gate when the install fails", (t) => {
  const root = tempRepo(t);
  writeConfig(root, "- Full local gate: `echo ran > gate.txt`");
  writeFileSync(path.join(root, "package-lock.json"), "not json");
  const checked = runConfiguredCheck({ status: "updated" }, root);
  assert.equal(checked.checkStatus, "failed");
  assert.equal(checked.checkCommand, "npm ci");
  assert.throws(() => readFileSync(path.join(root, "gate.txt")));
});

test("runConfiguredCheck stops before installing when the package manager is unresolved", (t) => {
  const root = tempRepo(t);
  writeConfig(root, "- Full local gate: `echo ran > gate.txt`");
  writeFileSync(path.join(root, "pnpm-lock.yaml"), "");
  writeFileSync(path.join(root, "bun.lock"), "");
  const checked = runConfiguredCheck({ status: "updated" }, root);
  assert.equal(checked.checkStatus, "install-unresolved");
  assert.throws(() => readFileSync(path.join(root, "gate.txt")));
});

test("runConfiguredCheck reports a missing gate without installing", (t) => {
  const root = tempRepo(t);
  writeConfig(root, "- Smoke: none");
  const checked = runConfiguredCheck({ status: "updated" }, root);
  assert.equal(checked.checkStatus, "missing-full-local-gate");
  assert.equal(checked.checkCommand, undefined);
});
