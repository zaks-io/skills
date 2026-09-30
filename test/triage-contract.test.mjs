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
    /move complete `kind-slice` issues from configured intake states.*every normal triage run/is,
  );
  assert.match(skill, /Linear `Backlog` remains excluded unless explicitly\s+requested/i);
  assert.doesNotMatch(
    skill,
    /move complete `kind-slice` issues from configured intake states[\s\S]{0,120}only when the user asked/i,
  );
});

test("ziw-triage uses bounded source-of-truth dependency evidence", () => {
  const skill = read("skills/ziw-triage/SKILL.md");

  assert.match(skill, /source-of-truth specs, roadmap, milestone, and project docs/i);
  assert.match(skill, /smallest direct blocker graph/i);
  assert.match(skill, /producer-before-consumer, schema-before-reader, API-before-client/i);
  assert.match(skill, /Do not inspect implementation code, PR diffs, branches, or deploy state/i);
});

test("runtime triage prompts use configured intake and ready states", () => {
  for (const file of ["skills/ziw-triage/agents/openai.yaml", "agents/ziw-triager.md"]) {
    const content = read(file);
    assert.match(content, /configured intake states[\s\S]{0,120}to the configured ready state/i);
    assert.match(content, /Linear `?Backlog`?.*explicit/i);
    assert.match(content, /source-of-truth/i);
  }
});

test("fragment contract agrees across To Issues, triage, and the tracker contract", () => {
  const contract = read("skills/ziw-setup/references/issue-tracker-contract.md");
  const triage = read("skills/ziw-triage/SKILL.md");
  const toIssues = read("skills/ziw-to-issues/SKILL.md");

  assert.match(
    contract,
    /not a fragment when its body records a\s+split reason separating it from the\s+sibling it serves/i,
  );
  assert.match(contract, /Only `ziw-to-issues`\s+folds\s+tickets/i);
  assert.match(triage, /not a fragment as defined in the\s+issue tracker contract/i);
  assert.match(triage, /with no split reason\s+in its body separating\s+it from that sibling/i);
  assert.match(toIssues, /unless a split\s+reason separates it from its fold target/i);
  for (const content of [contract, triage]) {
    assert.doesNotMatch(content, /rollout-order or risk-or-authority\s+split reason/i);
  }
  const partnerStates = /claimed,\s+active,\s+or\s+linked\s+to\s+an\s+open\s+PR/i;
  for (const content of [contract, triage, toIssues]) {
    assert.match(content, partnerStates);
  }
});
