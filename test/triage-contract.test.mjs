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

test("fragment definition lives in the tracker contract and callers load it", () => {
  const contract = read("skills/ziw-setup/references/issue-tracker-contract.md");
  const triage = read("skills/ziw-triage/SKILL.md");
  const toIssues = read("skills/ziw-to-issues/SKILL.md");

  assert.match(
    contract,
    /not a fragment when its body records a\s+split reason separating it from the\s+sibling it serves/i,
  );
  assert.match(contract, /Only `ziw-to-issues`\s+folds\s+tickets/i);
  assert.match(contract, /no consumer or observable behavior in its PR/i);
  assert.match(contract, /dependency alone does not make a fragment when it has its own behavior/i);
  assert.match(contract, /Work for already-shipped behavior stands alone/i);
  assert.match(
    triage,
    /Load \[Agent-Ready Issue Body\]\(\.\.\/ziw-setup\/references\/issue-tracker-contract\.md#agent-ready-issue-body\)[\s\S]*?for readiness, required fields, boundaries, and fragment rules/i,
  );
  assert.match(
    toIssues,
    /\[fragment definition\]\(\.\.\/ziw-setup\/references\/issue-tracker-contract\.md#fragments\)/i,
  );
  assert.match(toIssues, /unless a split\s+reason separates it from its fold target/i);
  for (const content of [contract, triage]) {
    assert.doesNotMatch(content, /rollout-order or risk-or-authority\s+split reason/i);
  }
  const partnerStates = /claimed,\s+active,\s+or\s+linked\s+to\s+an\s+open\s+PR/i;
  for (const content of [contract, toIssues]) {
    assert.match(content, partnerStates);
  }
  assert.match(
    triage,
    /fragment left `needs-info` behind a claimed, active, or open-PR partner needs human decision until that partner is Done/i,
  );
});

test("split reasons start from one slice per feature and agree across docs", () => {
  const toIssues = read("skills/ziw-to-issues/SKILL.md");
  const adapter = read("skills/ziw-to-issues/agents/openai.yaml");

  assert.match(toIssues, /Start\s+from\s+one\s+slice\s+per\s+feature/i);
  assert.match(toIssues, /Parts\s+of\s+one\s+feature\s+never\s+qualify/i);
  assert.match(toIssues, /different\s+risk\s+label\s+alone\s+is\s+not\s+a\s+split\s+reason/i);
  assert.match(
    toIssues,
    /Before\s+creating\s+more\s+than\s+three\s+new\s+slices\s+in\s+one\s+run/i,
  );
  assert.match(adapter, /one\s+slice\s+per\s+feature/i);
  assert.match(adapter, /more\s+than\s+three\s+new\s+slices/i);
  assert.match(toIssues, /keeps\s+every\s+check,\s+approval,\s+and\s+reviewer\s+routing/i);
  assert.doesNotMatch(toIssues, /highest\s+risk\s+label/i);

  for (const file of [
    "README.md",
    "docs/agent-workflow.md",
    "skills/ziw-setup/references/agent-workflow.md",
  ]) {
    const content = read(file);
    assert.match(content, /one\s+slice\s+per\s+feature/i, file);
    assert.match(
      content,
      /only\s+for\s+size,\s+rollout\s+order,\s+authority,\s+readiness,\s+or\s+separate\s+features/i,
      file,
    );
    assert.match(
      content,
      /too\s+large\s+to\s+review\s+in\s+one\s+sitting\s+when\s+no\s+scale/i,
      file,
    );
    assert.match(content, /more\s+than\s+three\s+new\s+slices/i, file);
  }

  for (const file of [
    "skills/ziw-to-issues/SKILL.md",
    "README.md",
    "docs/agent-workflow.md",
    "skills/ziw-setup/references/agent-workflow.md",
  ]) {
    const content = read(file);
    assert.doesNotMatch(content, /distinct\s+outcome/i, file);
    assert.doesNotMatch(content, /tracer\s+bullet/i, file);
  }
});
