import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

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
