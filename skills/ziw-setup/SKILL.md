---
name: ziw-setup
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

Setup is a verification pass, not a best-effort note-taking pass. Every populated
config value that can change agent behavior must have current evidence from the
repo, tracker, code host, CI, agent integration, environment config, or explicit
user instruction. If the value is not verified, mark it `inferred` or move it to
`Unknowns`; do not present it as authoritative.

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
- [references/operating-profile.md](references/operating-profile.md) for the
  concurrency default, the issue-assigned delegation and continuation mechanic,
  the repo-route precondition, and the merge-safety decision table
- [references/linear-cursor-example.md](references/linear-cursor-example.md) for
  a worked Linear + Cursor config to copy when the repo uses that stack
- [references/handoff.md](references/handoff.md) for cross-agent handoff shape

## Refresh Existing Config

If `docs/agents/workflow/config.md` already exists, read it before inspecting
anything else. Use it as the baseline for refresh:

- preserve verified stable values that still match current repo and tracker
  state
- re-verify every populated behavior-affecting field before leaving it
  authoritative; do not preserve a stale value just because it is already in the
  file
- re-run at least one read-only query against configured tracker IDs and
  query-safe names before trusting a project, team, board, or roadmap mapping
- check unknowns, stale timestamps, changed commands, renamed labels, moved
  projects, changed CI, changed worker delegation paths, and changed environment
  rules
- replace stale slugs or display names that return empty tracker results when a
  verified provider ID or canonical name resolves the same scope
- update only fields that are missing, stale, wrong, or newly verified
- do not erase explicit human decisions unless current evidence or the user
  contradicts them
- report what changed, what stayed verified, and what remains unknown

Do not regenerate the config from scratch when refreshing. The job is to detect
drift from the current config, then patch the lookup table.

## Verification Standard

Verify all populated workflow fields that setup writes or preserves:

- repo identity, default branch, branch prefix, package manager, lockfile, and
  command names from repo files and git metadata
- install, check, build, test, lint, smoke, preview, and generated-artifact
  commands from scripts, CI workflows, makefiles, justfiles, runbooks, or direct
  safe command execution
- issue tracker provider, location, team/project/board/roadmap, statuses,
  labels, priorities, relationships, issue templates, and query contracts with
  read-only tracker tool calls when tools are available
- code host default branch, branch protections, PR conventions, linked checks,
  and open PR query shape through git metadata, code host tools, or workflow
  files
- worker delegation paths, environment labels or fields, continuation paths, and
  remote worker delegation mechanics through tracker metadata, verified config,
  or explicit user instruction
- Claude, Codex, editor, and repo-local adapter paths by resolving files,
  symlinks, imports, and generated skill metadata from a clean path
- environment safety, deployment paths, hosted checks, preview rules, credential
  rules, and production approval rules from deployment config, CI, runbooks, or
  explicit user instruction

Do not run install, deploy, production mutation, expensive hosted actions, or
credentialed provider actions just to verify setup unless the user explicitly
approved that action. For those values, verify the command or path exists and
record execution as unknown or requiring approval.

Every unknown must name the missing value and the source or action that would
verify it. The final report must say whether any critical unknowns remain.

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
- a compact verification summary: date, scope, evidence sources, safe commands or
  read-only tool calls used, and unverified values
- repo identity, default branch, branch prefix, and PR conventions
- package manager and command table: install, full gate, focused checks, build,
  lint, typecheck, tests, smoke, generated artifacts
- issue tracker provider, provider location, project or board, routing label,
  triage scope, orphan policy, statuses, labels, kind label set
  (`kind-spec`, `kind-epic`, `kind-slice`) and its single-select policy,
  readiness label policy, worker environment label policy when present, startable
  work criteria (including `kind-slice` only), priority policy, dependency policy,
  dependency graph mechanism, file footprint convention, issue body contract,
  agent-suitability policy for work types and risk,
  Issue Triage verified-state reconciliation authority, requested intake-to-ready
  authority, and which workflow role owns active status transitions
- tracker tool query contract: exact provider IDs, query-safe names, status
  field names, relationship or blocker fields, pagination shape if relevant, and
  one read-only verification query or tool call that returned the expected scope
- supported worker delegation paths: `local-worktree`, `issue-assigned`, or both
- default worker path and parallelism policy when the user or repo has a stable
  preference
- autonomous-loop controls when the repo runs the orchestrator unattended:
  concurrency cap, stuck-worker timeout, attempt cap before the thrash circuit
  breaker, required checks that define green for the integrate gate, auto-merge
  risk tiers, post-merge check, verified-ready backlog policy,
  completely-blocked stop policy, friction-log ticket ID, and delivery metrics
- runtime loop and automation terminology for each supported adapter: Claude Code
  `/loop`, schedule, or wake-up timer; Codex automations, either cron
  automations or heartbeat automations; and which mechanism owns recurring
  Orchestrator ticks
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
- issue-assigned agent notes when available: project-specific environment labels
  or fields, worker environment approval labels, delegation tool or field,
  verified agent IDs, direct-agent reply targets, continuation comment rules, and
  no-mutation probe policy
- Claude Code compatibility: the target repo's Claude Code integration source
  of truth, the agent markdown it imports, the repo-local agent, command, or
  skill paths symlinked there, and how those links were verified
- automation roles: To Issues, Issue Triage, Agent Orchestrator, Agent Review,
  Create PR, and Agent Implement, including To Issues spec-to-slice creation and
  the dependency graph, Issue Triage current-ticket readiness repair,
  verified-state reconciliation, requested intake promotion, Orchestrator-owned
  active tracker transitions, the orchestrator integrate gate and friction log,
  clean-context review delegation, and the implementation pipeline
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

Kind (single-select; skills enforce exclusivity; only `kind-slice` is
dispatchable):

- `kind-spec`
- `kind-epic`
- `kind-slice`

Readiness:

- `needs-triage`
- `needs-info`
- `ready-for-agent`
- `ready-for-human`
- `wontfix`

Readiness label policy belongs in repo config. By default, `ready-for-agent`
means the ticket needs no further human refinement before handoff to an
implementation agent. It does not mean unblocked, startable, or assigned to a
specific worker environment. Remove it when the ticket moves to the configured
done state.

Worker environment labels, such as `remote-worker` or `remote-cursor`, are
project config values only. Record them when the repo's tracker uses them; do not
add them as shared defaults. By default, a worker environment label means the
issue is approved to run in that configured environment. It does not mean
unblocked, startable, or implementation-ready.

Risk:

- `risk-normal`
- `risk-security-sensitive`
- `risk-schema`
- `risk-cross-cutting`

These risk labels are dimensions, not severity levels. Add repo-specific risk
labels only when they change routing, checks, approvals, or reviewer assignment.

Review evidence:

- `Code review passed`

By default, `Code review passed` means the latest linked PR head SHA has passed
the configured code review gate for the ticket. Record the PR URL and reviewed
head SHA when applying it. Remove it when the PR head changes, blocking findings
appear, the linked PR changes, or the evidence is missing.

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

Provider location must be query-safe. For Linear, record the team ID and exact
team name or key that the tool accepts. Do not store only a repo slug such as
`agent-paste` unless a read-only tool query proves that slug returns the intended
issues. Record whether the tool uses `status`, `state`, `statusType`, or another
field for workflow filtering.

Do not copy every discoverable agent assignee or integration detail into config.
The tracker remains the source of truth for which agents are currently
assignable. Record only the supported worker delegation paths and repo-specific
routing or continuation details that a future Orchestrator run would otherwise waste
time rediscovering.

Do not verify issue-assigned agents by mutating real implementation issues. Use
read-only tracker metadata, existing verified config, provider documentation, or
a user-approved test issue. If the tracker returns a stable delegate or agent ID
from a real delegation event, record it during refresh so future Orchestrator
runs can use it without probing.

If `docs/agents/triage-labels.md` or a similar label doc exists, update it to
match the config or replace its contents with a pointer to the config. Do not
leave it as a stale partial list. It must cover readiness, risk, review
evidence, type, and any configured area or ownership labels.

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
- verification evidence gathered and critical unknowns remaining
- commands discovered
- tracker routing and labels found or missing
- agent adapters updated
- unknowns left for the user
- validation command run
