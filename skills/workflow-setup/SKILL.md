---
name: workflow-setup
description: Use for workflow setup when setting up or refreshing a repository for agent workflows by creating docs/agents/workflow/config.md with repo commands, issue tracking, agent adapters, review gates, and environment safety rules.
argument-hint: "[repo-path]"
disable-model-invocation: true
---

# Setup

Create or refresh the repo-local agent config used by the other skills. Run this
once per repo, then rerun it when the workflow may have changed or the user wants
to verify that the config is current. The output is a compact lookup table, not
a narrative doc.

Include stable values workflow agents need repeatedly: repo commands, tracker
IDs, labels, agent access, review gates, handoff shape, and safety rules.
Agents should query external systems to refresh live state, not to rediscover
these values. If a value cannot be verified during setup, record it as an
explicit unknown with the source that should verify it.

## Inputs

- Repo path to configure.
- Existing repo rules, CI, package scripts, issue tracker, and deploy docs.
- Any user-provided tracker, agent access, or environment constraints.

## Output File

Create or update:

- `docs/agents/workflow/config.md`

Treat this file as the repo's workflow lookup table. Keep it terse: values,
paths, commands, IDs, owners, and unknowns. Omit explanation, background, and
fields that do not apply.

Load these references when writing the config:

- [references/project-config.md](references/project-config.md) for the template
  and required sections
- [references/agent-workflow.md](references/agent-workflow.md) for role
  responsibilities and adapter minimums
- [references/issue-tracker-contract.md](references/issue-tracker-contract.md)
  for tracker states, labels, readiness, and issue body shape
- [references/handoff.md](references/handoff.md) for cross-agent handoff shape

## Refresh Existing Config

If `docs/agents/workflow/config.md` already exists, read it before inspecting
anything else. Use it as the baseline for refresh:

- preserve verified stable values that still match current repo and tracker
  state
- check unknowns, stale timestamps, changed commands, renamed labels, moved
  projects, changed CI, changed worker delegation paths, and changed environment
  rules
- update only fields that are missing, stale, wrong, or newly verified
- do not erase explicit human decisions unless current evidence or the user
  contradicts them
- report what changed, what stayed verified, and what remains unknown

Do not regenerate the config from scratch when refreshing. The job is to detect
drift from the current config, then patch the lookup table.

## Gather

Inspect files that exist:

- `AGENTS.md`, `CLAUDE.md`, editor or agent rules, and repo-local skills
- target repo's Claude Code integration config, `.claude/*`, and any repo-local
  agent, command, or skill directories that Claude should load
- `package.json`, lockfiles, Makefile, Justfile, turbo config, and CI workflows
- project status, roadmap, specs, ADRs, runbooks, and existing `docs/agents/*`
- existing agent label docs, such as `docs/agents/triage-labels.md`
- code host branch, default branch, PR, preview, and deploy workflows
- issue tracker provider, provider location, projects or boards, statuses,
  labels, issue templates, and existing issue examples by querying tracker tools
  when available
- environment files, deployment config, and service inventories

## Configure

Record:

- only verified stable values future workflow agents would otherwise have to
  find again
- repo identity, default branch, branch prefix, and PR conventions
- package manager and command table: install, full gate, focused checks, build,
  lint, typecheck, tests, smoke, generated artifacts
- issue tracker provider, provider location, project or board, routing label,
  triage scope, orphan policy, statuses, labels, worker routing/readiness labels
  when present, priority policy, dependency policy, issue body contract, and
  which workflow role owns status transitions
- supported worker delegation paths: `local-worktree`, `issue-assigned`, or both
- label source of truth: the live tracker metadata, tracker workflow settings,
  existing repo docs, or explicit user instruction used to verify label names
- label documentation policy: whether repo-local label docs exist, and whether
  they mirror this config or redirect agents back to it
- verified tracker metadata: lookup tool or query used, verification date, and
  exact provider IDs, URLs, or keys for teams, projects, boards, repos,
  milestones, roadmaps, statuses, labels, priorities, and relationship types
  when the tracker exposes them
- agent access rules for local Codex, remote worker agents, Claude, and any
  repo-approved worker
- issue-assigned agent notes when available: only project-specific routing
  labels, fields, worker readiness labels, or continuation comment rules that
  are annoying to rediscover
- Claude Code compatibility: the target repo's Claude Code integration source
  of truth, the agent markdown it imports, the repo-local agent, command, or
  skill paths symlinked there, and how those links were verified
- automation roles: Issue Triage, Agent Orchestrator, Agent Review, Create PR, and
  Agent Implement, including Orchestrator-owned tracker transitions, clean-context
  review delegation, and the implementation pipeline
- review gates: code review, Agent Review, CodeRabbit escalation,
  required CI, preview checks
- environment safety: local, development, preview, and production capabilities;
  production deploy path; preview deploy path; credential rules; allowed hosted
  checks; and explicit approval requirements
- handoff shape for implementation, review, queue, and PR creation
- unknowns that still require human input

## Issue Tracker Defaults

Find the repo's issue tracker source of truth before writing labels or statuses.
Use live tracker metadata, tracker workflow settings, existing repo docs, or
explicit user instruction. Do not guess from memory.

Use [references/issue-tracker-contract.md](references/issue-tracker-contract.md)
only when the repo has no different verified mapping. Treat these labels as
defaults, not proof that the tracker already has them:

Readiness:

- `needs-triage`
- `needs-info`
- `ready-for-agent`
- `ready-for-human`
- `wontfix`

Worker routing or readiness labels, such as `remote-worker`, are project config
values only. Record them when the repo's tracker uses them; do not add them as
shared defaults.

Risk:

- `risk-normal`
- `risk-security-sensitive`
- `risk-schema`
- `risk-cross-cutting`

Type:

- `Bug`
- `Feature`
- `Improvement`
- `Tech Debt`
- `Spike`
- `Hotfix`

Do not invent a provider location, status, or label if the issue tracker cannot confirm it.
Write an unknown in the config instead.

When tracker tools are available, verify the available tracker metadata during
setup and record exact names plus stable IDs in the config. Later skills should
not have to rediscover routine IDs before moving issues, applying labels, or
checking project state.

Do not copy every discoverable agent assignee or integration detail into config.
The tracker remains the source of truth for which agents are currently
assignable. Record only the supported worker delegation paths and repo-specific
routing or continuation details that a future Orchestrator run would otherwise waste
time rediscovering.

If `docs/agents/triage-labels.md` or a similar label doc exists, update it to
match the config or replace its contents with a pointer to the config. Do not
leave it as a stale partial list. It must cover readiness, risk, type, and any
configured area or ownership labels.

## Adapter Update

After writing the config, update short agent adapters when present:

- `AGENTS.md`
- `CLAUDE.md`
- editor or agent rules
- repo-local skill usage docs

Adapters should say to read `docs/agents/workflow/config.md` before using the
workflow skills. Keep them short and use
[references/agent-workflow.md](references/agent-workflow.md) as the adapter
contract.

For Claude Code, configure the target repo's Claude Code integration, not this
skills repo. Treat that integration as the source of truth for Claude-facing
agent, command, and skill registration. Configure it to import the target repo's
agent markdown, usually `AGENTS.md` through a one-line `CLAUDE.md` `@AGENTS.md`
import when supported. Claude Code is picky, so do not make independent copies.
Symlink repo-local Claude Code paths into the integration location when Claude
Code requires exact paths, then verify each link target resolves from a clean
checkout. Record any path Claude Code refuses to follow as an unknown instead of
guessing.

## Safety

- Never include secrets, tokens, signed URLs, customer payloads, or private logs
  in the config.
- Never deploy or mutate production while setting up config.
- Prefer exact discovered commands over guesses.
- If a command is inferred but unverified, mark it as inferred.

## Done

Report:

- config path written
- whether this was first setup or refresh of an existing config
- whether the config is complete enough to be the workflow lookup table
- config fields changed, unchanged, and still unknown
- commands discovered
- tracker routing and labels found or missing
- agent adapters updated
- unknowns left for the user
- validation command run
