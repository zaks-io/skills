import { existsSync } from "node:fs";
import path from "node:path";

export const missingMarkdownTargets = (text, file) => {
  const prose = text.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1[^\n]*$/gm, "");
  const links = prose.matchAll(/\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^)]*["'])?\s*\)/g);
  const missing = [];

  for (const [, raw] of links) {
    const target = raw.replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) continue;
    let pathname;
    try {
      pathname = decodeURIComponent(target.split(/[?#]/, 1)[0]);
    } catch {
      missing.push({ target, resolved: null, reason: "invalid URI escape" });
      continue;
    }
    if (!pathname) continue;
    const resolved = path.resolve(path.dirname(file), pathname);
    if (!existsSync(resolved)) missing.push({ target, resolved });
  }

  return missing;
};
