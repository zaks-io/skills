import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { missingMarkdownTargets } from "../scripts/skill-links.mjs";

const fixture = (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "skill-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "grill"));
  mkdirSync(path.join(root, "architecture", "references"), { recursive: true });
  return { root, file: path.join(root, "grill", "SKILL.md") };
};

test("a moved reference fails until its caller's link is updated", (t) => {
  const { root, file } = fixture(t);
  const reference = path.join(root, "architecture", "references", "design.md");
  writeFileSync(reference, "# Design\n");
  const original = "[Design](../architecture/references/design.md#interface)";
  assert.deepEqual(missingMarkdownTargets(original, file), []);

  renameSync(reference, path.join(path.dirname(reference), "interface.md"));
  assert.deepEqual(missingMarkdownTargets(original, file), [
    { target: "../architecture/references/design.md#interface", resolved: reference },
  ]);
  assert.deepEqual(
    missingMarkdownTargets("[Design](../architecture/references/interface.md#interface)", file),
    [],
  );
});

test("encoded filenames resolve while examples, anchors, and remote links are ignored", (t) => {
  const { root, file } = fixture(t);
  writeFileSync(path.join(root, "architecture", "references", "design notes.md"), "# Notes\n");
  const text = [
    "[Notes](../architecture/references/design%20notes.md)",
    '[Notes](<../architecture/references/design notes.md> "Design")',
    "[Section](#local)",
    "[Web](https://example.com/missing.md)",
    "[Remote](//example.com/missing.md)",
    "[Email](mailto:example@example.com)",
    "```markdown\n[Example](missing-example.md)\n```",
    "~~~markdown\n[Example](missing-example.md)\n~~~",
  ].join("\n\n");
  assert.deepEqual(missingMarkdownTargets(text, file), []);
  assert.equal(missingMarkdownTargets("[Missing](../missing.md)", file).length, 1);
});

test("malformed escapes report their target without hiding other broken links", (t) => {
  const { file } = fixture(t);
  const failures = missingMarkdownTargets("[Bad](100%.md)\n[Missing](missing.md)", file);
  assert.deepEqual(failures[0], {
    target: "100%.md",
    resolved: null,
    reason: "invalid URI escape",
  });
  assert.equal(failures[1].target, "missing.md");
});
