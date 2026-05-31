import { validTypeNote } from "./analyze.mjs";

const quote = (value) => JSON.stringify(value);

export const renderToken = (analysis) => {
  if (analysis.empty) return "<empty>";

  const format = analysis.format
    ? ` format=${quote(analysis.format)} note=${quote(validTypeNote)}`
    : ` class=${analysis.class} format=unrecognized`;
  const hint = analysis.hint ? ` hint=${quote(analysis.hint)}` : "";
  const fp = analysis.fingerprint ? ` fp=${analysis.fingerprint}` : "";
  return `<redacted bytes=${analysis.bytes} chars=${analysis.chars} lines=${analysis.lines}${format}${hint}${fp}>`;
};

const safeTextAttribute = (value) =>
  value.replace(/[^A-Za-z0-9./_-]+/g, "_").replace(/^_+|_+$/g, "");

const renderTextToken = (analysis) => {
  if (analysis.empty) return "<empty>";

  const format = analysis.format
    ? ` format=${safeTextAttribute(analysis.format)} note=valid_key`
    : ` class=${analysis.class} format=unrecognized`;
  const hint = analysis.hint ? ` hint=${safeTextAttribute(analysis.hint)}` : "";
  const fp = analysis.fingerprint ? ` fp=${analysis.fingerprint}` : "";
  return `<redacted bytes=${analysis.bytes} chars=${analysis.chars} lines=${analysis.lines}${format}${hint}${fp}>`;
};

export const renderEnvSource = (source, showLabel = false) => {
  const body = source.env.lines
    .map((line) => {
      if (line.kind === "blank") return "";
      if (line.kind === "comment") return "# <comment redacted>";
      if (line.kind === "unparsed")
        return `<unparsed-line ${renderToken(line.analysis).slice(1, -1)}>`;
      return `${line.leading}${line.exportPrefix}${line.visibleKey}${line.separator}${renderToken(
        line.analysis,
      )}`;
    })
    .join("\n");
  return showLabel ? `# source: ${source.label}\n${body}` : body;
};

export const renderTextSource = (source) => {
  if (source.text.kind === "whole") return renderTextToken(source.text.analysis);

  return source.text.segments
    .map((segment) =>
      segment.kind === "redaction" ? renderTextToken(segment.analysis) : segment.text,
    )
    .join("");
};

export const renderChecks = (checks) => {
  if (checks.length === 0) return "";
  return [
    "# checks",
    ...checks.map((check) => {
      const expected = check.expectedFormat ? ` expected=${quote(check.expectedFormat)}` : "";
      const formats = check.formats.length > 0 ? ` formats=${quote(check.formats.join(","))}` : "";
      return `CHECK ${check.key} ${check.status} count=${check.count} empty=${check.emptyCount}${expected}${formats}`;
    }),
  ].join("\n");
};

export const renderDiff = (diffs) =>
  [
    "# diff",
    ...diffs.map((diff) => {
      const leftFp = diff.leftFingerprint ? ` left_fp=${diff.leftFingerprint}` : "";
      const rightFp = diff.rightFingerprint ? ` right_fp=${diff.rightFingerprint}` : "";
      return `${diff.key} ${diff.status} left_format=${quote(diff.leftFormat)} right_format=${quote(
        diff.rightFormat,
      )}${leftFp}${rightFp}`;
    }),
  ].join("\n");

export const renderFailures = (failures) => {
  if (failures.length === 0) return "";
  return ["# strict failures", ...failures.map((failure) => `FAIL ${failure}`)].join("\n");
};

const publicAnalysis = (analysis) =>
  analysis.empty
    ? { empty: true }
    : {
        bytes: analysis.bytes,
        chars: analysis.chars,
        class: analysis.class,
        empty: false,
        fingerprint: analysis.fingerprint,
        format: analysis.format ?? "unrecognized",
        hint: analysis.hint,
        lines: analysis.lines,
        note: analysis.note,
      };

export const toPublicSource = (source) => {
  if (source.kind === "text") {
    if (source.text.kind === "whole") {
      return { analysis: publicAnalysis(source.text.analysis), kind: "text", label: source.label };
    }

    return {
      kind: "text",
      label: source.label,
      redacted: renderTextSource(source),
      redactions: source.text.segments
        .filter((segment) => segment.kind === "redaction")
        .map((segment) => publicAnalysis(segment.analysis)),
      stats: source.text.stats,
    };
  }

  return {
    entries: source.env.lines
      .filter((line) => line.kind !== "blank")
      .map((line) => {
        if (line.kind === "assignment") {
          return { analysis: publicAnalysis(line.analysis), key: line.visibleKey, kind: line.kind };
        }
        if (line.kind === "unparsed") {
          return { analysis: publicAnalysis(line.analysis), kind: line.kind };
        }
        return { kind: line.kind };
      }),
    kind: "env",
    label: source.label,
  };
};

export const renderJson = (payload) => `${JSON.stringify(payload, null, 2)}\n`;
