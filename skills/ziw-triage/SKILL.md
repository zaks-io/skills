---
name: ziw-triage
description: Use for script-guided issue tracker triage when managing the current project backlog, making issues ready for Orchestrator by running workflow scripts, inspecting their outputs, and fixing labels, statuses, dependencies, body contracts, estimates, stale tracker state, and explicit human questions without ad hoc exploration.
argument-hint: "[project-url|team|repo|filter]"
---

# Issue Triage

Prepare a clean `Todo` handoff queue so Orchestrator can run.
Finish with well-shaped, dependency-aware, agent-ready work and exact human,
To Issues, or Orchestrator next actions for everything else.

## Inputs

- An issue tracker project, team, repo label, board, roadmap, query, filter, or
  explicit Linear `Backlog` state scope.
- The repo path and `docs/agents/workflow/config.md`.
- Existing tracker statuses, labels, priorities, estimates, dependencies,
  parents, children, duplicates, issue bodies, and comments.
- Optional instructions for dry run, first-run intake or Linear Backlog
  backfill, Linear Backlog review, intake cleanup, priority policy, or orphan
  routing.

## Steps

1. [Confirm config and scope](#confirm-config-and-scope).
2. [Run scripts](#run-scripts) before broad tracker reads.
3. [Build and freeze the issue set](#build-and-freeze-the-issue-set).
4. [Classify issues](#classify-issues) and identify safe repairs.
5. [Apply tracker repairs](#apply-tracker-repairs) in batches.
6. [Check dependencies](#check-dependencies) over the updated set.
7. [Resolve human questions](#resolve-human-questions).
8. [Report the handoff](#done).

## Confirm config and scope

- Read config first. If it is missing, run or request `ziw-setup` before broad
  cleanup.
- Before tracker mutations, confirm each config group below.
- State the bounded scope, skipped states, allowed mutations, and ready and
  Done rules from config.
- Choose one mode: default grooming; an explicit issue, project, board, repo
  label, team, query, or filter; requested Linear Backlog or intake cleanup;
  or dry run.
- For encountered friction, use [friction-log.md](../ziw-orchestrate/references/friction-log.md)
  with the configured complaint store and this role's mutation authority.

### Config to confirm

- Provider location, project, team, roadmap, and routing label.
- Status names and mappings.
- Ready, intake, active, and done states and Linear Backlog policy.
- Readiness, type, risk, review-debt, worker environment, and route labels.
- Readiness label policy and startable work criteria.
- Priority, estimate, dependency, and orphan policies.
- Agent-ready body contract.
- Issue Triage mutation authority.
- Dependency graph mechanism and blocker direction.

If tracker metadata disagrees with config, create only exact label gaps that
are safe to create. The approval limits are in [Never](#never).

### Default scope

- A normal `ziw-triage` invocation is a request to process the configured intake
  states. No separate intake-cleanup request is needed.
- Move complete implementation-ready intake tickets from `Triage` to the
  configured ready state, usually `Todo`.
- Linear `Backlog` remains excluded unless explicitly requested.
- **Dry run:** recommend the same transitions without applying them.

Build the default issue set from config and script output. Include:

- Issues in the configured ready state, usually `Todo`. This is the main
  cleanup target and becomes the clean Orchestrator handoff queue.
- Issues in configured intake or review-debt intake states that config says
  Issue Triage normalizes, usually `Triage`.
- Active or PR-linked issues in configured current-work scope only when tracker
  or script evidence shows stale status, review, claim, or handoff metadata
  that triage may repair.
- Direct active blockers of those ready, intake, active, or PR-linked issues,
  even outside `Todo` or `Triage`.
- Non-done issues with the repo routing label, already in configured ready or
  intake states, missing configured project, parent, kind, readiness,
  dependency, or body metadata.
- Issues from script output whose tracker metadata needs repair before
  Orchestrator can use them.
- Recently updated issues only when already in ready, intake, or active states.

Default exclusions and their exceptions:

- Skip unrelated Duplicate, Done, canceled, and other terminal states, and
  Linear `Backlog`, icebox, someday, roadmap, or equivalent configured parked states.
- **Exception:** include those parked states when the user explicitly asks for
  Linear Backlog review, cleanup, or backfill.
- A generic "backlog" request follows repo config's backlog-grooming scope.
  It does not select the Linear `Backlog` status.
- Exclude the configured done state from readiness-label queues such as
  `ready-for-agent` or `ready-for-human`.
- **Exception:** include it when the user explicitly asks to audit Done cleanup.

## Run scripts

- Run scripts before broad tracker reads. They are the observation layer for
  queue, PR, and worker state.
- Use `../ziw-orchestrate/scripts/tick-snapshot.mjs` for the compact queue
  snapshot.
- Use `../ziw-orchestrate/scripts/tick-plan.mjs` for deterministic queue decisions.
- Use `../ziw-orchestrate/scripts/linear-dag-start.mjs` for dependencies and
  startability.
- Pass the configured repo, tracker team, route label, and ready and intake
  states to `tick-snapshot.mjs`, usually `--linear-states Todo,Triage`.
  This bounds the queue and its direct blockers.
- Build compact JSON config and queue inputs from verified Markdown config
  values, per the [planner input contract](../ziw-orchestrate/references/planner-input.md).
- Plan from normal compact output. `--pretty` only changes formatting;
  `--debug` is for diagnosing planner decisions.
- **Missing credentials or inputs:** report the exact missing input. Use tracker
  tools only for the smallest bounded replacement query.

### Evidence boundary

Read only:

- `docs/agents/workflow/config.md`.
- source-of-truth specs, roadmap, milestone, and project docs cited by config
  or scoped tickets.
- Issue tracker metadata, bodies, comments, labels, statuses, estimates,
  projects, parents, and relationships.
- Explicit user instructions.
- Approved workflow script outputs from `skills/ziw-orchestrate/scripts`.
- Filenames from the bounded location lookup below.

Use tracker/MCP tools only to apply mutations and read specific ticket fields
that scripts do not return. The inventory and investigation limits are in
[Never](#never).

- When handoff quality needs information outside this boundary, route the exact
  missing field to To Issues. Ask a human only for intent, decisions, or access
  the available evidence cannot supply.
- When scripts omit needed verification, leave an Orchestrator next action.
  For example, "verify linked PR is merged and update status if complete."

### Tracker call budget

Linear allows 2,500 API requests per hour per user, shared by every agent,
sandbox, and host job. One hosted-MCP call costs about four requests.
Four triage runs reading issues one at a time exhausted the hour in 13 minutes.
Keep each run to a few dozen tracker calls.

- If the snapshot skips Linear, make one bounded `list_issues` query, or stop
  and report the missing credential.
- Read only fields needed for a decision, for issues that need them.
- Call `save_issue` only when a field changes. Put all changes for that issue
  in one call.
- Treat the mutation response as the result, without rereading it.
- On `rate_limited`, HTTP 429, or `upstream credential rejected for linear`,
  stop every tracker call. Report the exact pending changes.

### Script outputs and ownership

- `tick-snapshot.mjs` returns the compact queue, linked PR footprint, current
  heads, checks, review state, and Linear queue metadata when credentials exist.
- `tick-plan.mjs` returns ready-state promotions, review-evidence and human-merge
  label actions, capacity and dispatch signals, and the deterministic next
  workflow action.
- `linear-dag-start.mjs` returns roots, frontier, starts, blockers, cycles, and
  missing startability requirements.
- Triage owns ticket repairs implied by these outputs.
- Orchestrator owns active delivery actions implied by them.

## Build and freeze the issue set

- Build the issue set from script output and targeted tracker queries.
- Include configured active or PR-linked issues only when output or tracker
  fields show state, review, claim, or metadata needing reconciliation.
- Read cited source-of-truth docs when needed to verify scope or dependency order.
- If a reconciliation target or any direct `blockedBy` record is missing from
  the snapshot, fetch those records with one bounded tracker query.
- Add those records to `linear.activeIssues` in the compact input before
  freezing the set, then rerun the planner and DAG scripts.
- Freeze the issue set before classification and repairs. See [Never](#never)
  for the expansion limits.
- If the set is empty, report the empty scoped result and stop.

## Classify issues

Identify every clear, safe repair to apply in [Apply tracker repairs](#apply-tracker-repairs):
label, status, body, estimate, route, dependency, stale readiness, review
evidence, or handoff field. Give each issue exactly one primary outcome:

- **Ready for Orchestrator:** a one-PR `kind-slice` meeting the readiness
  contract, with encoded dependencies and likely files, packages, or artifacts
  in its body.
- **Blocked but shaped:** otherwise ready, with dependency blockers reported
  by `linear-dag-start.mjs` and encoded.
- **Needs To Issues:** a container, spec, epic, vague plan, multi-PR work, missing
  concrete scope split, missing likely files/packages/artifacts in the body,
  or a fragment to merge as defined below.
- **Needs human decision:** a missing product, security, credential, customer,
  ADR, ownership, priority, or acceptance-criteria decision.
- **Orchestrator action:** script output shows active PR, check, review, or
  status work that belongs to Orchestrator.
- **Parked:** tracker state is intentionally outside the current work queue,
  or the issue is intentionally not ready for agent work.
- **Duplicate:** a duplicate or likely duplicate.
- **Orphan:** missing route, project, parent, status, or owner metadata.
- **Config gap:** a required tracker field or policy is missing from config.

If tracker text and script output cannot classify an issue safely, choose
needs To Issues, needs human decision, or config gap.

### Fragments

- A fragment is a scaffold, single layer, step, or the tests or docs for an
  unmerged sibling's behavior, with no split reason in its body separating
  it from that sibling.
- A dependency on a sibling alone is not a fragment.
- Work for behavior that already shipped stands alone.
- **Exception to Needs To Issues:** a fragment To Issues left `needs-info`
  behind a partner that is claimed, active, or linked to an open PR needs
  human decision until the partner is Done. Then it needs To Issues.

### Readiness contract

An issue can receive `ready-for-agent` only when all of these hold:

- It is scoped to one PR and one primary outcome.
- It is not a fragment as defined in the issue tracker contract.
- It is assigned to the configured project, parent, or route.
- It has one clear kind and the required type and risk labels.
- It is estimated when config requires estimates before handoff.
- It has concrete in-scope and out-of-scope boundaries.
- It is complete enough for Orchestrator to decide startability and dispatch.

Required body fields: outcome; context docs/tracker links; likely files,
packages, or artifacts; in scope; out of scope; acceptance criteria; required
checks; security/privacy/data/operational invariants; dependencies/blockers;
and estimate when config stores it in the body.

Scope and source rules:

- `In scope` lists only behavior, files, docs, tests, and workflow state this
  PR may change.
- `Out of scope` lists adjacent outcomes, sibling tickets, optional polish,
  broad refactors, production actions, and follow-up behavior the worker must
  not deliver.
- Take likely files, packages, or artifacts only from tracker text, config,
  To Issues output, approved script output, or the bounded lookup below.
- **Conflicting readiness:** the body wins over `ready-for-agent` when it says
  the issue waits on human setup, credentials, provider decisions, security
  judgment, or a `ready-for-human` rationale.
- Remove or withhold `ready-for-agent` in that case. Preserve the exact human
  decision needed and report the contradiction.

### Missing locations

If the only missing field is likely files/packages/artifacts and scope,
non-goals, and acceptance are already clear, make one location-only lookup
inside the assigned repo/package. Use `rg --files` or `rg -l -F` for a literal
or component named by the ticket; collect filenames, not implementation contents.
Record an unambiguous result in the body and continue normal readiness checks.

If the result is absent or ambiguous, withhold `ready-for-agent` and route only
that lookup to To Issues. Keep the accepted ticket boundaries; do not restart
planning or ask a human solely to find a path. This exception grants no code
inspection, dependency inference, tests, or broader inventory.

## Apply tracker repairs

Apply obvious mechanical updates in batches, within config and user authority:

- Route orphans into the configured project, team, repo label, or parent when
  tracker evidence is direct.
- Add missing configured route, kind, type, risk, readiness, review-debt, and
  worker environment labels when policy allows.
- Set exactly one `kind-*` value and clear conflicting kind labels.
- Keep `kind-spec` and `kind-epic` as containers.
- Normalize bodies to configured agent-ready headings. Preserve useful existing
  text and add missing headings without inventing facts.
- Add or preserve estimates only when config grants Issue Triage that authority.
- Encode dependency blockers from tracker relationships or issue text.
- Repoint a duplicate blocker to its open canonical issue only when tracker
  state makes that direct.
- Remove completed, canceled, or unrelated blockers only when tracker state
  makes that direct.
- Move complete `kind-slice` issues from configured intake states to the
  configured ready state during every normal triage run when the full readiness
  contract is complete, including required labels, route, estimate, body,
  and `ready-for-agent`.
- **Explicit Linear Backlog cleanup or backfill:** move complete
  `ready-for-agent` `kind-slice` issues to the configured ready state when
  config grants promotion authority.
- Leave parked Linear Backlog or equivalent states alone unless explicitly
  in scope.
- Move or label not-ready `Todo` issues per config: `needs-info`,
  `ready-for-human`, configured intake, parked, or To Issues input.
- Remove `ready-for-agent` from vague, duplicate, parent, human-owned,
  multi-outcome, fragment, boundary-incomplete, or body-incomplete issues.
- Mark implementation-ready slices `ready-for-agent` when no further human
  refinement is needed, even if dependency blockers remain.
- Reconcile stale tracker state only from tracker evidence or approved script
  output. Examples include a merged linked PR, an active PR needing review
  state, a changed PR head invalidating review evidence, or a terminal ticket
  retaining a readiness label.
- Clear readiness labels when moving a ticket to the configured done state.
- Add, remove, or leave review evidence and human-merge labels only when script
  output provides the current PR head, check, review, draft, and unresolved
  thread state config requires.
- Add a concise tracker comment only when it helps a human or Orchestrator act.

## Check dependencies

Encode dependencies only from bounded, authoritative evidence:

- Explicit blocker text in the issue.
- Tracker parent, child, related, blocker, or duplicate relationships.
- Accepted sequencing in the scoped project's cited specs, roadmap, milestone,
  or project docs.
- Concrete producer-before-consumer, schema-before-reader, API-before-client,
  or release-order prerequisites stated by those sources.

Graph rules:

- Use the smallest direct blocker graph that preserves required order.
- Remove terminal blockers when tracker state makes that safe.
- Detect missing direct edges and cycles.
- Keep transitive-only edges out unless the tracker requires them.
- If tracker and cited source-of-truth docs leave sequence ambiguous, leave
  the issue for To Issues or human clarification.
- Dependency blockers never remove `ready-for-agent` or worker-environment
  labels.
- Encode order with tracker relationships, blocker fields, or the dependencies
  body section so Orchestrator can compute startability.

When frozen scope contains implementation `kind-slice` tickets, rerun the DAG
script over the updated snapshot or compact issue JSON:

```sh
node <skill-dir>/../ziw-orchestrate/scripts/linear-dag-start.mjs <snapshot-or-issues.json> --config <config.json>
```

Use its results to fix the queue:

- `starts`: verify the full readiness contract before leaving the issue in
  `Todo` with `ready-for-agent` for Orchestrator.
- `frontier` but not `starts`: repair missing labels, kind, ready state, active
  claim, open-PR metadata, or body fields when safe.
- `startableBlockers`: turn each blocker into a ticket repair, To Issues action,
  human question, or Orchestrator next action.
- Cycles and out-of-scope blockers: encode the correct relationship if direct.
  Otherwise mark for a human or To Issues.

The DAG checks label and state eligibility, not body completeness.
Missing structured footprint data in the snapshot differs from missing likely
files/packages/artifacts in the body. Orchestrator owns footprint derivation and
collision-safe dispatch, including the unknown-footprint lane its policy allows.

## Resolve human questions

- Ask the user only when a safe tracker update depends on a concrete decision.
  Use a short question tied to a specific issue.

**User unavailable or non-interactive run:**

- Add the configured human-input label or state.
- Add one concise tracker comment only when it helps the human answer.
- Include the exact question or next action in the final report.
- Leave the issue out of `ready-for-agent`.

## Never

- Go beyond script-driven tracker grooming into research, implementation, code
  review, repo health monitoring, CI or deploy diagnosis, security scanning,
  or production triage.
- Implement code, create PRs, merge, deploy, or mutate production.
- Leave the evidence boundary or invent a new investigation path.
- Use code search beyond the location-only exception, implementation file reads,
  tests, one-off `gh` queries,
  PR list spelunking, branch, CI, or deploy checks, logs, alerts, security
  scans, package audits, or repo-health sweeps.
- Follow PR, CI, deploy, log, or unrelated external links.
- Do not inspect implementation code, PR diffs, branches, or deploy state to invent ordering.
- Infer scope from code or linked artifacts outside workflow scripts.
- Manually rebuild inventory, PR state, dependency frontier, or readiness
  decisions that scripts already compute.
- Read issues one by one to rebuild the queue, or call `get_issue` or
  `list_comments` for every issue.
- Retry tracker calls after `rate_limited`, HTTP 429, or
  `upstream credential rejected for linear`.
- Pass `docs/agents/workflow/config.md` to a script's `--config` flag.
- Fetch blockers of reconciliation targets' direct blockers, or unrelated
  parked and terminal issues, when filling snapshot gaps.
- Expand the frozen issue set because a linked PR, branch, CI run, deploy,
  alert, or code path looks interesting.
- Mark `kind-spec` or `kind-epic` containers `ready-for-agent` or promote them.
- Leave vague tickets in `Todo` with no next owner.
- Add noisy tracker comments for small label edits.
- Fabricate scope, acceptance criteria, likely files, priority, estimates, or
  dependency order to make a ticket look ready.
- Create or rename workflows, statuses, teams, projects, boards, roadmaps, or
  label taxonomies without explicit approval.
- Create new label taxonomies unless config or the user explicitly names them.
- Close, cancel, reprioritize across projects, rewrite product scope, or move
  active workflow states unless config or the user explicitly grants authority.
- Make destructive bulk changes if more than a small number of issues would
  be canceled, closed, moved across projects, or reprioritized. Stop before them.

## Done

The final `Todo` queue has:

- Only one-PR `kind-slice` implementation tickets.
- Ready work with `ready-for-agent`, configured route, required labels and
  estimate, complete body contract, and predicted footprint.
- Blocked ready work still in `Todo`, with blocker relationships encoded.
- Not-ready work labeled or moved to the configured human, intake, parked, or
  To Issues path when config grants authority.
- Final `starts`, a blocked-ready list, and next actions Orchestrator can
  consume without re-triaging the same queue.

Report scope/mode, scripts/inputs/fallbacks, changes and unchanged/parked issues,
and the final starts, blocked-ready list, and not-ready tickets with exact gaps
and owners. Include orphan, duplicate, cycle, config, stale-state, intake, and
review-debt outcomes only when present. Name any pending PR/status verification
for Orchestrator and material questions for humans; avoid empty report categories.
