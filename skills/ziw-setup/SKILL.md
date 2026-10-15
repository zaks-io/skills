---
name: ziw-setup
description: Use for workflow setup when setting up or refreshing a repository for agent workflows by creating docs/agents/workflow/config.md with repo commands, planning artifacts, issue tracking, agent adapters, review gates, and environment safety rules.
argument-hint: "[repo-path]"
---

# Setup

Create or refresh `docs/agents/workflow/config.md`, the compact lookup table
used by the other workflow skills. Setup is complete when populated values
have current evidence, existing adapters point to the config, and the handoff
names remaining gaps and blocked workflows.

## Inputs

- Repo path to configure.
- Existing repo rules, CI, package scripts, issue tracker, and deploy docs.
- Existing spec indexes, specs, glossaries, context maps, and ADR conventions.
- Any user-provided tracker, agent access, or environment constraints.

## Steps

1. [Read the baseline](#read-the-baseline), starting with existing config.
2. [Gather evidence](#gather-evidence) from files and available tools.
3. [Verify values](#verify-values) that setup writes or preserves.
4. [Configure the lookup table](#configure-the-lookup-table) with stable values.
5. [Configure tracker defaults](#configure-tracker-defaults) from verified mappings.
6. [Update adapters](#update-adapters) after writing the config.
7. [Report the result](#done), including gaps and blocked workflows.

## Read the baseline

- Run setup once per repo.
- Rerun when the workflow may have changed or the user wants to verify the config.
- If `docs/agents/workflow/config.md` exists, read it before inspecting anything else.
- Use existing config as the baseline for detecting drift and patching the lookup table.
- Use [references/project-config.md](references/project-config.md) as the canonical field index.
- Read only the index sections needed for this repo.

Load other references only for the matching work:

- Changing tracker states, labels, readiness, or issue body shape:
  [references/issue-tracker-contract.md](references/issue-tracker-contract.md).
- Configuring workers, recurring orchestration, or merge-safety policy:
  [references/operating-profile.md](references/operating-profile.md).
- Configuring a Linear + Cursor delegation path:
  [references/linear-cursor-example.md](references/linear-cursor-example.md).
- Updating role responsibilities or agent adapters:
  [references/agent-workflow.md](references/agent-workflow.md).
- Defining or changing cross-agent handoff shape:
  [references/handoff.md](references/handoff.md).
- Configuring unmapped glossary paths:
  [glossary-discovery.md](../ziw-grill/references/glossary-discovery.md) for current and legacy discovery.
- Encountered friction:
  [friction-log.md](../ziw-orchestrate/references/friction-log.md), using the configured complaint store and this role's mutation authority.

### Refresh existing config

- Preserve verified stable values that still match current repo and tracker state.
- Re-verify every populated behavior-affecting field before leaving it authoritative, even if already present.
- Run at least one read-only query against configured tracker IDs and query-safe names before trusting project, team, board, or roadmap mappings.
- Check unresolved tracker setup work, changed commands, renamed labels, moved projects, changed CI, changed worker delegation paths, and changed environment rules.
- Replace stale slugs or display names returning empty tracker results when a verified provider ID or canonical name resolves the same scope.
- Update only missing, stale, wrong, or newly verified fields.
- Report what changed, what stayed verified, and what remains unknown.

### Transfer existing state notes

- When removing state notes, preserve actionable gaps in the configured tracker within the task's write authority.
- Search for duplicates before creating follow-ups.
- Use a bounded query scoped to the configured tracker location and repo route to find prior setup work.
- Search its titles and descriptions for the affected setting before creating a follow-up.
- Use the configured intake route without readiness labels.
- **Exception: no tracker-write authority.** Report the state that still needs transfer.

## Gather evidence

Inspect files that exist and query available tracker tools:

- `AGENTS.md`, `CLAUDE.md`, editor or agent rules, and repo-local skills.
- The target repo's Claude Code integration config, `.claude/*`, and repo-local agent, command, or skill directories Claude should load.
- `package.json`, lockfiles, Makefile, Justfile, turbo config, and CI workflows.
- Project status, roadmap, specs, ADRs, runbooks, and existing `docs/agents/*`.
- Existing agent label docs, such as `docs/agents/triage-labels.md`.
- Code host branch, default branch, PR, preview, and deploy workflows.
- Root `.coderabbit.yaml` when present, especially `reviews.auto_review`.
- Hosted review provider docs or app settings when CodeRabbit, Cursor Bugbot, or another PR review bot is enabled.
- Issue tracker provider, provider location, projects or boards, statuses, labels, issue templates, and existing issue examples through available tracker tools.
- Environment files, deployment config, and service inventories.

## Verify values

Setup is a verification pass. Every populated value that can change agent
behavior needs current evidence from the repo, tracker, code host, CI, agent
integration, environment config, or explicit user instruction.

Verify every populated workflow field that setup writes or preserves:

- Verify repo identity, default branch, branch prefix, package manager, lockfile, and command names from repo files and git metadata.
- Verify install, check, build, test, lint, smoke, preview, and generated-artifact commands from scripts, CI workflows, makefiles, justfiles, runbooks, or direct safe execution.
- Verify planning artifact authority, paths, status convention, and documentation checks from spec indexes, context maps, ADR indexes, scripts, CI, or explicit user instruction.
- Verify tracker provider, location, team/project/board/roadmap, statuses, labels, priorities, estimate fields, relationships, issue templates, and query contracts with read-only tracker calls when tools are available.
- Verify code host default branch, branch protections, PR conventions, linked checks, and open PR query shape through git metadata, code host tools, or workflow files.
- Verify worker delegation paths, environment labels or fields, continuation paths, and remote worker delegation mechanics through tracker metadata, verified config, or explicit user instruction.
- Verify Claude, Codex, editor, and repo-local adapter paths by resolving files, symlinks, imports, and generated skill metadata from a clean path.
- Verify shared skill distribution mode, source, lockfile, refresh command, project paths, symlink layout, and plugin marketplace.
- Verify whether generated skill directories are committed dependencies, ignored local cache, or absent.
- Verify environment safety, deployment paths, hosted checks, preview rules, credential rules, and production approval rules from deployment config, CI, runbooks, or explicit user instruction.

### Commands and evidence gaps

- Prefer exact discovered commands over guesses.
- Omit unverified values, including commands, and report the evidence gap.
- Missing required configuration blocks the affected workflow.
- Name the missing value and its verification source for every gap.
- Put project follow-ups in the configured tracker within authorized scope.
- **Exception: no authority for a follow-up.** Report the required owner and action.
- Name workflows blocked by missing configuration in the final report.

For install, deploy, production mutation, expensive hosted actions, and
credentialed provider actions used only to verify setup:

- Verify that the command or path exists without executing it.
- Report that execution was not performed.
- **Exception: explicit user approval.** You may execute the approved action, subject to [Never](#never)'s production prohibition.

## Configure the lookup table

Create or update `docs/agents/workflow/config.md` using the project-config
template as the canonical field list.

- Keep the config terse: values, paths, commands, IDs, routing, and policies.
- Populate only verified stable values future agents need repeatedly.
- Include repo commands and CI gates, planning authority, tracker mapping and readiness, delegation and capacity, agent access, review/merge authority, environments, safety rules, complaint routing, and handoff shape.
- Query external systems to refresh live state rather than rediscover stable mappings.
- Keep project progress, blockers, verification follow-ups, and TODOs in Linear or the configured issue tracker.
- Read tool availability, CI/PR health, review results, and deployment status live.
- Use status names and IDs to describe workflow schema, not current work state.
- Omit inapplicable fields and verification transcripts.
- Report execution evidence and unresolved work in the handoff and configured tracker rather than repeating the template as prose.
- Preserve configured glossary paths.
- Default new glossaries to `GLOSSARY.md` and multi-context maps to `GLOSSARY-MAP.md`.

### Skill distribution

- Record the mode this repo actually uses: project skills, plugin or marketplace, managed settings, user/global-only, or mixed mode.
- Project-scoped generated `ziw-*` copies are valid when repo, remote, or cloud workers need skills from a fresh clone.
- Treat those copies as vendored generated dependencies from `zaks-io/skills`.
- Update them mechanically.

### Gate parity and unattended work

- Check that local hooks and the required CI job use the same verification entrypoint.
- Record its command and job.
- Flag required checks outside that entrypoint as a config gap, rather than presenting a partial local command as the full gate.
- Preserve exact threshold, environment, and secret-scan scopes.
- Record task caches as trusted.
- Name only specific tasks whose cache keys miss inputs.
- For hosted or unattended workflows, verify environment-enforced hooks, worker continuation, loop limits, and production deploy approval from current evidence.
- Load the operating profile for those policies.
- Store only stable policy.
- Put baseline failures and repair work in the tracker.
- Read current CI health live.
- For complaint routing, prefer the configured MCP writer and verify its exposed schema.
- Use tracker storage only with an explicit fallback.

## Configure tracker defaults

- Find the tracker source of truth in live metadata, verified config, or explicit user instruction.
- Read relevant issue-tracker contract sections when creating or changing mappings.
- Treat its labels as defaults, not proof that the tracker has them.
- Preserve different verified repo conventions.
- Verify exact names and stable IDs with read-only tracker queries.
- Use query-safe provider locations.
- Record status and dependency field names the tool actually accepts.
- Omit missing provider, status, label, estimate, or worker values and report them as evidence gaps.
- Record supported delegation paths and verified continuation handles instead of the full assignee inventory.
- If separate label docs exist, update them to mirror the config or point back to it.
- Keep readiness, risk, review evidence, type, area, and ownership policy consistent.
- Leave the default taxonomy and label treatment rules in the template and tracker contract, without duplicating them here.

## Update adapters

After writing the config, update short adapters when present:

- `AGENTS.md`.
- `CLAUDE.md`.
- Editor or agent rules.
- Repo-local skill usage docs.

For each adapter:

- Tell adapters to read `docs/agents/workflow/config.md` before using workflow skills.
- Keep adapters short and follow the [adapter contract](references/agent-workflow.md).

### Generated skills

- Classify runtime-generated shared `ziw-*` files under `.agents/skills/`, `.claude/skills/`, `.codex/skills/`, or `skills/` when they exist.
- Determine whether they are a committed dependency, symlink fanout, ignored local cache, absent, or repo-authored project-specific skills.
- For committed dependencies, record the source and lockfile and commit mechanical updates.

### Claude Code integration

- Configure the target repo's Claude Code integration, not this skills repo.
- Use that integration as the source of truth for Claude-facing agent, command, and skill registration.
- Configure it to import the target repo's agent markdown.
- Usually use a one-line `CLAUDE.md` `@AGENTS.md` import when supported.
- Symlink repo-local Claude Code paths into the integration location when Claude Code requires exact paths.
- Verify each link target resolves from a clean checkout.
- Report paths Claude Code refuses to follow.
- Track actionable repairs outside config instead of guessing.

## Never

- Do not invent config values.
- Do not preserve stale values merely because they are already present.
- Do not regenerate existing config from scratch during refresh.
- Do not erase explicit human decisions unless current evidence or the user contradicts them.
- Do not turn disabled optional integrations into new work.
- Without tracker-write authority, do not discard state awaiting transfer or substitute a local backlog.
- Do not store live-state snapshots, execution status, execution evidence, unresolved work, tasks, or an `Unknowns` checklist in config.
- Do not run install, deploy, production mutation, expensive hosted actions, or credentialed provider actions just to verify setup unless the user explicitly approved that action.
- Do not test delegation by assigning real implementation work.
- Do not probe assignable agents by mutating real issues.
- Do not test a complaint writer by filing a fictitious event.
- Do not hand-edit downstream generated shared `ziw-*` copies.
- Do not make independent copies in place of importing the target repo's agent markdown.
- Do not include secrets, tokens, signed URLs, customer payloads, or private logs in config.
- Do not deploy or mutate production while setting up config.

## Done

Report:

- Config path written.
- Whether this was first setup or a refresh.
- Whether the config is complete enough to be the workflow lookup table.
- Config fields changed or preserved and evidence gaps reported outside config.
- Workflows blocked by missing configuration and their tracker follow-ups.
- Commands discovered.
- Tracker routing and labels found or missing.
- Agent adapters updated.
- Missing decisions or access requiring the user.
- Validation command run.
