import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { decryptLinearApiKeyBlob } from "../skills/ziw-orchestrate/scripts/linear-graphql.mjs";

const script = path.resolve("skills/ziw-orchestrate/scripts/linear-graphql.mjs");
const oldCredential = "synthetic-old-credential";
const newCredential = "synthetic-replacement-credential";

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-credential-setup-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bootstrap = path.join(dir, "darwin.mjs");
  writeFileSync(
    bootstrap,
    `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
Object.defineProperty(process, "platform", { value: "darwin" });
if (process.env.FAKE_RENAME_FAIL) {
  fs.renameSync = () => { throw new Error("synthetic atomic rename failure"); };
  syncBuiltinESMExports();
}
`,
  );
  writeFileSync(
    path.join(dir, "security"),
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_SECURITY_ARGS, JSON.stringify(args) + "\\n");
const account = args[args.indexOf("-a") + 1];
const db = fs.existsSync(process.env.FAKE_KEYCHAIN) ? JSON.parse(fs.readFileSync(process.env.FAKE_KEYCHAIN, "utf8")) : {};
if (args[0] === "find-generic-password") {
  if (!db[account]) process.exit(1);
  process.stdout.write(db[account] + "\\n");
} else {
  const input = fs.readFileSync(0, "utf8");
  const key = input.split("\\n")[0];
  if (process.env.FAKE_SECURITY_FAIL !== "before") {
    db[account] = key;
    fs.writeFileSync(process.env.FAKE_KEYCHAIN, JSON.stringify(db));
  }
  if (process.env.FAKE_SECURITY_FAIL) {
    process.stderr.write("synthetic failure containing " + input);
    process.exit(1);
  }
}
`,
    { mode: 0o755 },
  );
  const storePath = path.join(dir, "store", "linear.json");
  const env = {
    ...process.env,
    FAKE_KEYCHAIN: path.join(dir, "keychain.json"),
    FAKE_SECURITY_ARGS: path.join(dir, "args.jsonl"),
    PATH: `${dir}${path.delimiter}${process.env.PATH}`,
  };
  const args = ["--import", bootstrap, script, "setup", "--store", storePath];
  const run = (input, overrides = {}) =>
    spawnSync(process.execPath, args, {
      input,
      encoding: "utf8",
      env: { ...env, ...overrides },
      timeout: 10_000,
    });
  const readStore = () => {
    const blob = JSON.parse(readFileSync(storePath, "utf8"));
    const db = JSON.parse(readFileSync(env.FAKE_KEYCHAIN, "utf8"));
    return decryptLinearApiKeyBlob(blob, Buffer.from(db[blob.keychainAccount], "base64"));
  };
  const assertKeychainRead = (expected) => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        bootstrap,
        "--input-type=module",
        "--eval",
        `const { readStoredLinearApiKey } = await import(${JSON.stringify(pathToFileURL(script).href)}); const value = readStoredLinearApiKey({ env: {}, storePath: ${JSON.stringify(storePath)} }); process.stdout.write(String(value === ${JSON.stringify(expected)}));`,
      ],
      { encoding: "utf8", env, timeout: 5_000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "true");
  };
  return { dir, args, env, storePath, run, readStore, assertKeychainRead };
}

test("Linux setup rejects before reading stdin or altering an existing store", (t) => {
  const f = fixture(t);
  const storePath = path.join(f.dir, "existing.json");
  writeFileSync(storePath, "old-store");
  const bootstrap = path.join(f.dir, "linux.mjs");
  writeFileSync(bootstrap, 'Object.defineProperty(process, "platform", { value: "linux" });');
  const result = spawnSync(
    process.execPath,
    ["--import", bootstrap, script, "setup", "--store", storePath],
    {
      input: newCredential,
      encoding: "utf8",
      timeout: 5_000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /macOS-only/);
  assert.equal(readFileSync(storePath, "utf8"), "old-store");
  assert.equal(existsSync(f.env.FAKE_SECURITY_ARGS), false);
  assert.equal(existsSync(path.dirname(f.storePath)), false);
  assert.doesNotMatch(result.stderr, /synthetic-replacement-credential/);
});

test("piped setup and replacement keep prior Keychain pairs usable", (t) => {
  const f = fixture(t);
  const first = f.run(`${oldCredential}\n`);
  assert.equal(first.status, 0, first.stderr);
  chmodSync(path.dirname(f.storePath), 0o755);
  const oldBlob = JSON.parse(readFileSync(f.storePath, "utf8"));
  const second = f.run(`${newCredential}\n`);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(f.readStore(), newCredential);
  f.assertKeychainRead(newCredential);
  const blob = JSON.parse(readFileSync(f.storePath, "utf8"));
  const db = JSON.parse(readFileSync(f.env.FAKE_KEYCHAIN, "utf8"));
  assert.notEqual(blob.keychainAccount, oldBlob.keychainAccount);
  assert.equal(
    decryptLinearApiKeyBlob(oldBlob, Buffer.from(db[oldBlob.keychainAccount], "base64")),
    oldCredential,
  );
  assert.equal(statSync(f.storePath).mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(f.storePath)).mode & 0o777, 0o700);
  const transcript = first.stdout + first.stderr + second.stdout + second.stderr;
  assert.equal(transcript.includes(oldCredential), false);
  assert.equal(transcript.includes(newCredential), false);
  const argv = readFileSync(f.env.FAKE_SECURITY_ARGS, "utf8");
  for (const key of Object.values(db)) assert.equal(argv.includes(key), false);
});

test("legacy unversioned account stores remain readable and safe to replace", (t) => {
  const f = fixture(t);
  assert.equal(f.run(oldCredential).status, 0);
  const blob = JSON.parse(readFileSync(f.storePath, "utf8"));
  const db = JSON.parse(readFileSync(f.env.FAKE_KEYCHAIN, "utf8"));
  db["linear-api-key"] = db[blob.keychainAccount];
  delete blob.keychainAccount;
  delete blob.keychainService;
  writeFileSync(f.storePath, JSON.stringify(blob));
  writeFileSync(f.env.FAKE_KEYCHAIN, JSON.stringify(db));
  f.assertKeychainRead(oldCredential);
  const failed = f.run(newCredential, { FAKE_RENAME_FAIL: "1" });
  assert.equal(failed.status, 1);
  f.assertKeychainRead(oldCredential);
  assert.equal(f.run(newCredential).status, 0);
  f.assertKeychainRead(newCredential);
});

for (const failure of ["before", "after", "rename"]) {
  test(`replacement preserves the usable old store when ${failure} fails`, (t) => {
    const f = fixture(t);
    assert.equal(f.run(oldCredential).status, 0);
    const original = readFileSync(f.storePath, "utf8");
    const result = f.run(newCredential, {
      ...(failure === "rename" ? { FAKE_RENAME_FAIL: "1" } : { FAKE_SECURITY_FAIL: failure }),
    });
    assert.equal(result.status, 1);
    assert.equal(readFileSync(f.storePath, "utf8"), original);
    assert.equal(f.readStore(), oldCredential);
    assert.equal((result.stdout + result.stderr).includes(newCredential), false);
    for (const key of Object.values(JSON.parse(readFileSync(f.env.FAKE_KEYCHAIN, "utf8")))) {
      assert.equal((result.stdout + result.stderr).includes(key), false);
    }
  });
}

const ptyDriver = `import json, os, pty, select, signal, subprocess, sys, termios, time
command = json.loads(sys.argv[1])
action = sys.argv[2]
secret = "synthetic-terminal-credential"
master, slave = pty.openpty()
before = termios.tcgetattr(slave)
child = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave)
transcript = b""
deadline = time.monotonic() + 8
sent = False
while time.monotonic() < deadline:
    readable, _, _ = select.select([master], [], [], 0.05)
    if readable:
        transcript += os.read(master, 8192)
    if not sent and b"Linear API key: " in transcript:
        if action == "interrupt":
            os.kill(child.pid, signal.SIGINT)
        elif action == "suspend":
            os.kill(child.pid, signal.SIGTSTP)
        elif action == "eof":
            os.write(master, b"\\x04")
        elif action == "partial-eof":
            os.write(master, secret.encode() + b"\\x04\\x04")
        else:
            os.write(master, (secret + "\\n").encode())
        sent = True
    if child.poll() is not None:
        while select.select([master], [], [], 0)[0]:
            transcript += os.read(master, 8192)
        break
else:
    child.kill()
    child.wait()
after = termios.tcgetattr(slave)
print(json.dumps({"status": child.returncode, "secretVisible": secret.encode() in transcript, "prompt": b"Linear API key: " in transcript, "restored": before == after, "failedClosed": b"no credential was read" in transcript}))
os.close(master)
os.close(slave)
`;

for (const action of ["submit", "interrupt", "suspend", "eof", "partial-eof", "echo-failure"]) {
  test(`interactive setup hides input and restores terminal state for ${action}`, (t) => {
    const f = fixture(t);
    if (action === "echo-failure") {
      writeFileSync(path.join(f.dir, "stty"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    }
    const result = spawnSync(
      "python3",
      ["-c", ptyDriver, JSON.stringify([process.execPath, ...f.args]), action],
      {
        encoding: "utf8",
        env: f.env,
        timeout: 12_000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(result.stdout);
    assert.equal(observed.secretVisible, false);
    assert.equal(observed.restored, true);
    assert.equal(observed.status, action === "submit" ? 0 : 1);
    if (action === "submit") assert.equal(f.readStore(), "synthetic-terminal-credential");
    else assert.equal(existsSync(f.storePath), false);
    if (action === "echo-failure") {
      assert.equal(observed.prompt, false);
      assert.equal(observed.failedClosed, true);
    }
  });
}
