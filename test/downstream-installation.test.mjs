import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseSourceTree,
  validateInstallation,
} from "../scripts/downstream-skills/installation-verification.mjs";
import { refreshInstallation } from "../scripts/downstream-skills/installation.mjs";

const SOURCE = "zaks-io/skills";
const COMMIT = "1".repeat(40);

test("parseSourceTree extracts complete top-level source skills and rejects truncated data", () => {
  const fixture = sourceFixture({ alpha: { "SKILL.md": skill("alpha") } });

  const parsed = parseSourceTree(fixture.tree);

  assert.equal(parsed.skills.size, 1);
  assert.equal(parsed.skills.get("alpha").skillFolderHash, "2".repeat(40));
  assert.equal(parsed.skills.get("alpha").files.get("SKILL.md").sha, blobSha(skill("alpha")));
  assert.throws(
    () => parseSourceTree({ ...fixture.tree, truncated: true }),
    /incomplete or truncated/,
  );
  assert.throws(() => parseSourceTree({ ...fixture.tree, sha: "invalid" }), /malformed/);
});

test("parseSourceTree allows unrelated submodules but rejects them inside skills", () => {
  const fixture = sourceFixture({ alpha: { "SKILL.md": skill("alpha") } });
  const submodule = { path: "vendor/example", type: "commit", mode: "160000", sha: COMMIT };
  fixture.tree.tree.push(submodule);
  assert.equal(parseSourceTree(fixture.tree).skills.size, 1);
  submodule.path = "skills/alpha/vendor";
  assert.throws(() => parseSourceTree(fixture.tree), /Unsupported Git object/);
  fixture.tree.tree.pop();
  const entry = fixture.tree.tree.find((node) => node.path === "skills/alpha/SKILL.md");
  entry.type = "commit";
  entry.mode = "160000";
  assert.throws(() => parseSourceTree(fixture.tree), /Unsupported Git object/);
});

test("validateInstallation rejects stale canonical source bytes", () => {
  const root = tempDir();
  try {
    const fixture = sourceFixture({ alpha: { "SKILL.md": skill("alpha") } });
    writeSkill(root, ".agents/skills", "alpha", fixture.files.alpha);
    fs.mkdirSync(path.join(root, ".claude/skills"), { recursive: true });
    fs.symlinkSync("../../.agents/skills/alpha", path.join(root, ".claude/skills/alpha"));
    writeLock(root, {
      alpha: lockEntry("alpha"),
    });
    const parsed = parseSourceTree(fixture.tree);

    assert.doesNotThrow(() =>
      validateInstallation(root, SOURCE, parsed, new Set([".claude/skills"])),
    );
    writeLock(root, { alpha: { ...lockEntry("alpha"), computedHash: "0".repeat(64) } });
    assert.throws(() => validateInstallation(root, SOURCE, parsed), /Stale computedHash/);
    writeLock(root, { alpha: lockEntry("alpha") });
    fs.writeFileSync(path.join(root, ".agents/skills/alpha/SKILL.md"), "stale\n");
    assert.throws(
      () => validateInstallation(root, SOURCE, parsed, new Set([".claude/skills"])),
      /Stale canonical file/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("refreshInstallation adds every source skill, removes retired skills, and preserves other sources", () => {
  const root = tempDir();
  const oldPath = process.env.PATH;
  try {
    const fixture = sourceFixture({
      alpha: { "SKILL.md": skill("alpha"), "references/note.md": "alpha note\n" },
      beta: { "SKILL.md": skill("beta") },
    });
    const bin = path.join(root, "fake-bin");
    fs.mkdirSync(bin);
    writeExecutable(path.join(bin, "gh"), fakeGh());
    writeExecutable(path.join(bin, "npx"), fakeNpx());
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
    process.env.FAKE_TREE = JSON.stringify(fixture.tree);
    process.env.FAKE_FILES = JSON.stringify(fixture.files);
    process.env.FAKE_CALLS = path.join(root, "calls.jsonl");

    writeSkill(root, ".agents/skills", "alpha", { "SKILL.md": "old alpha\n" });
    writeSkill(root, ".agents/skills", "retired", { "SKILL.md": "old retired\n" });
    for (const runtimeRoot of [".claude/skills", "skills"]) {
      fs.mkdirSync(path.join(root, runtimeRoot), { recursive: true });
      const prefix = runtimeRoot === "skills" ? "../" : "../../";
      fs.symlinkSync(`${prefix}.agents/skills/alpha`, path.join(root, runtimeRoot, "alpha"));
      fs.symlinkSync(`${prefix}.agents/skills/retired`, path.join(root, runtimeRoot, "retired"));
    }
    writeLock(root, {
      alpha: lockEntry("alpha"),
      foreign: { source: "other/source", sourceType: "github", computedHash: "f".repeat(64) },
      retired: lockEntry("retired"),
    });
    git(root, "init");
    git(root, "add", ".agents", ".claude", "skills", "skills-lock.json");

    const result = refreshInstallation(root, SOURCE);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.sourceSha, COMMIT);
    assert.equal(result.skillCount, 2);
    const lock = JSON.parse(fs.readFileSync(path.join(root, "skills-lock.json"), "utf8"));
    assert.deepEqual(Object.keys(lock.skills).sort(), ["alpha", "beta", "foreign"]);
    assert.equal(lock.skills.alpha.skillFolderHash, undefined);
    assert.equal(
      fs.realpathSync(path.join(root, "skills/beta")),
      fs.realpathSync(path.join(root, ".agents/skills/beta")),
    );
    assert.equal(fs.existsSync(path.join(root, ".agents/skills/retired")), false);
    const calls = fs
      .readFileSync(process.env.FAKE_CALLS, "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.deepEqual(calls[0], [
      "--yes",
      "skills@1.7.0",
      "add",
      SOURCE,
      "--skill",
      "*",
      "--agent",
      "codex",
      "claude-code",
      "-y",
    ]);
    assert.deepEqual(calls[1], ["--yes", "skills@1.7.0", "remove", "retired", "-y"]);
  } finally {
    process.env.PATH = oldPath;
    delete process.env.FAKE_TREE;
    delete process.env.FAKE_FILES;
    delete process.env.FAKE_CALLS;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function sourceFixture(files) {
  const tree = [];
  let index = 2;
  for (const [name, skillFiles] of Object.entries(files)) {
    tree.push({
      path: `skills/${name}`,
      mode: "040000",
      type: "tree",
      sha: String(index).repeat(40),
    });
    index += 1;
    for (const [file, content] of Object.entries(skillFiles)) {
      tree.push({
        path: `skills/${name}/${file}`,
        mode: "100644",
        type: "blob",
        sha: blobSha(content),
      });
    }
  }
  return { files, tree: { sha: "a".repeat(40), tree, truncated: false } };
}

function skill(name) {
  return `---\nname: ${name}\ndescription: ${name} fixture\n---\n# ${name}\n`;
}

function blobSha(content) {
  const bytes = Buffer.from(content);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function lockEntry(name) {
  return {
    source: SOURCE,
    sourceType: "github",
    skillPath: `skills/${name}/SKILL.md`,
    computedHash: createHash("sha256").update("SKILL.md").update(skill(name)).digest("hex"),
  };
}

function writeLock(root, skills) {
  fs.writeFileSync(
    path.join(root, "skills-lock.json"),
    `${JSON.stringify({ version: 1, skills }, null, 2)}\n`,
  );
}

function writeSkill(root, installRoot, name, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, installRoot, name, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ziw-installation-"));
}

function git(root, ...args) {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function writeExecutable(target, content) {
  fs.writeFileSync(target, content, { mode: 0o755 });
}

function fakeGh() {
  return `#!/usr/bin/env node
if (process.argv.includes("--jq")) process.stdout.write("${COMMIT}\\n");
else process.stdout.write(process.env.FAKE_TREE);
`;
}

function fakeNpx() {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CALLS, JSON.stringify(args) + "\\n");
const root = process.cwd();
const lockPath = path.join(root, "skills-lock.json");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const remove = (target) => fs.rmSync(target, { recursive: true, force: true });
if (args[2] === "add") {
  const files = JSON.parse(process.env.FAKE_FILES);
  const agents = args.slice(args.indexOf("--agent") + 1, args.indexOf("-y"));
  for (const [name, entries] of Object.entries(files)) {
    const canonical = path.join(root, ".agents/skills", name);
    remove(canonical);
    for (const [file, content] of Object.entries(entries)) {
      const target = path.join(canonical, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    lock.skills[name] = { source: args[3], sourceType: "github", skillPath: "skills/" + name + "/SKILL.md", computedHash: Object.keys(entries).sort((a, b) => a.localeCompare(b)).reduce((hash, file) => hash.update(file).update(entries[file]), crypto.createHash("sha256")).digest("hex") };
    if (agents.includes("claude-code")) {
      const target = path.join(root, ".claude/skills", name);
      remove(target);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.symlinkSync("../../.agents/skills/" + name, target);
    }
  }
} else if (args[2] === "remove") {
  for (const name of args.slice(3, args.indexOf("-y"))) {
    delete lock.skills[name];
    for (const base of [".claude/skills", ".codex/skills", "agent/skills", ".agents/skills"]) remove(path.join(root, base, name));
  }
}
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\\n");
process.stdout.write(args[2] + " complete\\n");
`;
}
