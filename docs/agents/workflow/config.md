# Workflow config

Stable values only. Progress lives in Linear; CI, PR, and deploy status are
read live. Planner values are in [planner.json](planner.json).

## Repo

- Name: `zaks-io/skills` (public)
- Default branch: `main`
- Branch prefix: `codex/`
- Install: `pnpm install --frozen-lockfile` (Node 24, `pnpm@10.19.0`)
- Focused checks: `pnpm check`, `pnpm format:check`, `pnpm test`,
  `pnpm validate:skills`
- Full local gate: `pnpm ci:check`
- Required CI checks: `Validate skills`, `Static security checks`, `Secret scan`
- Post-merge check: `pnpm ci:check`
- Generated files: the planner schema and validator; regenerate with
  `pnpm generate:planner-contract`
- Production deploy: none

## Planning

- Specs: `docs/*.md`
- Glossary: `CONTEXT.md`

## Tracker

- Provider and location: Linear team `SKI` (Skills)
- Route label: `zaks-io/skills`
- States: workflow defaults; `Backlog` is parked and only triaged on request
- Labels: workflow defaults
- Estimates: none
- Dependencies: Linear `blockedBy` relations

## Workers

- Worker paths: local worktree
- Launch: a delegated session in its own T3 worktree
- Follow-ups: message the same session

## Review and merge

- Merge method: the repository-allowed GitHub method
- Hosted reviewer: CodeRabbit (`coderabbitai`), triggered with
  `@coderabbitai review` after local review
- Planner state file: `.ziw/state.json`

## Friction

- Complaint tool: Exposure Ledger `file_complaint`, project `zaks-io/skills`
