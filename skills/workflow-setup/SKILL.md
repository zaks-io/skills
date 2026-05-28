---
name: workflow-setup
description: Use for workflow setup when setting up or refreshing a repository for agent workflows by creating docs/agents/workflow/config.md with repo commands, issue tracking, runtime adapters, review gates, and environment safety rules.
argument-hint: "[repo-path]"
disable-model-invocation: true
---

# Setup

Create or refresh the repo-local agent config used by the other skills.
The output is tracked project knowledge, not secrets.

## Inputs

- Repo path to configure.
- Existing repo rules, CI, package scripts, issue tracker, and deploy docs.
- Any user-provided tracker, runtime, or environment constraints.

## Output File

Write or update:

- `docs/agents/workflow/config.md`

Load these references when writing the config:

- [references/project-config.md](references/project-config.md) for the template
  and required sections
- [references/agent-workflow.md](references/agent-workflow.md) for role
  responsibilities and adapter minimums
- [references/issue-tracker-contract.md](references/issue-tracker-contract.md)
  for tracker states, labels, readiness, and issue body shape
- [references/handoff.md](references/handoff.md) for cross-agent handoff shape

## Gather

Inspect files that exist:

- `AGENTS.md`, `CLAUDE.md`, editor or runtime rules, and repo-local skills
- `package.json`, lockfiles, Makefile, Justfile, turbo config, and CI workflows
- project status, roadmap, specs, ADRs, runbooks, and existing `docs/agents/*`
- code host branch, default branch, PR, preview, and deploy workflows
- issue tracker provider, provider location, projects or boards, statuses,
  labels, issue templates, and existing issue examples when tracker tools are
  available
- environment files, deployment config, and service inventories

## Configure

Record:

- repo identity, default branch, branch prefix, and PR conventions
- package manager and command table: install, full gate, focused checks, build,
  lint, typecheck, tests, smoke, generated artifacts
- issue tracker provider, provider location, project or board, routing label,
  triage scope, orphan policy, statuses, labels, priority policy, dependency
  policy, issue body contract, and which workflow role owns status transitions
- runtime rules for local Codex, remote worker agents, Claude, and
  any repo-approved worker
- automation roles: Issue Triage, Agent Queue, Agent Review, Create PR, and
  Agent Implement, including Queue-owned tracker transitions, clean-context
  review delegation, and the implementation pipeline
- review gates: code review, Agent Review, CodeRabbit escalation,
  required CI, preview checks
- environment safety: local, development, preview, and production capabilities;
  production deploy path; preview deploy path; credential rules; allowed hosted
  checks; and explicit approval requirements
- handoff shape for implementation, review, queue, and PR creation
- unknowns that still require human input

## Issue Tracker Defaults

Use [references/issue-tracker-contract.md](references/issue-tracker-contract.md)
unless the repo config documents a different exact mapping.

Do not invent a provider location, status, or label if the issue tracker cannot confirm it.
Write an unknown in the config instead.

## Adapter Update

After writing the config, update short runtime adapters when present:

- `AGENTS.md`
- `CLAUDE.md`
- editor or runtime rules
- repo-local skill usage docs

Adapters should say to read `docs/agents/workflow/config.md` before using the
workflow skills. Keep them short and use
[references/agent-workflow.md](references/agent-workflow.md) as the adapter
contract.

## Safety

- Never include secrets, tokens, signed URLs, customer payloads, or private logs
  in the config.
- Never deploy or mutate production while setting up config.
- Prefer exact discovered commands over guesses.
- If a command is inferred but unverified, mark it as inferred.

## Done

Report:

- config path written
- commands discovered
- tracker routing and labels found or missing
- runtime adapters updated
- unknowns left for the user
- validation command run
