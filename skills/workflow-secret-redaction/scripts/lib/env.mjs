import { analyzeSecret } from "./analyze.mjs";

const assignmentPattern = /^(\s*)(export\s+)?([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;

export const parseEnv = (input, { fingerprint, hideKeys = false } = {}) => {
  let keyCount = 0;
  const lines = input.split(/\r\n|\r|\n/).map((line) => {
    if (line.trim() === "") return { kind: "blank" };
    if (/^\s*#/.test(line)) return { kind: "comment" };

    const match = line.match(assignmentPattern);
    if (!match) {
      return { analysis: analyzeSecret(line, { fingerprint }), kind: "unparsed" };
    }

    keyCount += 1;
    const [, leading, exportPrefix = "", key, separator, value] = match;
    return {
      analysis: analyzeSecret(value, { fingerprint, key, unquote: true }),
      exportPrefix,
      key,
      kind: "assignment",
      leading,
      separator,
      visibleKey: hideKeys ? `KEY_${keyCount}` : key,
    };
  });

  return { assignments: lines.filter((line) => line.kind === "assignment"), lines };
};

export const parseSchema = (input) =>
  input
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      if (index === -1) {
        throw new Error(`Invalid schema line: ${line}`);
      }
      return {
        expectedFormat: line.slice(index + 1).trim(),
        key: line.slice(0, index).trim(),
      };
    });

export const collectAssignments = (sources) => {
  const byKey = new Map();
  for (const source of sources) {
    for (const entry of source.env.assignments) {
      const entries = byKey.get(entry.key) ?? [];
      entries.push({ ...entry, source: source.label });
      byKey.set(entry.key, entries);
    }
  }
  return byKey;
};

export const checkExpectations = (sources, expectedKeys, schemaEntries = []) => {
  const byKey = collectAssignments(sources);
  const schemaByKey = new Map(schemaEntries.map((entry) => [entry.key, entry.expectedFormat]));
  const checks = [...new Set([...expectedKeys, ...schemaByKey.keys()])].map((key) => {
    const entries = byKey.get(key) ?? [];
    const expectedFormat = schemaByKey.get(key) ?? null;
    const formats = [...new Set(entries.map((entry) => entry.analysis.format ?? "unrecognized"))];
    const emptyCount = entries.filter((entry) => entry.analysis.empty).length;
    const mismatch = expectedFormat && !formats.includes(expectedFormat);
    const status =
      entries.length === 0
        ? "missing"
        : entries.length > 1
          ? "duplicate"
          : emptyCount > 0
            ? "empty"
            : mismatch
              ? "format_mismatch"
              : "present";

    return {
      count: entries.length,
      emptyCount,
      expectedFormat,
      formats,
      key,
      ok: status === "present",
      status,
    };
  });

  return checks;
};

export const strictFailures = ({ checks = [], mode, sources = [] }) => {
  const failures = checks
    .filter((check) => !check.ok)
    .map((check) => `${check.key}:${check.status}`);
  if (mode !== "env") return failures;

  for (const source of sources) {
    for (const line of source.env.lines) {
      if (line.kind === "unparsed") failures.push(`${source.label}:unparsed`);
      if (line.kind === "assignment" && line.analysis.empty) failures.push(`${line.key}:empty`);
    }
  }
  return [...new Set(failures)];
};

const indexAssignments = (source) =>
  new Map(source.env.assignments.map((entry) => [entry.key, entry]));

export const diffSources = (left, right, { hideKeys = false } = {}) => {
  const leftByKey = indexAssignments(left);
  const rightByKey = indexAssignments(right);
  const keys = [...new Set([...leftByKey.keys(), ...rightByKey.keys()])].sort();

  return keys.map((key, index) => {
    const before = leftByKey.get(key) ?? null;
    const after = rightByKey.get(key) ?? null;
    const leftFormat = before?.analysis.format ?? "unrecognized";
    const rightFormat = after?.analysis.format ?? "unrecognized";
    let status = "changed";
    if (!before) status = "added";
    else if (!after) status = "missing";
    else if (before.analysis.empty || after.analysis.empty) status = "empty";
    else if (leftFormat !== rightFormat) status = "format_changed";
    else if (before.analysis.fingerprint === after.analysis.fingerprint) status = "same";

    return {
      key: hideKeys ? `KEY_${index + 1}` : key,
      leftFingerprint: before?.analysis.fingerprint ?? null,
      leftFormat,
      rightFingerprint: after?.analysis.fingerprint ?? null,
      rightFormat,
      status,
    };
  });
};
