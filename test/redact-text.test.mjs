import assert from "node:assert/strict";
import { test } from "node:test";
import { createFingerprint } from "../skills/workflow-secret-redaction/scripts/lib/analyze.mjs";
import {
  renderTextSource,
  toPublicSource,
} from "../skills/workflow-secret-redaction/scripts/lib/render.mjs";
import { analyzeText } from "../skills/workflow-secret-redaction/scripts/lib/text.mjs";

const repeat = (value, count) => value.repeat(count);
const join = (...parts) => parts.join("");

const renderText = (input, options = {}) =>
  renderTextSource({ kind: "text", label: "stdin", text: analyzeText(input, options) });

const publicText = (input, options = {}) =>
  toPublicSource({ kind: "text", label: "stdin", text: analyzeText(input, options) });

const assertNoRaw = (output, values) => {
  for (const value of values) {
    assert.ok(!output.includes(value), `raw fixture value leaked, length=${value.length}`);
  }
};

const assertRedactionCount = (output, count) => {
  assert.equal(output.match(/<redacted /g)?.length ?? 0, count);
};

test("single text value still redacts as one whole secret", () => {
  const output = renderText("plain text secret");

  assert.equal(output, "<redacted bytes=17 chars=17 lines=1 class=ascii format=unrecognized>");
});

test("structured text preserves debug context while redacting sensitive values", () => {
  const bearer = join("ghp", "_", repeat("b", 24));
  const databaseUrl = join("postgres://user:", "dbpass", "@example.test/app");
  const openAi = join("sk", "-proj-", repeat("a", 24));
  const password = "hunter2";
  const input = [
    "2026-05-31T20:24:46.275Z INFO request_id=018f handler=debug.dump",
    `Authorization: Bearer ${bearer}`,
    [
      "payload={",
      `"message":"keep visible"`,
      `"apiKey":"${openAi}"`,
      `"password":"${password}"`,
      `"databaseUrl":"${databaseUrl}"`,
      "}",
    ].join(","),
    "done status=500 reason=tool timeout",
  ].join("\n");

  const output = renderText(input);

  assert.match(output, /INFO request_id=018f handler=debug\.dump/);
  assert.match(output, /"message":"keep visible"/);
  assert.match(output, /Authorization: Bearer <redacted bytes=\d+/);
  assert.match(output, /"apiKey":"<redacted bytes=\d+/);
  assert.match(output, /"password":"<redacted bytes=\d+/);
  assert.match(output, /"databaseUrl":"<redacted bytes=\d+/);
  assert.match(output, /done status=500 reason=tool timeout/);
  assertRedactionCount(output, 4);
  assertNoRaw(output, [bearer, databaseUrl, openAi, password]);
});

test("escaped structured text redacts short and long sensitive values", () => {
  const password = "hunter2";
  const refreshToken = join("refresh", "_", repeat("c", 36));
  const input = String.raw`debug payload="{\"event\":\"tool_error\",\"refresh_token\":\"${refreshToken}\",\"password\":\"${password}\",\"safe\":\"visible\"}"`;

  const output = renderText(input);

  assert.match(output, /tool_error/);
  assert.match(output, /\\"safe\\":\\"visible\\"/);
  assert.match(output, /\\"refresh_token\\":\\"<redacted bytes=\d+/);
  assert.match(output, /\\"password\\":\\"<redacted bytes=\d+/);
  assertRedactionCount(output, 2);
  assertNoRaw(output, [password, refreshToken]);
});

test("auth headers, credential urls, and known embedded token shapes are redacted", () => {
  const basic = Buffer.from("user:password").toString("base64");
  const credentialUrl = "postgres://user:pass@example.test/db";
  const jwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: "123" })).toString("base64url"),
    "signature",
  ].join(".");
  const privateKey = join("-----BEGIN PRIVATE KEY-----", "body", "-----END PRIVATE KEY-----");
  const input = [
    `Authorization: Basic ${basic}`,
    `url=${credentialUrl}`,
    `jwt=${jwt}`,
    privateKey,
  ].join("\n");

  const output = renderText(input);

  assert.match(output, /Authorization: Basic <redacted bytes=\d+/);
  assert.match(output, /url=<redacted bytes=\d+/);
  assert.match(output, /jwt=<redacted bytes=\d+/);
  assert.match(output, /<redacted bytes=\d+ chars=\d+ lines=1 format=PEM_private_key/);
  assertRedactionCount(output, 4);
  assertNoRaw(output, [basic, credentialUrl, jwt, privateKey]);
});

test("non-secret structured values stay visible to avoid over-redaction", () => {
  const traceId = repeat("a", 40);
  const opaqueId = repeat("A", 40);
  const input = [
    "author=isaac",
    "sessionId=018f3ad2-793d-7000-8000-123456789abc",
    "SessionStart=created",
    "authorization=Bearer",
    "retry_count=3",
    "enabled=true",
    "token=null",
    `trace=${traceId}`,
    `opaque=${opaqueId}`,
    "safe=value",
  ].join("\n");

  const output = renderText(input);

  assert.equal(output, input);
});

test("generic opaque values are redacted when attached to sensitive keys", () => {
  const secret = repeat("A", 40);
  const hexSecret = repeat("a", 40);
  const input = [`apiKey=${secret}`, `token=${hexSecret}`, `sessionToken=${secret}`].join("\n");
  const output = renderText(input);

  assert.match(output, /apiKey=<redacted bytes=\d+/);
  assert.match(output, /token=<redacted bytes=\d+/);
  assert.match(output, /sessionToken=<redacted bytes=\d+/);
  assertRedactionCount(output, 3);
  assertNoRaw(output, [secret, hexSecret]);
});

test("object-shaped text stays readable and leaves empty secrets and safe urls alone", () => {
  const secret = "hunter2";
  const input = [
    "{",
    '"password": ""',
    '"token": null',
    '"callbackUrl": "https://example.test/callback"',
    `"clientSecret": "${secret}"`,
    "}",
  ].join("\n");

  const output = renderText(input);

  assert.match(output, /"password": ""/);
  assert.match(output, /"token": null/);
  assert.match(output, /"callbackUrl": "https:\/\/example\.test\/callback"/);
  assert.match(output, /"clientSecret": "<redacted bytes=\d+/);
  assertRedactionCount(output, 1);
  assertNoRaw(output, [secret]);
});

test("redactions after escaped backslashes keep JSON parseable", () => {
  const token = join("sk", "-proj-", repeat("a", 24));
  const input = `{"message":"escaped slash \\/${token}"}`;
  const output = renderText(input);

  assert.doesNotThrow(() => JSON.parse(output));
  assert.match(output, /escaped slash \\\/<redacted bytes=\d+/);
  assertNoRaw(output, [token]);
});

test("overlapping sensitive matches render once and can carry fingerprints", () => {
  const token = join("sk", "-proj-", repeat("a", 24));
  const fingerprint = createFingerprint(Buffer.from("test-key"));
  const output = renderText(`apiKey="${token}" repeated=${token}`, { fingerprint });
  const fingerprints = output.match(/fp=([a-f0-9]{16})/g) ?? [];

  assertRedactionCount(output, 2);
  assert.equal(new Set(fingerprints).size, 1);
  assertNoRaw(output, [token]);
});

test("structured JSON output exposes redacted text, metadata, and stats", () => {
  const token = join("ghp", "_", repeat("a", 24));
  const input = ["event=debug", `token=${token}`].join("\n");
  const source = publicText(input);

  assert.equal(source.kind, "text");
  assert.equal(source.label, "stdin");
  assert.match(source.redacted, /event=debug/);
  assert.match(source.redacted, /token=<redacted bytes=\d+/);
  assert.equal(source.redactions.length, 1);
  assert.equal(source.stats.lines, 2);
  assertNoRaw(JSON.stringify(source), [token]);
});
