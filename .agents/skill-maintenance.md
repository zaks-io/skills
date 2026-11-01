# Skill maintenance

Use when editing the published skills.

## Keep it short

- Each skill says its job, its steps, a few rules, and what Done reports.
  Stay inside the [instruction budget](../docs/skill-instruction-budget.md).
- Shared rules, terms, states, and labels live only in the
  [workflow contract](../skills/ziw-setup/references/workflow.md). Link to it;
  don't restate it.
- Never restate what the planner scripts compute. Orchestrate maps each planner
  action to what the agent does, nothing more.
- Don't add a rule for a rare case. Uncovered cases already stop and report.
  If a new rule is unavoidable, remove or merge one to make room.
- One idea per sentence, plain words, numbered steps. No exceptions to
  exceptions.
- Keep `SKILL.md`, `agents/openai.yaml`, and any Claude sub-agent in sync.

## Validate

Run `pnpm check`, `pnpm format:check`, and `pnpm test`. For a change to how a
skill decides, give a fresh agent the skill, the workflow contract, and a
realistic offline case with no expected answer, then read what it actually
does. [slicing-evaluation/cases.json](slicing-evaluation/cases.json) covers To
Issues.

## Done

Report the behavior changed, the checks run, any evaluation results, and the
new word counts.
