import { createHmac } from "node:crypto";

export const validTypeNote = "Hey, this is a valid type of key.";

export const lineCount = (value) =>
  value.length === 0 ? 0 : (value.match(/\r\n|\r|\n/g) ?? []).length + 1;

export const unquoteEnvValue = (value) => {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const quote = trimmed[0];
  return (quote === `"` || quote === `'`) && trimmed.at(-1) === quote
    ? trimmed.slice(1, -1)
    : trimmed;
};

export const createFingerprint = (key) => (value) =>
  createHmac("sha256", key).update(value).digest("hex").slice(0, 16);

const keyIncludes = (key, terms) => {
  const normalized = key.toUpperCase();
  return terms.some((term) => normalized.includes(term));
};

const isJwt = (value) => {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return false;
  }

  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return typeof header.alg === "string" && header.alg.length > 0;
  } catch {
    return false;
  }
};

const isCredentialUrl = (value) => {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.username && url.password);
  } catch {
    return false;
  }
};

const privateKeyHeader = (label = "") => ["-----BEGIN ", label, "PRIVATE KEY-----"].join("");
const privateKeyPattern = new RegExp(["-----BEGIN ", "[A-Z ]*", "PRIVATE KEY-----"].join(""));

const secretFormats = [
  ["OpenSSH private key", ({ value }) => value.includes(privateKeyHeader("OPENSSH "))],
  ["PEM private key", ({ value }) => privateKeyPattern.test(value)],
  ["Anthropic API key", ({ value }) => /^sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}$/.test(value)],
  ["OpenAI API key", ({ value }) => /^sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/.test(value)],
  ["AWS access key ID", ({ value }) => /^(?:AKIA|ASIA)[A-Z0-9]{16}$/.test(value)],
  [
    "AWS secret access key",
    ({ key, value }) =>
      keyIncludes(key, ["AWS_SECRET_ACCESS_KEY", "AWS_SECRET"]) &&
      /^[A-Za-z0-9/+=]{40}$/.test(value),
  ],
  [
    "GitHub token",
    ({ value }) => /^(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})$/.test(value),
  ],
  ["GitLab personal access token", ({ value }) => /^glpat-[A-Za-z0-9_-]{20,}$/.test(value)],
  [
    "Slack token",
    ({ value }) =>
      /^(?:xox[baprs]-[A-Za-z0-9-]{10,}|xapp-\d-[A-Z0-9-]+-\d+-[a-f0-9]+)$/.test(value),
  ],
  ["Stripe webhook secret", ({ value }) => /^whsec_[A-Za-z0-9]{10,}$/.test(value)],
  ["Stripe restricted key", ({ value }) => /^rk_(?:test|live)_[A-Za-z0-9]{10,}$/.test(value)],
  [
    "Stripe secret key",
    ({ key, value }) =>
      keyIncludes(key, ["STRIPE"]) && /^sk_(?:test|live)_[A-Za-z0-9]{10,}$/.test(value),
  ],
  [
    "Clerk secret key",
    ({ key, value }) =>
      keyIncludes(key, ["CLERK"]) && /^sk_(?:test|live)_[A-Za-z0-9]{10,}$/.test(value),
  ],
  ["test/live secret key", ({ value }) => /^sk_(?:test|live)_[A-Za-z0-9]{10,}$/.test(value)],
  ["Google API key", ({ value }) => /^AIza[0-9A-Za-z_-]{35}$/.test(value)],
  [
    "Google OAuth client ID",
    ({ value }) => /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(value),
  ],
  ["SendGrid API key", ({ value }) => /^SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.test(value)],
  ["Hugging Face token", ({ value }) => /^hf_[A-Za-z0-9]{20,}$/.test(value)],
  ["Linear API key", ({ value }) => /^lin_api_[A-Za-z0-9]{20,}$/.test(value)],
  ["npm access token", ({ value }) => /^npm_[A-Za-z0-9]{36}$/.test(value)],
  ["Twilio account SID", ({ value }) => /^AC[0-9a-fA-F]{32}$/.test(value)],
  [
    "Twilio auth token",
    ({ key, value }) => keyIncludes(key, ["TWILIO"]) && /^[0-9a-fA-F]{32}$/.test(value),
  ],
  [
    "Datadog API key",
    ({ key, value }) => keyIncludes(key, ["DATADOG", "DD_"]) && /^[0-9a-f]{32}$/i.test(value),
  ],
  [
    "Mailgun API key",
    ({ key, value }) => keyIncludes(key, ["MAILGUN"]) && /^key-[0-9a-f]{32}$/i.test(value),
  ],
  ["JWT", ({ value }) => isJwt(value)],
  ["credential URL", ({ value }) => isCredentialUrl(value)],
];

export const detectSecretFormat = (value, key = "") =>
  secretFormats.find(([, test]) => test({ key, value }))?.[0] ?? null;

export const classifySecret = (value) => {
  if (value.includes("\n")) return "multiline";
  if (/^[0-9a-f]+$/i.test(value) && value.length >= 16) return "hex-ish";
  if (/^[A-Za-z0-9_-]+={0,2}$/.test(value) && value.length >= 16) return "base64url-ish";
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length >= 16) return "base64-ish";
  if (/^[A-Za-z0-9_./+=:-]+$/.test(value)) return "token-ish";
  if (/^[\x20-\x7E]+$/.test(value)) return "ascii";
  return "unicode";
};

export const nearMatchSecret = (value, key = "") => {
  const length = Array.from(value).length;
  if (/^(?:AKIA|ASIA)/.test(value) && length !== 20) {
    return `looks like AWS access key ID but length is ${length}, expected 20`;
  }
  if (keyIncludes(key, ["AWS_SECRET"]) && /^[A-Za-z0-9/+=]+$/.test(value) && length !== 40) {
    return `looks like AWS secret access key but length is ${length}, expected 40`;
  }
  if (value.startsWith("AIza") && length !== 39) {
    return `looks like Google API key but length is ${length}, expected 39`;
  }
  if (value.startsWith("SG.") && value.split(".").length !== 3) {
    return "looks like SendGrid API key but expected 3 dot-separated parts";
  }
  if (/^sk_(?:test|live)_/.test(value) && length < 18) {
    return `looks like test/live secret key but length is ${length}, expected at least 18`;
  }
  if (value.startsWith("npm_") && length !== 40) {
    return `looks like npm access token but length is ${length}, expected 40`;
  }
  if (value.split(".").length === 3 && !isJwt(value)) {
    return "looks like JWT but header is not valid base64url JSON";
  }
  try {
    const url = new URL(value);
    if (url.protocol && (!url.username || !url.password)) {
      return "looks like URL but does not include both username and password";
    }
  } catch {
    return null;
  }
  return null;
};

export const analyzeSecret = (rawValue, { fingerprint, key = "", unquote = false } = {}) => {
  const value = unquote ? unquoteEnvValue(rawValue) : rawValue;
  if (value.length === 0) {
    return { empty: true, value };
  }

  const format = detectSecretFormat(value, key);
  return {
    bytes: Buffer.byteLength(value, "utf8"),
    chars: Array.from(value).length,
    class: format ? null : classifySecret(value),
    empty: false,
    fingerprint: fingerprint?.(value) ?? null,
    format,
    hint: format ? null : nearMatchSecret(value, key),
    lines: lineCount(value),
    note: format ? validTypeNote : null,
    value,
  };
};
