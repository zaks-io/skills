import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve("skills/ziw-orchestrate/scripts/planner-state.mjs");
const repo = "example/app";
for (const first of ["migrate", "record"])
  test(
    `${first} holds the same exclusive lock against the other process`,
    { timeout: 10000 },
    async (t) => {
      const directory = mkdtempSync(path.join(tmpdir(), "ziw-migration-lock-"));
      const file = path.join(directory, "state.json");
      const preload = path.join(directory, "pause-publication.mjs");
      const observation = path.join(directory, "observation.json");
      const bytes = JSON.stringify({ ...(first === "record" ? { v: 3 } : {}), repo });
      writeFileSync(file, bytes);
      writeFileSync(observation, JSON.stringify({ scopeIssues: [{ issueKey: "EXA-1" }] }));
      writeFileSync(
        preload,
        `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const rename = fs.renameSync;
fs.renameSync = (...args) => {
  process.stdout.write("publication locked\\n");
  fs.readSync(0, Buffer.alloc(1), 0, 1, null);
  return rename(...args);
};
syncBuiltinESMExports();`,
      );
      const args = (command) => [
        script,
        command,
        ...(command === "record" ? [observation] : []),
        "--repo",
        repo,
        "--state",
        file,
      ];
      const child = spawn(process.execPath, ["--import", preload, ...args(first)]);
      t.after(() => {
        if (child.exitCode === null) child.kill();
        rmSync(directory, { recursive: true, force: true });
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      const closed = once(child, "close");
      const [message] = await once(child.stdout, "data");
      assert.match(String(message), /publication locked/);
      const other = first === "migrate" ? "record" : "migrate";
      const blocked = spawnSync(process.execPath, args(other), { encoding: "utf8" });
      assert.equal(blocked.status, 1);
      assert.match(blocked.stderr, /cannot lock state/);
      assert.equal(readFileSync(file, "utf8"), bytes);
      child.stdin.end("x");
      const [status] = await closed;
      assert.equal(status, 0, stderr);
      const retry = spawnSync(process.execPath, args(other), { encoding: "utf8" });
      assert.equal(retry.status, 0, retry.stderr);
      assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).scopeIssues, [{ issueKey: "EXA-1" }]);
    },
  );
