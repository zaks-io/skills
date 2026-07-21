---
name: ziw-triage
description: Use for script-guided issue tracker triage when managing the current project backlog, making issues ready for Orchestrator by running workflow scripts, inspecting their outputs, and fixing labels, statuses, dependencies, body contracts, estimates, stale tracker state, and explicit human questions without ad hoc exploration.
argument-hint: "[project-url|team|repo|filter]"
disable-model-invocation: true
---

# Issue Triage

Issue Triage manages the issue tracker backlog so Orchestrator can run. It turns
tracker items into well-shaped, dependency-aware, agent-ready work or explicit
human/To Issues follow-up.

The end state is a useful `Todo` backlog:

- every `Todo` implementation ticket is a one-PR `kind-slice`
- ready work has `ready-for-agent`, the configured route, required labels,
  required estimate, complete body contract, and predicted footprint
- blocked ready work stays in `Todo` with blocker relationships encoded
- not-ready work is labeled or moved to the configured human, intake, parked, or
  To Issues path when config grants that authority
- Orchestrator can consume the final `starts`, blocked-ready list, and next
  actions without re-triaging the same queue

Default triage starts from the configured ready and intake states plus direct
blockers only. In most Linear repos this means `Todo`, `Triage`, and any active
issues that directly block those tickets. Do not include unrelated Linear
`Backlog`, Duplicate, Done, canceled, icebox, or other parked/terminal states by
default.

This skill is script-driven tracker grooming. It is not research,
implementation, code review, repo health monitoring, CI diagnosis, deploy
diagnosis, security scanning, or production triage.

Read only:

- `docs/agents/workflow/config.md`
- source-of-truth specs, roadmap, milestone, and project docs cited by the
  config or scoped tickets
- issue tracker metadata, bodies, comments, labels, statuses, estimates,
  projects, parents, and relationships
- explicit user instructions
- approved workflow script outputs from `skills/ziw-orchestrate/scripts`

Run the scripts, read the output, inspect only the bounded tracker scope and its
cited source-of-truth docs, then fix the tickets. The scripts are the observation
layer for queue, PR, and worker state; the agent does not rediscover that state
manually. No manual code search, implementation file reads, one-off `gh`
queries, CI spelunking, deploy checks, log review, security tool runs, or broad
repo health checks. If handoff quality depends on information that is not in the
tracker, config, cited source-of-truth docs, or script output, leave the exact
missing field for To Issues or a human.

Tracker/MCP tools are for applying ticket mutations and reading specific ticket
fields that the scripts do not return. Do not use MCP calls to rebuild the same
inventory, PR state, dependency frontier, or readiness decisions that the scripts
already compute.

## Inputs

- Issue tracker project, team, repo label, board, roadmap, query, filter, or
  explicit Linear `Backlog` state scope.
- Repo path and `docs/agents/workflow/config.md`.
- Existing tracker statuses, labels, priorities, estimates, dependencies,
  parents, children, duplicates, issue bodies, and comments.
- Optional user instructions for dry run, first-run intake backfill, first-run
  Linear Backlog backfill, Linear Backlog review, intake cleanup, priority
  policy, or orphan routing.

## Context

Read `docs/agents/workflow/config.md` first. If it is missing, run or request
`ziw-setup` before broad cleanup.

Confirm these config values before mutating the issue tracker:

- provider location, project, team, roadmap, and routing label
- status names and mappings
- ready state, intake states, active states, done state, and Linear Backlog
  policy
- readiness, type, risk, review-debt, worker environment, and route labels
- readiness label policy and startable work criteria
- priority policy, estimate policy, dependency policy, and orphan policy
- agent-ready issue body contract
- Issue Triage mutation authority
- dependency graph mechanism and blocker relationship direction

If tracker metadata disagrees with config, update only exact label gaps that are
safe to create. Do not create or rename workflows, statuses, teams, projects,
boards, roadmaps, or label taxonomies without explicit approval.

## Operating Loop

Start each run by choosing one mode:

- default backlog grooming
- explicit issue, project, board, repo label, team, query, or filter
- requested Linear Backlog or intake cleanup
- dry run

A normal `ziw-triage` invocation is a request to process the configured intake
states. Complete implementation-ready intake tickets move from `Triage` to the
configured ready state, usually `Todo`, without requiring the user to separately
say "intake cleanup." Linear `Backlog` remains excluded unless explicitly
requested. A dry run recommends the same transitions without applying them.

Then follow this order:

1. State the bounded tracker scope, skipped states, allowed mutations, and
   ready/Done rules from config.
2. Run the configured workflow scripts before broad tracker reads:
   `../ziw-orchestrate/scripts/tick-snapshot.mjs` for the compact queue snapshot,
   `../ziw-orchestrate/scripts/tick-plan.mjs` for deterministic queue decisions,
   and `../ziw-orchestrate/scripts/linear-dag-start.mjs` for
   dependency/startability. In default mode, pass the configured ready and intake
   states to `tick-snapshot.mjs`, usually `--linear-states Todo,Triage`, so the
   script returns only those states plus their direct blockers. If a script cannot
   run because credentials or inputs are missing, report the exact missing input
   and use tracker tools only for the smallest bounded replacement query.
3. Build the issue set from script output and tracker queries. Read cited
   source-of-truth docs when needed to verify scope or dependency order.
4. Freeze the issue set. Do not expand it because a linked PR, branch, CI run,
   deploy, alert, or code path looks interesting.
5. Classify every issue.
6. Apply safe tracker updates in batches.
7. Re-run the DAG/startability script over the updated issue set when
   implementation `kind-slice` issues are in scope.
8. Report what changed, what remains blocked, and exactly what Orchestrator,
   To Issues, or a human should do next.

If the issue set is empty, report the empty scoped result and stop.

## Decision Routine

Use script and tracker output to choose one action per issue:

- **Fix now**: safe label, status, body, estimate, route, dependency, stale
  readiness, review-evidence, or handoff-field repair is clear.
- **Ready for Orchestrator**: the issue is a one-PR `kind-slice` with body,
  route, readiness, required estimate, dependency encoding, and predicted
  footprint.
- **Blocked but shaped**: the issue is otherwise ready, but
  `linear-dag-start.mjs` reports dependency blockers.
- **Needs To Issues**: the issue is a container, vague plan, multi-PR scope,
  missing split, or missing predicted footprint.
- **Needs human**: product, security, credential, customer, ADR, ownership,
  priority, or acceptance-criteria decision is missing.
- **Orchestrator action**: script output shows linked PR/status/check/review
  state needs active workflow handling that triage should not perform.
- **Park**: the tracker state is intentionally outside the current work queue.

Do not invent a new investigation path. If the next action is not one of these,
record a config gap or ask a specific human question.

Use the script outputs directly:

- `tick-snapshot.mjs` gives the compact queue, linked PR footprint, current heads,
  checks, review state, and Linear queue metadata when credentials are available.
- `tick-plan.mjs` gives ready-state promotions, review-evidence actions,
  human-merge label actions, capacity/dispatch signals, and the deterministic
  next workflow action.
- `linear-dag-start.mjs` gives roots, frontier, starts, blockers, cycles, and
  missing startability requirements.

Triage owns ticket repairs implied by those outputs. Orchestrator owns active
delivery actions implied by those outputs.

## Default Scope

Default triage is `Todo` plus intake grooming in the tracker. Build the default
issue set from configured tracker state and script output, not from ad hoc
exploration:

1. Issues in the configured ready state, usually `Todo`.
2. Issues in configured intake or review-debt intake states that config says
   Issue Triage should normalize, usually `Triage`.
3. Direct active blockers of those ready or intake issues, even when the blocker
   lives outside `Todo` or `Triage`.
4. Non-done issues with the repo routing label that are missing configured
   project, parent, kind, readiness, dependency, or body metadata only when they
   are already in the configured ready or intake states.
5. Issues from workflow script output whose tracker metadata needs repair before
   Orchestrator can use them.
6. Recently updated issues only when they are already in configured ready,
   intake, or active tracker states.

For default mode, the main cleanup target is the configured ready state. If
config says that is `Todo`, make `Todo` the clean Orchestrator handoff queue.

If config treats Linear `Backlog`, icebox, someday, roadmap, or equivalent
states as parked/out-of-work-queue, skip them unless the user explicitly asks
for Linear Backlog review, Linear Backlog cleanup, or Linear Backlog backfill. If
the user says "backlog" generically, follow the repo config's backlog-grooming
scope instead of assuming the Linear `Backlog` status is in scope.

When building readiness-label queues such as `ready-for-agent` or
`ready-for-human`, exclude the configured done state up front unless the user
explicitly asks to audit Done cleanup.

## Classify Issues

Classify each issue into exactly one primary outcome:

- ready for Orchestrator: one-PR `kind-slice`, complete body contract, route,
  labels, dependencies, and required estimate when configured
- blocked but shaped: otherwise ready, with dependency blockers encoded
- needs To Issues: container, spec, epic, vague plan, multi-PR work, missing
  predicted footprint, or missing concrete scope split
- needs human decision: product, security, credential, customer, ADR, ownership,
  priority, or acceptance-criteria decision required
- parked: intentionally not ready for agent work
- duplicate or likely duplicate
- orphan: missing route, project, parent, status, or owner metadata
- config gap: required tracker field or policy is missing from config
- Orchestrator action: script output shows active PR/check/review/status work
  that belongs to Orchestrator

Do not infer scope by reading code or linked artifacts outside the workflow
scripts. If tracker text plus script output does not contain enough information
to classify safely, choose `needs To Issues`, `needs human decision`, or
`config gap`.

## Cleanup

Apply obvious mechanical tracker updates:

- route orphan issues into the configured project, team, repo label, or parent
  when tracker evidence is direct
- add missing configured labels for route, kind, type, risk, readiness, review
  debt, and worker environment when policy allows
- set exactly one `kind-*` value and clear conflicting kind labels
- keep `kind-spec` and `kind-epic` as containers; never mark containers
  `ready-for-agent`
- normalize issue bodies to the configured agent-ready headings
- preserve useful existing text and add missing headings without inventing facts
- add or preserve estimates only when config grants Issue Triage that authority
- encode dependency blockers from tracker relationships or issue text
- remove completed, canceled, duplicate, or unrelated blockers only when tracker
  state makes that direct
- move complete issues from configured intake states to the configured ready
  state during every normal triage run when the issue body is complete
- move complete `ready-for-agent` `kind-slice` issues from explicitly requested
  Linear Backlog cleanup/backfill scope to the configured ready state when
  config grants promotion authority
- leave parked Linear Backlog or equivalent states alone unless explicitly in
  scope
- move or label not-ready `Todo` issues according to config: `needs-info`,
  `ready-for-human`, configured intake, parked, or To Issues input. Do not leave
  vague tickets in `Todo` with no next owner
- remove `ready-for-agent` from vague, duplicate, parent, human-owned,
  multi-outcome, boundary-incomplete, or body-incomplete issues
- mark implementation-ready slices `ready-for-agent` when no further human
  refinement is needed, even if dependency blockers remain
- reconcile stale tracker state only from tracker evidence or approved script
  output, such as a linked PR merged, an active PR needing review state, a
  changed PR head invalidating review evidence, or a terminal ticket retaining a
  readiness label
- clear readiness labels when moving a ticket to the configured done state
- add, remove, or leave review evidence and human-merge labels only when script
  output provides the current PR head, check, review, draft, and unresolved
  thread state required by config
- add a concise tracker comment only when it helps a human or Orchestrator act

Do not close, cancel, reprioritize across projects, rewrite product scope, or
move active workflow states unless config or the user explicitly grants that
authority.

Do not manually verify linked PRs, branch state, CI, deploys, or code. Use only
tracker text and script output. If an issue appears to need verification that the
scripts did not provide, leave an Orchestrator next action such as "verify linked
PR is merged and update status if complete."

## Readiness Contract

An issue can receive `ready-for-agent` only when it is:

- scoped to one PR
- scoped to one primary outcome
- assigned to the configured project, parent, or route
- labeled with one clear kind and required type/risk labels
- estimated when config requires estimates before handoff
- explicit about in-scope and out-of-scope work
- complete enough for Orchestrator to decide startability and dispatch

Required body content:

- outcome
- context docs or tracker links
- likely files, packages, or artifacts
- in scope
- out of scope
- acceptance criteria
- required checks
- security, privacy, data, and operational invariants
- dependencies or blockers
- estimate when config stores estimates in the body

The scope fields must be concrete. `In scope` lists only the behavior, files,
docs, tests, and workflow state this PR may change. `Out of scope` lists
adjacent outcomes, sibling tickets, optional polish, broad refactors, production
actions, and follow-up behavior the worker must not deliver.

Populate likely files, packages, or artifacts only from existing tracker text,
config, To Issues output, or approved script output. Do not search the repo to
discover them. If they are missing, withhold `ready-for-agent` and leave the
issue for To Issues or human clarification.

If an issue carries `ready-for-agent` but the body says it is waiting on human
setup, credentials, provider decisions, security judgment, or a
`ready-for-human` rationale, treat the body as the stronger signal. Remove or
withhold `ready-for-agent`, preserve the exact human decision needed, and report
the contradiction.

## Dependencies

Encode dependencies from bounded, authoritative evidence:

- explicit blocker text in the issue
- tracker parent, child, related, blocker, or duplicate relationships
- accepted sequencing in the scoped project's cited specs, roadmap, milestone,
  or project docs
- concrete producer-before-consumer, schema-before-reader, API-before-client, or
  release-order prerequisites stated by those sources

Use the smallest direct blocker graph that preserves the required order. Remove
terminal blockers when tracker state makes that safe, detect missing direct
edges and cycles, and keep transitive-only edges out unless the tracker requires
them. Do not inspect implementation code, PR diffs, branches, or deploy state to
invent ordering. If the tracker and cited source-of-truth docs still leave the
sequence ambiguous, leave the issue for To Issues or human clarification.

Dependency blockers do not remove `ready-for-agent` or worker-environment
labels. Encode dependency order with tracker relationships, blocker fields, or
the dependencies/body section so Orchestrator can compute startability.

When the frozen scope contains implementation `kind-slice` tickets, run the
dependency/startability script over the snapshot or a compact issue JSON:

```sh
node <skill-dir>/../ziw-orchestrate/scripts/linear-dag-start.mjs <snapshot-or-issues.json> --config <config.json>
```

Use the DAG result to fix the queue:

- `starts`: leave in `Todo` with `ready-for-agent`; include in Orchestrator
  handoff
- `frontier` but not `starts`: repair missing labels, kind, ready state, active
  claim, open-PR metadata, or body fields when safe
- `startableBlockers`: convert each blocker into a ticket repair, a To Issues
  action, a human question, or an Orchestrator next action
- cycles and out-of-scope blockers: encode the correct relationship if direct;
  otherwise mark for human/To Issues

## Human Clarification

Ask the user only when a safe tracker update depends on a concrete decision.
Keep questions short and tied to a specific issue.

If the user is unavailable or the run is non-interactive:

- add the configured human-input label or state
- add one concise tracker comment only when it helps the human answer
- include the exact question or next action in the final report
- leave the issue out of `ready-for-agent`

Never fabricate scope, acceptance criteria, likely files, priority, estimates,
or dependency order to make a ticket look ready.

## Guardrails

- Scripts first, no ad hoc exploration. Use approved workflow scripts and
  tracker tools. Do not do manual code search, implementation file reads, tests,
  one-off `gh` queries, PR list spelunking, branch checks, CI checks, deploy
  checks, production logs, alerts, security scans, package audits, or
  repo-health sweeps.
- Do not implement code, create PRs, merge, deploy, or mutate production.
- Follow only cited source-of-truth project docs for scope and dependency
  analysis. Do not follow PR, CI, deploy, log, or unrelated external links.
- Do not create noisy comments for small label edits.
- Do not create new label taxonomies unless config or the user explicitly names
  them.
- Stop before destructive bulk changes if more than a small number of issues
  would be canceled, closed, moved across projects, or reprioritized.

## Done

Report:

- scripts run, script inputs, and any script fallback used
- tracker scope reviewed and whether the run was dry-run, partial, or applied
- Linear Backlog or intake states skipped or explicitly included
- issues changed, unchanged, parked, and needing human decision
- orphans routed or left with reasons
- labels, priorities, estimates, body contracts, dependency relationships, and
  status recommendations updated
- ready-state issues made agent-ready or left with exact missing fields
- intake/review-debt issues promoted, left for To Issues, parked, or left for a
  human decision
- issues ready for Orchestrator, blocked-but-ready, missing metadata, missing
  body fields, duplicate, cyclic, or config-blocked
- stale tracker state repaired from script output, including Done/readiness,
  review evidence, and human-merge label repairs
- exact Orchestrator next actions for any linked PR/status verification needed
- final `Todo` handoff: starts, blocked-ready, and not-ready tickets removed or
  marked with their exact next owner
- user questions asked or exact human next actions left
