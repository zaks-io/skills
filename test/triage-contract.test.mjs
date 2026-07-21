import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

const read = (file) => readFileSync(path.join(root, file), "utf8");

test("ziw-triage processes configured intake on every normal run", () => {
  const skill = read("skills/ziw-triage/SKILL.md");

  assert.match(skill, /normal `ziw-triage` invocation.*process.*configured intake/is);
  assert.match(
    skill,
    /move complete issues from configured intake states.*every normal triage run/is,
  );
  assert.match(skill, /Linear `Backlog` remains excluded unless explicitly\s+requested/i);
  assert.doesNotMatch(
    skill,
    /move complete issues from configured intake states[\s\S]{0,120}only when the user asked/i,
  );
});

test("ziw-triage uses bounded source-of-truth dependency evidence", () => {
  const skill = read("skills/ziw-triage/SKILL.md");

  assert.match(skill, /source-of-truth specs, roadmap, milestone, and project docs/i);
  assert.match(skill, /smallest direct blocker graph/i);
  assert.match(skill, /producer-before-consumer, schema-before-reader, API-before-client/i);
  assert.match(skill, /Do not inspect implementation code, PR diffs, branches, or deploy state/i);
});

test("runtime triage prompts preserve Triage-to-Todo semantics", () => {
  for (const file of ["skills/ziw-triage/agents/openai.yaml", "agents/ziw-triager.md"]) {
    const content = read(file);
    assert.match(content, /Triage[\s\S]{0,120}(?:to|into) `?Todo/i);
    assert.match(content, /Linear `?Backlog`?.*explicit/i);
    assert.match(content, /source-of-truth/i);
  }
});
