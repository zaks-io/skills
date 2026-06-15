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
- `.claude-plugin/plugin.json`: Claude Code plugin manifest.
- `.agents/`: repo-internal runbooks that are not published by skill discovery.
- `agents/<agent>.md`: Claude Code sub-agent definitions for the few workflow
  roles that benefit from isolated context.
- `skills/ziw-setup/references/`: templates and contracts used to create
  downstream `docs/agents/workflow/config.md`.
- `skills/ziw-code-review/references/`: review support material.
- `docs/agent-workflow.md`: technical workflow contract, state model, and role
  split.
- `docs/skill-distribution.md`: source-backed policy for project skills,
  plugins, global installs, lockfiles, and downstream refresh PRs.
- `docs/skill-portfolio.md`: publishable skill surface, trim criteria, and
  keep/remove rationale.
- `docs/agents/workflow/config.md`: repo-local workflow lookup table. Read it
  before running `ziw-*` workflow skills in this repo.
- `scripts/check-skills.mjs`: structural validation and repo invariants.
- `scripts/update-downstream-skills.mjs`: discovers downstream `skills-lock.json`
  consumers, runs project-scope skill updates, and reports repos needing PRs.
- `scripts/workflow-contract.mjs`: pure workflow decision helpers covered by
  `node --test`.
- `README.md`: user-facing overview, quick start, and install commands.

## Repo Rules

- Add shared skills under `skills/ziw-*`.
- Keep repo-internal procedures under `.agents/`; do not make them publishable
  skills unless they are meant to ship to downstream repos.
- Keep runtime-specific metadata minimal. Tool providers, commands, environments,
  issue tracker states, and deploy rules belong in each downstream repo's
  `docs/agents/workflow/config.md`.
- Preserve support for both Claude and Codex skill types. When adding or
  changing a skill, keep the portable `SKILL.md` contract, Claude-compatible
  frontmatter, and Codex `agents/openai.yaml` metadata in sync.
- Side-effecting workflow skills are manual-only in both Claude frontmatter and
  `agents/openai.yaml`.
- Claude Code sub-agents live only in root `agents/`, load skill files through
  `${CLAUDE_PLUGIN_ROOT}`, and use `model: inherit`. Keep them limited to
  context-heavy delegation roles, not every workflow skill.
- `ziw-code-review` is the implicit review gate. `ziw-review` and
  `ziw-code-review` should run from clean context.
- Do not add per-skill scripts unless `scripts/check-skills.mjs` is updated to
  allow that skill.
- Update `docs/skill-portfolio.md` whenever adding, removing, demoting, or
  merging a publishable skill.

## Checks

- Fast structure check: `pnpm check`
- Skill discovery: `pnpm validate:skills`
- Formatting: `pnpm format:check`
- Claude plugin validation: `claude plugin validate .` when Claude Code is
  available
- Full local gate: `pnpm ci:check`
- Secrets scan: `pnpm security:secrets`

## Done

A change is done when the affected skill or docs are updated, `pnpm check` and
`pnpm format:check` pass at minimum, and broader checks are run or explicitly
skipped with a reason.
