import { analyzeSecret, detectSecretFormat, lineCount, unquoteEnvValue } from "./analyze.mjs";

const sensitiveKeyParts = new Set([
  "authorization",
  "bearer",
  "cookie",
  "credential",
  "dsn",
  "jwt",
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
]);

const sensitiveCompactKeys = new Set([
  "accesskey",
  "apikey",
  "auth",
  "authtoken",
  "clientsecret",
  "databaseurl",
  "idtoken",
  "privatekey",
  "refreshtoken",
  "sessioncookie",
  "sessiontoken",
  "signingsecret",
  "webhooksecret",
]);

const nonSecretLiterals = new Set(["basic", "bearer", "false", "null", "true", "undefined"]);

const tokenPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-ant-api\d{2}-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bxapp-\d-[A-Z0-9-]+-\d+-[a-f0-9]+\b/g,
  /\bwhsec_[A-Za-z0-9]{10,}\b/g,
  /\brk_(?:test|live)_[A-Za-z0-9]{10,}\b/g,
  /\bsk_(?:test|live)_[A-Za-z0-9]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
  /\bhf_[A-Za-z0-9]{20,}\b/g,
  /\blin_api_[A-Za-z0-9]{20,}\b/g,
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  /\bAC[0-9a-fA-F]{32}\b/g,
  /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
];

const keyValuePatterns = [
  /(?<key>["']?[A-Za-z_][A-Za-z0-9_.-]*["']?)(?<separator>\s*[:=]\s*)(?<quote>["'])(?<value>(?:\\.|(?!\k<quote>)[^\\])*)(?<endQuote>\k<quote>)/g,
  /(?<key>\\["'][A-Za-z_][A-Za-z0-9_.-]*\\["'])(?<separator>\s*:\s*)\\["'](?<value>(?:\\\\.|(?!\\["']).)*)(?<endQuote>\\["'])/g,
  /(?<key>[A-Za-z_][A-Za-z0-9_.-]*)(?<separator>\s*[:=]\s*)(?<value>[^\s,}\])]+)/g,
];

const authValuePattern = /\b(?<scheme>Bearer|Basic)[ \t]+(?<value>[A-Za-z0-9._~+/-]+={0,2})/g;
const urlPattern = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi;

const normalizeKey = (key) =>
  key
    .replace(/^(?:\\?["'])|(?:\\?["'])$/g, "")
    .replace(/[-.]/g, "_")
    .toLowerCase();

const hasSensitiveKey = (key) => {
  const normalized = normalizeKey(key);
  const compact = normalized.replaceAll("_", "");
  if (sensitiveCompactKeys.has(compact)) return true;
  return normalized.split("_").some((part) => sensitiveKeyParts.has(part));
};

const shouldRedactStructuredValue = (key, value) => {
  if (!hasSensitiveKey(key)) return false;

  const trimmed = unquoteEnvValue(value.trim());
  if (trimmed === "") return false;
  if (nonSecretLiterals.has(trimmed.toLowerCase())) return false;
  return !/^-?\d+(?:\.\d+)?$/.test(trimmed);
};

const singleValueText = (value) => {
  if (value.includes("\n") || value.includes("\r")) return false;
  if (/^\s*[{\[]/.test(value)) return false;
  if (/\b[A-Za-z_][A-Za-z0-9_.-]*\s*[:=]\s*/.test(value)) return false;
  return true;
};

const matchOffset = (match, groupName) => {
  const value = match.groups?.[groupName];
  if (value === undefined) return null;

  const offset = match[0].indexOf(value);
  return offset === -1 ? null : match.index + offset;
};

const addReplacement = (replacements, input, start, end, { fingerprint, key = "" } = {}) => {
  if (start === null || end <= start) return;

  let adjustedStart = start;
  let slashCount = 0;
  for (let index = start - 1; index >= 0 && input[index] === "\\"; index -= 1) slashCount += 1;
  if (slashCount % 2 === 1) adjustedStart -= 1;

  const value = input.slice(adjustedStart, end);
  replacements.push({
    analysis: analyzeSecret(value, { fingerprint, key, unquote: true }),
    end,
    start: adjustedStart,
  });
};

const collectTokenReplacements = (input, replacements, { fingerprint }) => {
  for (const pattern of tokenPatterns) {
    for (const match of input.matchAll(pattern)) {
      if (match[0].split(".").length === 3 && detectSecretFormat(match[0]) !== "JWT") continue;
      addReplacement(replacements, input, match.index, match.index + match[0].length, {
        fingerprint,
      });
    }
  }
};

const collectUrlReplacements = (input, replacements, { fingerprint }) => {
  for (const match of input.matchAll(urlPattern)) {
    const value = match[0];
    if (detectSecretFormat(value) !== "credential URL") continue;
    addReplacement(replacements, input, match.index, match.index + value.length, { fingerprint });
  }
};

const collectAuthReplacements = (input, replacements, { fingerprint }) => {
  for (const match of input.matchAll(authValuePattern)) {
    const start = matchOffset(match, "value");
    addReplacement(replacements, input, start, start + match.groups.value.length, {
      fingerprint,
      key: match.groups.scheme,
    });
  }
};

const collectKeyValueReplacements = (input, replacements, { fingerprint }) => {
  for (const pattern of keyValuePatterns) {
    for (const match of input.matchAll(pattern)) {
      const { key, value } = match.groups;
      if (!shouldRedactStructuredValue(key, value)) continue;

      const start = matchOffset(match, "value");
      addReplacement(replacements, input, start, start + value.length, { fingerprint, key });
    }
  }
};

const buildSegments = (input, replacements) => {
  const sorted = [...replacements].sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  const segments = [];
  let cursor = 0;
  let coveredUntil = 0;

  for (const replacement of sorted) {
    if (replacement.start < coveredUntil) continue;
    if (replacement.start > cursor) {
      segments.push({ kind: "text", text: input.slice(cursor, replacement.start) });
    }
    segments.push({
      analysis: replacement.analysis,
      kind: "redaction",
    });
    cursor = replacement.end;
    coveredUntil = replacement.end;
  }

  if (cursor < input.length) {
    segments.push({ kind: "text", text: input.slice(cursor) });
  }

  return segments;
};

const publicTextStats = (input) => ({
  bytes: Buffer.byteLength(input, "utf8"),
  chars: Array.from(input).length,
  lines: lineCount(input),
});

export const analyzeText = (input, { fingerprint } = {}) => {
  if (singleValueText(input)) {
    return { analysis: analyzeSecret(input, { fingerprint }), kind: "whole" };
  }

  const replacements = [];
  collectKeyValueReplacements(input, replacements, { fingerprint });
  collectAuthReplacements(input, replacements, { fingerprint });
  collectUrlReplacements(input, replacements, { fingerprint });
  collectTokenReplacements(input, replacements, { fingerprint });

  return {
    kind: "structured",
    redactionCount: replacements.length,
    segments: buildSegments(input, replacements),
    stats: publicTextStats(input),
  };
};
