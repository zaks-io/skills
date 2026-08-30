import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createCipheriv } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  decryptLinearApiKeyBlob,
  encryptLinearApiKey,
  linearGraphqlRequest,
  readStoredLinearApiKey,
} from "../skills/ziw-orchestrate/scripts/linear-graphql.mjs";

test("Linear credential encryption round trips without plaintext in the store blob", () => {
  const apiKey = "lin_api_secret_for_tests";
  const key = Buffer.alloc(32, 7);
  const iv = Buffer.alloc(12, 3);
  const { blob } = encryptLinearApiKey(apiKey, { key, iv });

  assert.equal(decryptLinearApiKeyBlob(blob, key), apiKey);
  assert.doesNotMatch(JSON.stringify(blob), /lin_api_secret_for_tests/);
});

test("Linear credential decryption rejects valid nonstandard GCM authentication tags", () => {
  const key = Buffer.alloc(32, 7);
  const iv = Buffer.alloc(12, 3);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 12 });
  const ciphertext = Buffer.concat([cipher.update("lin_api_short_tag", "utf8"), cipher.final()]);
  const blob = {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };

  assert.throws(
    () => decryptLinearApiKeyBlob(blob, key),
    /encrypted Linear credential auth tag must be 16 bytes/,
  );
});

test("Keychain decrypt key is passed through stdin instead of process arguments", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-keychain-"));
  const fakeSecurity = path.join(dir, "security");
  const argsPath = path.join(dir, "args");
  const stdinPath = path.join(dir, "stdin");
  const key = Buffer.alloc(32, 11);
  const encodedKey = key.toString("base64");
  const moduleUrl = pathToFileURL(
    path.resolve("skills/ziw-orchestrate/scripts/linear-graphql.mjs"),
  ).href;

  writeFileSync(
    fakeSecurity,
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$FAKE_SECURITY_ARGS"\nIFS= read -r first\nIFS= read -r second\nprintf "%s\\n%s" "$first" "$second" > "$FAKE_SECURITY_STDIN"\n',
  );
  chmodSync(fakeSecurity, 0o755);

  try {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `Object.defineProperty(process, "platform", { value: "darwin" }); const { storeDecryptKeyInKeychain } = await import(${JSON.stringify(moduleUrl)}); storeDecryptKeyInKeychain(Buffer.from(${JSON.stringify(encodedKey)}, "base64"), { service: "test-service", account: "test-account" });`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          FAKE_SECURITY_ARGS: argsPath,
          FAKE_SECURITY_STDIN: stdinPath,
          PATH: `${dir}${path.delimiter}${process.env.PATH}`,
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(argsPath, "utf8").trim().split("\n"), [
      "add-generic-password",
      "-s",
      "test-service",
      "-a",
      "test-account",
      "-U",
      "-w",
    ]);
    assert.equal(readFileSync(argsPath, "utf8").includes(encodedKey), false);
    assert.equal(readFileSync(stdinPath, "utf8"), `${encodedKey}\n${encodedKey}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stored Linear credential can be decrypted with injected key material", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ziw-linear-"));
  const storePath = path.join(dir, "linear.json");
  const key = Buffer.alloc(32, 9);
  const { blob } = encryptLinearApiKey("lin_api_stored_for_tests", {
    key,
    iv: Buffer.alloc(12, 4),
  });
  writeFileSync(storePath, JSON.stringify(blob), "utf8");

  const apiKey = readStoredLinearApiKey({
    env: {},
    storePath,
    decryptKey: key,
  });

  assert.equal(apiKey, "lin_api_stored_for_tests");
});

test("Linear GraphQL request injects authorization without exposing auth in body", async () => {
  let observed;
  const body = await linearGraphqlRequest({
    apiKey: "lin_api_request_for_tests",
    query: "query Viewer { viewer { id } }",
    variables: { team: "SKI" },
    fetchImpl: async (url, init) => {
      observed = { url, init };
      return {
        ok: true,
        json: async () => ({ data: { viewer: { id: "viewer-id" } } }),
      };
    },
  });

  assert.equal(observed.init.headers.Authorization, "lin_api_request_for_tests");
  assert.equal(JSON.parse(observed.init.body).variables.team, "SKI");
  assert.doesNotMatch(observed.init.body, /lin_api_request_for_tests/);
  assert.deepEqual(body.data.viewer, { id: "viewer-id" });
});
