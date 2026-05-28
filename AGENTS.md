# zaks-io-skills Agent Guide

## Purpose

This repo publishes shared workflow skills for engineering agents. The skills help
agents set up repo-local workflow config, move issue-tracked work through
implementation, review code and PRs, and create or update PRs consistently.

`AGENTS.md` is the source of truth for agent guidance. Keep `CLAUDE.md` as a
one-line `@AGENTS.md` import so Claude Code and other agents read the same
content.

## Map

- `skills/<skill>/SKILL.md`: portable skill instructions. Each skill should have
  one job and one top-level heading.
- `skills/<skill>/agents/openai.yaml`: Codex adapter and trigger fixture for the
  matching skill.
- `skills/workflow-setup/references/`: templates and contracts used to create
  downstream `docs/agents/workflow/config.md`.
- `skills/workflow-code-review/references/`: review support material.
- `scripts/check-skills.mjs`: structural validation and repo invariants.
- `README.md`: user-facing overview, workflow map, and install commands.

## Repo Rules

- Add shared skills under `skills/workflow-*`.
- Keep runtime-specific metadata minimal. Tool providers, commands, environments,
  issue tracker states, and deploy rules belong in each downstream repo's
  `docs/agents/workflow/config.md`.
- Side-effecting workflow skills are manual-only in both Claude frontmatter and
  `agents/openai.yaml`.
- `workflow-code-review` is the implicit review gate. `workflow-agent-review` and
  `workflow-code-review` should run from clean context.
- Do not add per-skill scripts unless `scripts/check-skills.mjs` is updated to
  allow that skill.

## Checks

- Fast structure check: `pnpm check`
- Skill discovery: `pnpm validate:skills`
- Formatting: `pnpm format:check`
- Full local gate: `pnpm ci:check`
- Secrets scan: `pnpm security:secrets`

## Done

A change is done when the affected skill or docs are updated, `pnpm check` and
`pnpm format:check` pass at minimum, and broader checks are run or explicitly
skipped with a reason.
