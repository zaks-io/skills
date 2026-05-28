import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "skills/workflow-secret-redaction/scripts/redact-secrets.mjs");
const note = 'note="Hey, this is a valid type of key."';

const run = (args, { env = {}, input = "" } = {}) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code, stderr, stdout });
    });
    child.stdin.end(input);
  });

const runOk = async (args, options) => {
  const result = await run(args, options);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  return result.stdout;
};

const withTempFiles = async (files, callback) => {
  const dir = await mkdtemp(path.join(tmpdir(), "redact-secrets-"));
  try {
    const paths = [];
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(dir, name);
      await writeFile(file, content);
      paths.push(file);
    }
    return await callback(paths);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
};

const assertNoRaw = (stdout, values) => {
  for (const value of values) {
    assert.ok(!stdout.includes(value), `raw fixture value leaked, length=${value.length}`);
  }
};

const expectFormat = (stdout, format) => {
  assert.match(stdout, new RegExp(`format="${format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(stdout, new RegExp(note.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
};

const fp = (line) => line.match(/fp=([a-f0-9]{16})/)?.[1];
const repeat = (value, count) => value.repeat(count);
const join = (...parts) => parts.join("");
const privateKeyHeader = (label = "") => join("-----BEGIN ", label, "PRIVATE KEY-----");
const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: "123" })).toString("base64url"),
  "signature",
].join(".");

test("redacts env files without leaking values", async () => {
  const apiValue = "alpha-secret";
  const spacedValue = "quoted-secret";
  const unparsedValue = "not an env line with secret material";
  const input = [
    `API_KEY=${apiValue}`,
    "EMPTY=",
    "# comment with hidden material",
    `export SPACED = "${spacedValue}"`,
    unparsedValue,
    "",
  ].join("\n");

  const stdout = await withTempFiles({ ".env": input }, ([file]) =>
    runOk(["--no-fingerprint", file]),
  );

  assert.match(
    stdout,
    /^API_KEY=<redacted bytes=12 chars=12 lines=1 class=token-ish format=unrecognized>/m,
  );
  assert.match(stdout, /^EMPTY=<empty>$/m);
  assert.match(stdout, /^# <comment redacted>$/m);
  assert.match(
    stdout,
    /^export SPACED = <redacted bytes=13 chars=13 lines=1 class=token-ish format=unrecognized>/m,
  );
  assert.match(
    stdout,
    /^<unparsed-line redacted bytes=36 chars=36 lines=1 class=ascii format=unrecognized>$/m,
  );
  assertNoRaw(stdout, [apiValue, spacedValue, unparsedValue, "hidden material"]);
});

test("redacts stdin text with length hints", async () => {
  const raw = "plain text secret";
  const stdout = await runOk(["--stdin", "--mode", "text", "--no-fingerprint"], { input: raw });

  assert.equal(stdout, "<redacted bytes=17 chars=17 lines=1 class=ascii format=unrecognized>\n");
  assertNoRaw(stdout, [raw]);
});

test("hides key names when requested", async () => {
  const raw = "abc123";
  const stdout = await runOk(["--stdin", "--hide-keys", "--no-fingerprint"], {
    input: `DATABASE_PASSWORD=${raw}`,
  });

  assert.match(
    stdout,
    /^KEY_1=<redacted bytes=6 chars=6 lines=1 class=token-ish format=unrecognized>$/m,
  );
  assert.doesNotMatch(stdout, /DATABASE_PASSWORD/);
  assertNoRaw(stdout, [raw]);
});

test("labels multiple sources and matches fingerprints within a run", async () => {
  const shared = "same-secret";
  const stdout = await withTempFiles(
    { "a.env": `A=${shared}\n`, "b.env": `B=${shared}\n` },
    (files) => runOk(files),
  );

  assert.match(stdout, /# source: .*a\.env/);
  assert.match(stdout, /# source: .*b\.env/);

  const redactedLines = stdout.split("\n").filter((line) => /^[AB]=/.test(line));
  assert.equal(redactedLines.length, 2);
  assert.equal(fp(redactedLines[0]), fp(redactedLines[1]));
  assertNoRaw(stdout, [shared]);
});

test("normalizes quoted env values before fingerprinting", async () => {
  const raw = join("sk", "_test_", repeat("a", 12));
  const stdout = await withTempFiles(
    { "quoted.env": `A="${raw}"\n`, "plain.env": `B=${raw}\n` },
    (files) => runOk(files),
  );

  const redactedLines = stdout.split("\n").filter((line) => /^[AB]=/.test(line));
  assert.equal(redactedLines.length, 2);
  assert.equal(fp(redactedLines[0]), fp(redactedLines[1]));
  expectFormat(stdout, "test/live secret key");
  assertNoRaw(stdout, [raw]);
});

test("can produce stable local fingerprints with an env-provided HMAC key", async () => {
  const raw = "repeatable-secret";
  const env = { REDACT_HMAC_KEY: "local-test-key" };
  const first = await runOk(
    ["--stdin", "--mode", "text", "--fingerprint-key-env", "REDACT_HMAC_KEY"],
    {
      env,
      input: raw,
    },
  );
  const second = await runOk(
    ["--stdin", "--mode", "text", "--fingerprint-key-env", "REDACT_HMAC_KEY"],
    { env, input: raw },
  );

  assert.equal(fp(first), fp(second));
  assertNoRaw(first + second, [raw]);
});

test("omits fingerprints when requested", async () => {
  const raw = "no-fingerprint";
  const stdout = await runOk(["--stdin", "--mode", "text", "--no-fingerprint"], { input: raw });

  assert.doesNotMatch(stdout, /fp=/);
  assertNoRaw(stdout, [raw]);
});

test("reports invalid invocations without reading secrets", async () => {
  const invalidMode = await run(["--mode", "json", "--stdin"]);
  assert.equal(invalidMode.code, 2);
  assert.match(invalidMode.stderr, /--mode must be env or text/);

  const missingKey = await run(["--stdin", "--fingerprint-key-env", "MISSING_REDACT_KEY"], {
    input: "value",
  });
  assert.equal(missingKey.code, 2);
  assert.match(missingKey.stderr, /Environment variable MISSING_REDACT_KEY is not set/);

  const missingFile = await run(["does-not-exist.env"]);
  assert.equal(missingFile.code, 1);
  assert.match(missingFile.stderr, /Cannot read does-not-exist\.env/);
});

test("checks expected keys without exposing values", async () => {
  const alpha = "first-secret";
  const beta = "second-secret";
  const stdout = await runOk(["--stdin", "--expect", "API_KEY,EMPTY,MISSING"], {
    input: [`API_KEY=${alpha}`, `API_KEY=${beta}`, "EMPTY="].join("\n"),
  });

  assert.match(stdout, /^CHECK API_KEY duplicate count=2 empty=0/m);
  assert.match(stdout, /^CHECK EMPTY empty count=1 empty=1/m);
  assert.match(stdout, /^CHECK MISSING missing count=0 empty=0/m);
  assertNoRaw(stdout, [alpha, beta]);
});

test("schema and strict mode report mismatches, empty values, and parse failures", async () => {
  const openAi = join("sk", "-proj-", repeat("a", 24));
  const stripe = "wrong-shape";
  const junk = "not an env line";
  const result = await withTempFiles(
    {
      ".env": [`OPENAI_API_KEY=${openAi}`, `STRIPE_SECRET_KEY=${stripe}`, "EMPTY=", junk].join(
        "\n",
      ),
      "schema.txt": ["OPENAI_API_KEY=OpenAI API key", "STRIPE_SECRET_KEY=Stripe secret key"].join(
        "\n",
      ),
    },
    ([envFile, schemaFile]) =>
      run(["--schema", schemaFile, "--expect", "EMPTY", "--strict", envFile]),
  );

  assert.equal(result.code, 1);
  assert.match(result.stdout, /^CHECK OPENAI_API_KEY present count=1 empty=0/m);
  assert.match(result.stdout, /^CHECK STRIPE_SECRET_KEY format_mismatch count=1 empty=0/m);
  assert.match(result.stdout, /^CHECK EMPTY empty count=1 empty=1/m);
  assert.match(result.stdout, /^FAIL STRIPE_SECRET_KEY:format_mismatch$/m);
  assert.match(result.stdout, /^FAIL EMPTY:empty$/m);
  assert.match(result.stdout, /:unparsed$/m);
  assertNoRaw(result.stdout, [openAi, stripe, junk]);
});

test("emits machine-readable redacted JSON", async () => {
  const raw = "json-secret";
  const stdout = await runOk(["--stdin", "--json", "--expect", "API_KEY"], {
    input: `API_KEY=${raw}`,
  });
  const payload = JSON.parse(stdout);

  assert.equal(payload.ok, true);
  assert.equal(payload.sources[0].entries[0].key, "API_KEY");
  assert.equal(payload.sources[0].entries[0].analysis.empty, false);
  assert.equal(payload.sources[0].entries[0].analysis.format, "unrecognized");
  assert.equal(payload.checks[0].status, "present");
  assertNoRaw(stdout, [raw]);
});

test("diff compares env files by key without exposing values", async () => {
  const same = "same-secret";
  const oldValue = "old-secret";
  const newValue = "new-secret";
  const formatValue = join("sk", "_test_", repeat("a", 12));
  const stdout = await withTempFiles(
    {
      "old.env": [
        `SAME=${same}`,
        `CHANGED=${oldValue}`,
        "ONLY_LEFT=left-secret",
        "EMPTY=",
        `FORMAT=${formatValue}`,
      ].join("\n"),
      "new.env": [
        `SAME=${same}`,
        `CHANGED=${newValue}`,
        "ONLY_RIGHT=right-secret",
        "EMPTY=filled",
        "FORMAT=plain-secret",
      ].join("\n"),
    },
    ([oldFile, newFile]) => runOk(["--diff", oldFile, newFile]),
  );

  assert.match(stdout, /^SAME same .* left_fp=([a-f0-9]{16}) right_fp=\1$/m);
  assert.match(stdout, /^CHANGED changed /m);
  assert.match(stdout, /^ONLY_LEFT missing /m);
  assert.match(stdout, /^ONLY_RIGHT added /m);
  assert.match(stdout, /^EMPTY empty /m);
  assert.match(stdout, /^FORMAT format_changed /m);
  assertNoRaw(stdout, [same, oldValue, newValue, formatValue, "left-secret", "right-secret"]);
});

test("diff hides key names when requested", async () => {
  const stdout = await withTempFiles(
    {
      "old.env": "DATABASE_PASSWORD=old",
      "new.env": "DATABASE_PASSWORD=new",
    },
    ([oldFile, newFile]) => runOk(["--diff", oldFile, newFile, "--hide-keys"]),
  );

  assert.match(stdout, /^KEY_1 changed /m);
  assert.doesNotMatch(stdout, /DATABASE_PASSWORD/);
});

test("adds class hints and near-match reasons for unrecognized values", async () => {
  const almostAwsSecret = repeat("a", 38);
  const stdout = await runOk(["--stdin", "--no-fingerprint"], {
    input: `AWS_SECRET_ACCESS_KEY=${almostAwsSecret}`,
  });

  assert.match(stdout, /class=hex-ish format=unrecognized/);
  assert.match(stdout, /hint="looks like AWS secret access key but length is 38, expected 40"/);
  assertNoRaw(stdout, [almostAwsSecret]);
});

test("detects every supported credential shape", async (t) => {
  const samples = [
    ["OpenSSH private key", "OPENSSH_KEY", join(privateKeyHeader("OPENSSH "), "body")],
    ["PEM private key", "PRIVATE_KEY", join(privateKeyHeader(), "body")],
    ["OpenAI API key", "OPENAI_API_KEY", join("sk", "-proj-", repeat("a", 24))],
    ["Anthropic API key", "ANTHROPIC_API_KEY", join("sk", "-ant-api03-", repeat("a", 24))],
    ["AWS access key ID", "AWS_ACCESS_KEY_ID", join("AKIA", repeat("A", 16))],
    ["AWS secret access key", "AWS_SECRET_ACCESS_KEY", repeat("a", 40)],
    ["GitHub token", "GITHUB_TOKEN", join("ghp", "_", repeat("a", 24))],
    ["GitLab personal access token", "GITLAB_TOKEN", join("glpat", "-", repeat("a", 24))],
    ["Slack token", "SLACK_BOT_TOKEN", join("xoxb", "-", repeat("1", 12), "-", repeat("a", 12))],
    ["Stripe webhook secret", "STRIPE_WEBHOOK_SECRET", join("whsec", "_", repeat("a", 12))],
    ["Stripe restricted key", "STRIPE_RESTRICTED_KEY", join("rk", "_test_", repeat("a", 12))],
    ["Stripe secret key", "STRIPE_SECRET_KEY", join("sk", "_test_", repeat("a", 12))],
    ["Clerk secret key", "CLERK_SECRET_KEY", join("sk", "_live_", repeat("a", 12))],
    ["test/live secret key", "GENERIC_SECRET_KEY", join("sk", "_live_", repeat("a", 12))],
    ["Google API key", "GOOGLE_API_KEY", join("AIza", repeat("a", 35))],
    [
      "Google OAuth client ID",
      "GOOGLE_CLIENT_ID",
      join("1234567890", "-", repeat("a", 20), ".apps.googleusercontent.com"),
    ],
    [
      "SendGrid API key",
      "SENDGRID_API_KEY",
      join("SG", ".", repeat("a", 22), ".", repeat("b", 43)),
    ],
    ["Hugging Face token", "HF_TOKEN", join("hf", "_", repeat("a", 20))],
    ["Linear API key", "LINEAR_API_KEY", join("lin", "_api_", repeat("a", 20))],
    ["npm access token", "NPM_TOKEN", join("npm", "_", repeat("a", 36))],
    ["Twilio account SID", "TWILIO_ACCOUNT_SID", join("AC", repeat("a", 32))],
    ["Twilio auth token", "TWILIO_AUTH_TOKEN", repeat("a", 32)],
    ["Datadog API key", "DD_API_KEY", repeat("b", 32)],
    ["Mailgun API key", "MAILGUN_API_KEY", join("key", "-", repeat("a", 32))],
    ["JWT", "JWT_TOKEN", jwt],
    [
      "credential URL",
      "DATABASE_URL",
      join("postgres://", "user", ":", "pass", "@example.test/db"),
    ],
  ];

  for (const [format, key, value] of samples) {
    await t.test(format, async () => {
      const stdout = await runOk(["--stdin", "--no-fingerprint"], { input: `${key}=${value}` });

      expectFormat(stdout, format);
      assert.match(stdout, /bytes=\d+ chars=\d+ lines=1/);
      assertNoRaw(stdout, [value]);
    });
  }
});
