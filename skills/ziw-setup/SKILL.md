---
name: ziw-setup
description: Use for workflow setup when setting up or refreshing a repository for agent workflows by creating docs/agents/workflow/config.md with repo commands, planning artifacts, issue tracking, agent adapters, review gates, and environment safety rules.
argument-hint: "[repo-path]"
---

# Setup

Create or refresh `docs/agents/workflow/config.md`, the workflow lookup table.
Finish with verified mappings, working adapters, and gaps blocking only affected workflows.

## Inputs

Repo path, existing config/rules, and requested setup or refresh scope.

## Steps

1. Read existing config. Initially use [project-config.md](references/project-config.md)
   as the field index; load applicable sections. On refresh, patch existing config.
2. [Set verification scope](#set-verification-scope) from the request and drift evidence.
3. [Verify values](#verify-values) through repo files and read-only provider queries.
4. [Write stable config](#write-stable-config), preserving conventions and decisions.
5. [Update adapters](#update-adapters); report checks, changes, and gaps.

## Set verification scope

- Run initially, then refresh for workflow changes or requested verification.
- Initial setup or explicit full verification covers every applicable field.
- Scoped refresh covers changed/suspect fields and dependencies. Preserve unrelated
  stable mappings without claiming revalidation; optional unrelated integrations do not block.
- Stale commands, renamed labels, moved projects, CI, delegation, or environment
  changes expand only affected scope.
- For in-scope tracker mappings, make a read-only query with configured IDs/query-safe
  names. Replace stale names only with verified equivalents for the same scope.
- Change missing, stale, wrong, or newly verified fields. Preserve explicit human
  decisions unless the user or current evidence contradicts them.

Load references only for matching work:

- Tracker states, labels, readiness, bodies, estimates:
  [issue-tracker-contract.md](references/issue-tracker-contract.md).
- Workers, unattended hooks, continuation, loop limits, capacity, merge safety:
  [operating-profile.md](references/operating-profile.md).
- Linear + Cursor: [linear-cursor-example.md](references/linear-cursor-example.md).
- Roles/adapters: [agent-workflow.md](references/agent-workflow.md).
- Handoffs: [handoff.md](references/handoff.md).
- Unmapped glossaries: [glossary-discovery.md](../ziw-grill/references/glossary-discovery.md).

**Friction:** file encountered friction with the configured complaint tool, once per distinct issue and without secrets. Load [friction-log.md](../ziw-orchestrate/references/friction-log.md) only for a tracker fallback, orchestrator event categories, or a run rollup.

## Verify values

Use current evidence within scope:

- Repo rules, package scripts/lockfiles, Make/Just/Turbo, Git, and CI establish
  identity, commands, generated artifacts, branch/PR conventions, and gates.
  Query code-host protections, linked checks, and PR query shapes when needed.
- Specs, glossaries/context maps, ADRs, runbooks, and user instructions establish
  planning authority, paths, status conventions, and documentation checks.
- Read-only tracker calls establish location, projects/boards/teams, statuses,
  labels, priorities, estimates, relations, templates, and query contracts.
  Record exact query-safe names, stable IDs, and accepted fields.
- Tracker metadata, verified config, or user instructions establish delegation,
  environment labels, continuation handles, and remote mechanics. Record supported
  paths rather than a full assignee inventory.
- Resolve target-repo Claude/Codex/editor files, imports, symlinks, and generated
  metadata from a clean path. Verify distribution source/mode, lockfile, refresh
  command, project paths, symlink layout, and marketplace.
- Deployment config, CI, runbooks, service inventories, and user instructions
  establish preview/hosted-check rules, credentials, and production approval.
- Verify enabled hosted review from provider config/docs/settings.
  CodeRabbit root `.coderabbit.yaml` maps `reviews.auto_review`.

Verify commands from definitions when sufficient; report unexecuted commands.
Read-only metadata queries use existing authorized access. Omit unverifiable
values and name missing evidence. Track authorized actionable follow-ups;
otherwise report owner/action. Required gaps block only affected workflows.

### Gate parity

- Map hooks, local checks, and required CI jobs to commands. Flag missing local
  tasks; preserve thresholds, environment requirements, and secret-scan scope.
- Trust configured task caches; list only specific tasks whose keys miss inputs.
- Verify unattended enforcement and production approval through the operating profile.
- Prefer the configured MCP complaint writer. Inspect its schema without fictitious
  events; tracker fallback needs explicit configuration.

## Write stable config

- Keep reusable values, paths, commands, IDs, routing, limits, and policies terse.
  Include applicable planning, tracker/readiness, delegation, access, review/merge,
  environment safety, complaint, and handoff mappings.
- Tracker taxonomy supplies defaults, not evidence labels exist. Preserve verified
  conventions and align separate label docs with config.
- Keep readiness, risk, review evidence, type, area, and ownership policy consistent.
- Preserve glossary paths. New defaults are `GLOSSARY.md` and, across contexts, `GLOSSARY-MAP.md`.
- Record project, plugin/marketplace, managed, user/global, or mixed skill distribution.
- Classify generated `ziw-*` copies as committed dependencies, symlink fanout,
  ignored cache, absent, or repo-authored. Retain source/lockfile for committed
  generated dependencies and update mechanically.
- Store progress, blockers, baseline failures, and verification follow-ups in the tracker.
  Read CI/PR/review/deploy health and provider availability live; names/IDs describe schema.
- Before removing state notes, search prior setup titles/descriptions with a bounded,
  tracker-location/repo-route query. Transfer nonduplicates to configured intake
  without readiness labels when authorized. Otherwise preserve notes and report the action.

## Update adapters

- Point existing `AGENTS.md`, `CLAUDE.md`, editor rules, and usage docs to config
  before workflow skills. Use the role reference to keep adapters short.
- Follow the target repo's Claude registration rules and import its agent Markdown,
  usually one-line `@AGENTS.md`.
- Symlink only required exact paths; verify targets from a clean checkout.
  Report refused paths and track repairs without guessing.

## Never

- Invent or retain contradicted values, or activate disabled optional integrations.
- Store state snapshots, execution evidence, tasks, transcripts, or `Unknowns` in config.
- Discard state awaiting transfer or substitute a local backlog without tracker-write authority.
- Assign real implementation issues to probe workers or file fictitious complaints.
- Hand-edit generated downstream skills.
- Include secrets, tokens, signed URLs, customer payloads, or private logs in config.
- Run install, deploy, expensive hosted, or credentialed provider actions solely
  for setup verification without explicit approval. Authorized read-only metadata queries are allowed.
- Deploy or mutate production during setup.

## Done

Report config path, initial/full/scoped mode, fields verified/changed/preserved,
adapters, commands, executed checks, gaps, authorized follow-ups, and affected-workflow
readiness. Scoped refresh does not establish whole-config verification.
