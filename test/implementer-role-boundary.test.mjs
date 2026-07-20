import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const surfaces = [
  "skills/ziw-implement/SKILL.md",
  "skills/ziw-implement/agents/openai.yaml",
  "agents/ziw-implementer.md",
  "skills/ziw-orchestrate/references/delegation-policy.md",
  "skills/ziw-pr/SKILL.md",
  "skills/ziw-pr/agents/openai.yaml",
];

for (const file of surfaces) {
  test(`${file} preserves the implementer review-ownership boundary`, () => {
    const content = readFileSync(path.join(root, file), "utf8");
    assert.match(content, /Author\s+QA\s+is\s+not\s+independent\s+review\s+evidence/i);
    assert.match(content, /Do\s+not\s+apply\s+or\s+clear\s+review-evidence\s+labels/i);
    assert.match(content, /move\s+the\s+issue\s+to\s+`Ready\s+to\s+Merge`/i);
    assert.match(content, /apply\s+merge-ready\s+PR\s+labels/i);
    assert.match(content, /best judgment|judgment-based|use judgment/i);
    assert.match(content, /merely because a commit changed|new commit alone|new commit.*alone/i);
    assert.doesNotMatch(content, /recommend\s+applying\s+the\s+configured\s+review\s+evidence/i);
    assert.doesNotMatch(content, /Review\s+evidence\s+label:\s+APPLY/i);
  });
}

test("ziw-code-review separates Author QA from independent review ownership", () => {
  const content = readFileSync(path.join(root, "skills/ziw-code-review/SKILL.md"), "utf8");
  assert.match(
    content,
    /Author QA can block handoff, but it is not\s+independent review evidence/i,
  );
  assert.match(content, /Author QA mode, always recommend `LEAVE UNCHANGED`/i);
  assert.match(content, /only Agent Orchestrator\s+performs tracker and merge-ready mutations/i);
  assert.match(content, /Never apply or clear review-evidence labels/i);
  assert.match(content, /Do not auto-trigger solely because a commit or PR changed/i);
  assert.doesNotMatch(content, /unless Agent Orchestrator or the user asked/i);
});

test("ziw-code-review Codex adapter preserves read-only workflow ownership", () => {
  const content = readFileSync(
    path.join(root, "skills/ziw-code-review/agents/openai.yaml"),
    "utf8",
  );
  assert.match(content, /implementation-workflow review as Author QA/i);
  assert.match(content, /leave review evidence unchanged/i);
  assert.match(content, /never mutate tracker or merge-ready labels/i);
  assert.match(content, /Do not auto-trigger solely because a commit or PR changed/i);
});
