---
name: ziw-setup
description: Use for workflow setup when setting up or refreshing a repository for agent workflows by creating docs/agents/workflow/config.md with repo commands, planning artifacts, issue tracking, agent adapters, review gates, and environment safety rules.
argument-hint: "[repo-path]"
---

# Setup

Create or refresh `docs/agents/workflow/config.md`, the workflow lookup table.
Finish with verified changes, working adapter links, and named gaps blocking
only the affected workflows.

## Inputs

Repo path, existing config/rules, and the requested setup or refresh scope.

## Steps

1. Read existing config first. On initial setup, use
   [project-config.md](references/project-config.md) as the canonical field index;
   read only applicable sections. On refresh, patch the existing config.
2. [Set verification scope](#set-verification-scope) from the request and evidence of drift.
3. [Verify values](#verify-values) from repo files and read-only provider queries.
4. [Write stable config](#write-stable-config), preserving repo conventions.
5. [Update adapters](#update-adapters) and report changes, checks, and remaining gaps.

## Set verification scope

- Run once per repo, then refresh when workflow changes or the user requests verification.
- **Initial setup or explicit full verification:** verify every applicable field.
- **Scoped refresh:** verify changed or suspect fields and their dependencies.
  Preserve unrelated stable mappings without rediscovering them or claiming
  they were revalidated. An unrelated optional integration does not block this work.
- Evidence of stale commands, renamed labels, moved projects, CI changes,
  delegation changes, or environment changes expands only the affected scope.
- For tracker mappings in scope, make at least one read-only query using the
  configured IDs and query-safe names. Replace stale names only when a verified
  ID or canonical name resolves the same scope.
- Change only missing, stale, wrong, or newly verified fields. Preserve explicit
  human decisions unless current evidence or the user contradicts them.

Load supporting references only for matching work:

- Tracker states, labels, readiness, body shape, or estimates:
  [issue-tracker-contract.md](references/issue-tracker-contract.md).
- Workers, unattended hooks, continuation, loop limits, capacity, or merge safety:
  [operating-profile.md](references/operating-profile.md).
- Linear + Cursor delegation: [linear-cursor-example.md](references/linear-cursor-example.md).
- Role responsibilities or adapters: [agent-workflow.md](references/agent-workflow.md).
- Handoff shape: [handoff.md](references/handoff.md).
- Unmapped glossary paths: [glossary-discovery.md](../ziw-grill/references/glossary-discovery.md).
- Encountered friction: [friction-log.md](../ziw-orchestrate/references/friction-log.md),
  using the configured complaint store and this role's authority.

## Verify values

Use current evidence for fields within the verification scope:

- Repo rules, package scripts, lockfiles, Make/Just/Turbo files, Git metadata,
  and CI establish identity, package manager, commands, generated artifacts,
  default branch, PR conventions, and gates. Code-host queries establish
  branch protections, linked checks, and PR query shapes when needed.
- Spec indexes, glossaries, context maps, ADRs, runbooks, and user instruction
  establish planning authority, paths, status conventions, and documentation checks.
- Read-only tracker calls establish provider location, projects/boards/teams,
  statuses, labels, priorities, estimates, relations, templates, and query contracts.
  Record exact query-safe names, stable IDs, and accepted field names.
- Tracker metadata, verified config, or user instruction establish delegation,
  environment labels, continuation handles, and remote worker mechanics. Record
  supported paths, not a full assignee inventory.
- Resolve target-repo Claude/Codex/editor files, symlinks, imports, and generated
  metadata from a clean path. Verify distribution mode, source, lockfile,
  refresh command, project paths, symlink layout, and plugin marketplace.
- Deployment/environment config, CI, runbooks, service inventories, and user
  instruction establish preview rules, hosted checks, credentials, and production approval.
- For enabled hosted review, inspect provider config, docs, or app settings.
  CodeRabbit's root `.coderabbit.yaml` maps `reviews.auto_review`.

Commands may be verified from their definitions without execution. Do not run
install, deploy, expensive hosted actions, or credentialed provider actions
solely to verify setup without explicit approval. Read-only metadata queries
use existing authorized access. Report which commands were not executed.

For in-scope values that cannot be verified, omit the value and name the missing
evidence. Required gaps block only their affected workflow. Track actionable
follow-ups within write authority; otherwise report the owner and action.

### Gate parity

- Map hooks, local checks, and required CI jobs to their actual commands. Name
  gaps when the local entrypoint omits required tasks; preserve thresholds,
  environment requirements, and secret-scan scope.
- Record trusted task caches and only specific tasks whose cache keys miss inputs.
- Verify unattended enforcement and production approval through the operating profile.
- Prefer the configured MCP complaint writer; inspect its schema without filing
  a fictitious event. Tracker fallback requires explicit configuration.

## Write stable config

- Keep repeatedly needed values, paths, commands, IDs, routing, limits, and policies terse.
  Include applicable planning, tracker/readiness, delegation, agent access,
  review/merge, environment safety, complaint, and handoff mappings.
- Use the tracker contract's taxonomy as defaults, not proof labels exist.
  Preserve verified repo conventions and keep separate label docs aligned with config.
- Keep readiness, risk, review evidence, type, area, and ownership policy consistent.
- Preserve glossary paths; default new glossaries to `GLOSSARY.md` and
  multi-context maps to `GLOSSARY-MAP.md`.
- Record actual skill distribution: project, plugin/marketplace, managed,
  user/global, or mixed. Classify generated `ziw-*` copies as committed
  dependencies, symlink fanout, ignored cache, absent, or repo-authored skills.
  Committed generated dependencies retain source/lockfile and update mechanically.
- Store project progress, blockers, baseline failures, and verification follow-ups
  in the tracker. Read CI/PR/review/deploy health and provider availability live.
  Status names and IDs describe schema, not current work state.

When removing existing state notes, preserve actionable gaps outside config.
Search prior setup titles/descriptions with a bounded query scoped to the tracker
location and repo route. Within write authority, transfer nonduplicates to the
configured intake without readiness labels. Otherwise preserve the notes awaiting
transfer and report the required action. Disabled optional integrations stay disabled.

## Update adapters

- Update existing `AGENTS.md`, `CLAUDE.md`, editor/agent rules, and local usage
  docs to read config before workflow skills. Keep them short using the adapter reference.
- Configure the target repo's Claude integration, not this skills repo. Use its
  registration rules and import its agent Markdown, usually one-line `@AGENTS.md`.
- Symlink only where that integration requires exact paths; verify targets from
  a clean checkout. Report refused paths and track repairs instead of guessing.

## Never

- Invent values, retain contradicted values, regenerate existing config from
  scratch, or turn disabled optional integrations into work.
- Store state snapshots, execution evidence, tasks, transcripts, or an `Unknowns`
  checklist in config.
- Discard state awaiting transfer or substitute a local backlog when
  tracker-write authority is absent.
- Probe workers by assigning real implementation issues, or test complaint storage
  with fictitious events.
- Hand-edit downstream generated skills or copy agent Markdown instead of importing it.
- Include secrets, tokens, signed URLs, customer payloads, or private logs in config.
- Deploy or mutate production while setting up config.

## Done

Report config path, initial/full/scoped mode, fields verified/changed/preserved,
adapters and commands found, executed checks, gaps and authorized follow-ups,
and whether the affected workflow can proceed. Do not claim whole-config
verification after a scoped refresh.
