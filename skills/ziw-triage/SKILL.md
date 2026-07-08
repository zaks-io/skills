---
name: ziw-triage
description: Use for issue tracker triage when reconciling current project issues with reality, making Todo tickets agent-ready, applying workflow labels, setting dependencies and configured estimates, normalizing issue bodies, cleaning explicitly requested Linear Backlog review or backfill scope separately from configured intake issues, and updating verified stale states.
argument-hint: "[project-url|team|repo|filter]"
disable-model-invocation: true
---

# Issue Triage

Maintain current issue tracker work so Todo tickets are ready for agents and
tracker state reflects reality. This is tracker metadata cleanup, readiness
repair, and verified state reconciliation, not implementation.

By default, focus on the configured ready state, usually `Todo`, and active or
PR-linked issues that need tracker repair. Skip the Linear `Backlog` state or
equivalent out-of-work-queue tracker states in the default pass, but treat
requested Linear Backlog review, first-run intake backfill, or intake cleanup as
normal Issue Triage work. Intake cleanup does not include Linear `Backlog`
unless the user explicitly asks for Linear Backlog review or backfill. The Linear
`Backlog` state means the user does not want agents working it yet: the work may
be uncommitted, intentionally parked, or not shaped into correct tickets.

If the user asks to clean, review, backfill, or promote Linear Backlog or intake
issues, include the requested states, perform the cleanup below, and leave
delivery to `ziw-orchestrate` after the issues are ready.

Apply safe tracker updates directly. When external state proves the tracker is
stale, such as a linked PR already merged, update the issue to the configured
truthful state such as `Done`. When something is unclear, ask the user if they
are available; otherwise mark the issue with the configured human-input state or
label and return the exact questions or next actions needed.

## Inputs

- Issue tracker project, team, repo, board, roadmap, query, or explicit Linear
  `Backlog` state scope.
- Repo path and `docs/agents/workflow/config.md`.
- Existing tracker teams, projects, statuses, labels, priorities, estimates,
  dependencies, parent or child relationships, PR links, and issue comments.
- Optional user instructions for first-run intake backfill, first-run Linear
  Backlog backfill, dry run, priority policy, Linear Backlog review, intake
  cleanup, or orphan routing.

## Context

Read `docs/agents/workflow/config.md` first. If it is missing, run or request
`ziw-setup` before broad cleanup.

Confirm these config values before mutating the issue tracker:

- provider location, project, team, roadmap, and routing label
- status names and mappings
- readiness, risk, review evidence, type, area, ownership, and worker
  environment labels
- readiness label policy, worker environment label policy, and startable work
  criteria
- priority policy, estimate policy, dependency policy, and orphan policy
- agent-ready issue body contract
- active workflow status transition owner
- Issue Triage intake-state transition authority
- Issue Triage verified-state reconciliation authority
- dependency graph mechanism and blocker relationship direction

If tracker metadata disagrees with config, update only exact label gaps that are
safe to create. Do not create or rename workflows, statuses, teams, projects,
boards, or roadmaps without explicit approval.

## Default Scope

Unless the user asks for Linear Backlog review or Linear Backlog backfill, do not
scan the whole Linear Backlog state. Generic intake cleanup scans configured
intake states, not Linear `Backlog`. Build the default triage set from:

1. Issues in the configured ready state, usually `Todo`.
2. Active issues with linked PRs, branches, blockers, review state, done state,
   or comments that can prove the tracker is stale.
3. Issues with the repo routing label that are already in ready or active
   states but are missing the configured project, parent, or metadata.
4. Issues in the configured review-debt intake filter, label, project, parent,
   or status. Review-created findings are current-work intake even when they are
   not ready to dispatch yet.
5. Recently updated issues only when they are already in ready or active states
   or have direct links to current PRs or branches.

When building any readiness-label queue, including `ready-for-agent` or
`ready-for-human`, add the configured non-done status filter up front. Do not
include `Done` tickets in the initial triage set only because a stale readiness
label remains. If a requested Done audit or direct stale-state evidence brings a
Done ticket into scope, clean the stale readiness label then.

Treat the Linear `Backlog` state, icebox, roadmap, someday, or equivalent
out-of-work-queue tracker states as skipped by default unless explicitly
requested. `Triage` or other intake states are also skipped by default unless
config names them as current work, review-debt intake, or the user asks for
intake cleanup.

## Linear Backlog And Intake Cleanup

Enter this mode when the user asks for Linear Backlog review, Linear Backlog
cleanup, intake cleanup, first-run intake backfill, first-run Linear Backlog
backfill, "get intake ready", "move ready Linear Backlog work to Todo", or
similar tracker cleanup with an explicit source scope.

This is still `ziw-triage` when the requested work is tracker cleanup. Use
`ziw-orchestrate` after cleanup when the user asks to deliver the ready work, or
when an orchestrator tick delegates this triage repair.

For the requested Linear Backlog or intake scope:

- promote now: complete `kind-slice` issues with route, labels, body contract,
  readiness, configured required estimate, worker environment approval, and
  dependency blockers encoded
- needs human review: issues missing product, security, credential, customer,
  ADR, priority, required estimate, or acceptance-criteria decisions
- needs To Issues: `kind-spec`, `kind-epic`, project notes, vague plans, or
  multi-PR work that must be split before dispatch
- leave parked: uncommitted ideas or intentionally parked work the user does not
  want agents working yet
- stale or duplicate: issues contradicted by PR, branch, release, dependency, or
  duplicate evidence

Apply safe updates directly. Move promotable `ready-for-agent` `kind-slice`
issues to the configured ready state, usually `Todo`, when config grants Issue
Triage ready-state promotion authority. For Linear `Backlog` sources, require an
explicit Linear Backlog review or backfill request; generic intake cleanup is not
enough. Do this even when the issue is blocked by another ticket. The Linear
`Backlog` state is not a dependency holding area; dependency order belongs in
tracker blocker relationships or the configured body field. For everything else,
leave the exact human decision, To Issues input, blocker, duplicate target, or
parking reason.

## Inventory

Build a triage set before making changes:

1. Issues in the requested project, board, repo, team, or filter that are in the
   configured ready or active states.
2. Issues with the repo routing label but missing current-work metadata.
3. Active issues linked to PRs, branches, docs, parent issues, blockers, or
   project milestones.
4. Recently created or updated ready or active issues that match repo, package,
   feature, or customer terms from the project.
5. Issues in the configured review-debt intake route, so review findings are
   normalized into dispatchable slices, human decisions, or To Issues input.
6. `Triage`, Linear `Backlog`, or equivalent intake and out-of-work-queue states
   only when explicitly requested or when config explicitly uses them for
   review-debt intake.

If the inventory starts from `ready-for-agent`, `ready-for-human`, or another
readiness label, exclude the configured done state unless the user explicitly
asked to inspect done tickets.

Classify each issue as one of:

- implementation-ready slice
- blocked implementation slice
- needs human product, security, credential, customer, or ADR decision
- duplicate or likely duplicate
- parent, epic, project note, or workstream container
- orphan needing project, parent, routing label, owner, or status
- stale active work needing review
- stale tracker state with verified external evidence

## Cleanup

Apply obvious mechanical updates in batches:

- route orphan issues into the configured project, team, or parent when evidence
  is direct
- make configured ready-state issues, usually `Todo`, match the agent-ready body
  contract, labels, estimates when configured, blockers, and route
- move issues from configured intake states such as `Triage` or equivalent to
  the configured ready state only when the user asked for intake cleanup or
  intake backfill and routing, labels, and the agent-ready body contract are
  complete
- when Linear `Backlog` or intake states are explicitly in scope, move complete
  `ready-for-agent` `kind-slice` issues to the configured ready state; encode
  blockers separately instead of leaving dependency-ready work in the Linear
  `Backlog` state. Linear `Backlog` is explicitly in scope only when the user
  asks for Linear Backlog review or Linear Backlog backfill
- leave Linear `Backlog` or equivalent out-of-work-queue states alone unless the
  user explicitly asks for Linear Backlog review or Linear Backlog backfill
- move issues to the configured done state when linked PR, branch, release, or
  code-host evidence proves the work is merged or otherwise complete
- for Linear + GitHub, assume linked PRs and tickets are synced when both exist;
  refresh both before manually correcting status, because Linear may already have
  advanced the ticket from PR state
- before leaving an issue in `Done`, verify linked PR evidence satisfies the full
  issue scope. If an auto-close integration moved a partial or multi-PR issue to
  `Done`, reopen or recommend narrowing it according to config
- remove `ready-for-agent` or the repo-configured readiness label when moving an
  issue to the configured done state
- recommend moving issues out of done or merge-ready states when current external
  state proves the status is wrong, such as a closed-unmerged PR or reverted work
- add missing routing, type, risk, area, kind, and readiness labels from config
- add or preserve estimates according to the configured estimate policy
- set exactly one `kind-*` value and clear the others; keep `kind-spec` and
  `kind-epic` as containers and never mark a container `ready-for-agent`
- normalize review-created findings: make concrete one-PR findings
  `kind-slice` with `Bug` or `Tech Debt`, route them to the repo, set risk and
  readiness when the body is complete, and leave broader architecture findings
  as containers for To Issues
- flag a container that leaked into the work queue, such as a `kind-spec` or
  `kind-epic` carrying `ready-for-agent` or a startable status
- remove conflicting workflow labels only after the correct replacement is clear
- mark implementation-ready slices with `ready-for-agent` when the repo-configured
  readiness policy says no further human refinement is needed, even if dependency
  blockers remain
- before finalizing readiness labels or ready-state promotion, run the configured
  DAG-start check over the triage scope when `ziw-orchestrate` scripts are
  available. For Linear, prefer
  `node <skill-dir>/scripts/tick-snapshot.mjs --repo <org/repo> --linear-team <KEY>`
  when config names the team and the local Linear wrapper credential is set;
  otherwise build compact tracker issue JSON from read-only tracker evidence.
  Then run
  `node <skill-dir>/scripts/linear-dag-start.mjs <snapshot-or-issues.json> --config <config.json>`.
  Use `starts` as the actually startable set, `frontier` as unblocked but not
  necessarily dispatchable work, and each node's `startableBlockers` to repair
  missing `kind-slice`, `ready-for-agent`, ready-state, blocker, claim, or PR
  labels and statuses. A `starts` issue is still not dispatch-ready until the
  agent-ready body includes the predicted file/package footprint; repair missing
  footprints before handoff or report them as the exact remaining triage action
- apply configured worker environment labels or fields when the repo-configured
  environment policy says that issue may run there; dependency state is not a
  reason to refuse the environment label
- remove `ready-for-agent` from vague, duplicate, parent, human-owned,
  multi-outcome, boundary-incomplete, or body-incomplete issues
- encode blockers before ready-state promotion; recommend the configured blocked
  state only for active work that has already started and should stop
- apply configured review, merge-ready, or blocked states only when the repo
  config gives Issue Triage that authority and current external evidence is
  direct
- remove the configured review evidence label when the linked PR head changed,
  blocking findings exist, the linked PR changed, or reviewed head SHA evidence
  is missing
- remove the configured code-host human-merge PR label when the PR is draft,
  closed, merged, no longer has current clean review evidence, required checks
  are not confirmed passing, required hosted review is pending, or unresolved
  blocking review threads remain
- mark duplicates only when the duplicate relationship is clear and preserve the
  canonical issue

Do not close, cancel, reprioritize across projects, review the Linear Backlog
state, or rewrite scope because an issue looks stale. Leave a concise comment
and use `needs-info` or `ready-for-human` when judgment is required.

Do not stop at a vague recommendation. For each issue that cannot be made
implementation-ready, either ask the user a specific question or leave a
concrete next action such as "confirm acceptance criteria", "choose canonical
duplicate", "approve security scope", or "provide credential owner".

## Self-Healing

Triage is the bulk reconciler. Use model judgment over current evidence to
repair stale or inconsistent tracker state, escalate missing intent or authority,
never leave a silent dead end, and record every fix. For triage specifically:

- Heal across the whole current set in batches: wrong or duplicate `kind-*`,
  stale labels that resolve to verified ones, leaked containers, and statuses
  contradicted by direct external evidence such as a merged PR.
- Escalate intent-level gaps with `needs-info` or `ready-for-human`; never
  fabricate scope, acceptance criteria, or priority to make a ticket look ready.
- Report every heal and every escalated gap in the run report.

## Issue Body

Normalize implementation issues to the repo's agent-ready body contract. Preserve
useful existing text and add missing headings without inventing facts.

An issue can receive `ready-for-agent` only when it is:

- scoped to one PR
- scoped to one primary outcome, with no sibling ticket work hidden in the Done
  state
- assigned to the configured project or route
- labeled with one clear type and risk
- estimated when config requires estimates before handoff
- explicit about in-scope and out-of-scope work
- complete enough for Agent Implement to verify

By default, `ready-for-agent` means the ticket needs no further human refinement
before handoff to an implementation agent. Use the repo config if it defines a
different readiness policy. `ready-for-agent` does not mean dependencies are
clear, and it is not removed only because the issue is blocked by another issue.
It is removed when the issue moves to the configured done state.

Required body content:

- outcome
- context docs
- likely files, packages, or artifacts
- in scope
- out of scope
- acceptance criteria
- required checks
- security, privacy, data, and operational invariants
- dependencies or blockers
- estimate when config stores estimates in the body

The scope fields must be concrete. `In scope` lists only the behavior, files,
docs, tests, and workflow state this PR may change. `Out of scope` lists adjacent
outcomes, sibling tickets, optional polish, broad refactors, production actions,
and follow-up behavior the worker must not deliver. If those boundaries are
missing or contradictory, withhold `ready-for-agent` and leave the exact
clarifying question.

If any required field is unknowable, add the missing heading, ask the specific
question when the user is available, label the issue `needs-info` or
`ready-for-human`, and do not mark it ready.

If an issue carries `ready-for-agent` but the body says it is waiting on human
setup, credentials, provider decisions, security judgment, or a
`ready-for-human` rationale, treat the body as the stronger signal. Remove or
withhold `ready-for-agent`, preserve the exact human decision needed, and report
the contradiction.

When a ticket depends on exact external config, resource IDs, provider names,
label slugs, secret names, or environment values, make sure those hard literals
or their config lookup location are in the body before marking it ready. Prior
comments are not enough for worker handoff.

When deciding whether a ticket should become agent-ready, consider the work type
and risk. Docs, tests, build or CI updates, small local refactors, scoped bugs
with reproduction, and isolated UI changes are good default agent work.
Production, auth, authorization, PII, secrets, payments, destructive data, broad
refactors, cross-repo changes, performance work without benchmarks, and unclear
domain behavior should stay with human planning unless the ticket contains a
clear verification path and config grants the worker environment.

## Human Clarification

Ask the user when direct tracker evidence is not enough to safely update scope,
priority, blockers, security posture, ownership, or acceptance criteria. Keep
questions short and tied to a concrete issue.

If the user is not available or the run is non-interactive:

- mark the issue with the configured human-input label or state
- add one concise tracker comment only when it helps the human answer
- include the exact question or next action in the final report
- leave the issue out of `ready-for-agent`

## Dependencies

Encode dependencies only from evidence:

- explicit blocker text in the issue
- tracker parent, child, related, blocker, or duplicate relationships
- accepted project sequencing from milestones, specs, or roadmap docs
- PR, migration, API, schema, infra, or release ordering that is directly
  implied by the work

Detect cycles, blockers that are done or canceled, parent issues marked ready,
and issues blocked by vague placeholder work. Fix obvious completed blockers.
Escalate ambiguous ordering instead of guessing.

When a blocker has completed, compare the dependent ticket's body against the
landed blocker or sibling PR evidence before declaring it ready to start. If the
body names APIs, files, commands, or mechanics that the landed work removed or
superseded, narrow the residual scope or mark the ticket for human/triage
repair instead of sending stale instructions to an implementation worker.

Do not use dependencies as a reason to withhold or remove `ready-for-agent` or a
configured worker environment label. Encode dependency order with tracker
relationships, blocker fields, body text, or workflow state so Agent
Orchestrator can avoid starting blocked work.

## Dependency Tree

When repairing current work or requested Linear Backlog or intake scope, build a
dependency tree for every implementation-ready `kind-slice` in scope.

- Use the configured relationship direction. By default, if ticket A needs ticket
  B first, A is blocked by B and B blocks A.
- Prefer tracker blocker relationships. If the provider cannot encode them, write
  the configured dependencies or blockers body section with ticket IDs and
  direction.
- Keep dependency-ready slices in the configured ready state, usually `Todo`.
  Blocked ready slices are not startable, but they are still current work.
- Remove blockers that point only to completed, canceled, duplicate, or unrelated
  work when evidence is direct.
- Add missing blocker links when sequencing is directly evidenced by specs,
  parent tickets, migrations, APIs, schema, infra, releases, PRs, or issue text.
- Do not duplicate every transitive edge unless the tracker requires it. Encode
  the smallest clear graph that lets Orchestrator compute the ready frontier.
- Break or escalate cycles. Do not guess through circular blockers.
- Run `linear-dag-start.mjs` after dependency repair and before the final report
  so the summary's newly startable, blocked-but-ready, and label-fix lists come
  from the computed DAG, not only manual inspection.
- Treat the final DAG result as the handoff contract with Orchestrator: Triage
  owns fixing labels, ready state, dependency links, active-claim/open-PR drift,
  and predicted footprints; Orchestrator consumes `starts` plus footprints for
  capacity and collision-safe dispatch.
- Report the roots, blocked ready slices, cycles, and missing human decisions in
  the run summary.

## Priority

Use the configured priority policy. Good signals are:

- user-provided priority
- project priority, milestone order, due date, or initiative priority
- security, data loss, production breakage, or customer-blocking impact
- dependencies that unlock multiple ready issues
- failed PRs or active work that needs repair

Do not turn personal preference into priority. When priority is unclear, leave it
neutral and mark the issue for human triage.

## Estimates

Follow the Estimate Rules in
[../ziw-setup/references/issue-tracker-contract.md](../ziw-setup/references/issue-tracker-contract.md).
Set missing estimates only when current scope is clear and config grants Issue
Triage that authority. Missing estimates block `ready-for-agent` only when
config requires estimates before handoff; otherwise leave the estimate empty
and keep triage focused on body completeness, labels, blockers, and verified
state.

## First Run

For first-run intake or Linear Backlog backfill:

1. Snapshot current project counts by status, label, priority, estimate state,
   dependency state, and readiness.
2. Create missing workflow labels only when names are exact and config-approved.
3. Normalize orphan routing and body headings before setting priorities.
4. Include Linear `Backlog` or equivalent out-of-work-queue states only if the
   user explicitly asked for Linear Backlog review or Linear Backlog backfill.
5. Make readiness and ready-state promotion the final step after labels and body
   contracts are correct. Encode blockers separately; blocker state does not
   decide whether `ready-for-agent` or ready-state promotion applies.
6. Report the before and after counts.

## Guardrails

- Keep comments metadata-only. Do not paste secrets, customer data, logs,
  signed URLs, or credentials into the tracker.
- Do not implement code, create PRs, merge, deploy, or mutate production.
- Do not review Linear `Backlog` or equivalent out-of-work-queue states unless
  the user explicitly asks for Linear Backlog review or Linear Backlog backfill.
- Do not move active issues between workflow states unless config or the user
  explicitly delegates that authority to Issue Triage, or direct external
  evidence proves a terminal state such as merged equals `Done`. When that
  terminal-state repair is made, also remove `ready-for-agent` or the
  repo-configured readiness label. Moving complete issues from configured intake
  states to the configured ready state is allowed only for requested intake
  cleanup or intake backfill.
- When Linear and GitHub are linked, assume synced ticket/PR state when both
  entities exist and avoid redundant manual status changes unless refreshed state
  disagrees.
- Do not create noisy comments for every small label edit. Prefer one summary
  comment when an issue needs explanation.
- Do not create new label taxonomies unless config or the user explicitly names
  them.
- Stop before destructive bulk changes if more than a small number of issues
  would be canceled, closed, moved across projects, or reprioritized.

## Done

Report:

- issue tracker scope reviewed
- whether Linear Backlog or intake states were skipped or explicitly included
- issues changed, unchanged, and needing human decision
- orphans routed or left with reasons
- labels, priorities, estimates, body contracts, dependency tree, and status
  recommendations updated
- ready-state issues made agent-ready or left with exact blockers
- review-debt intake issues normalized, promoted, left for To Issues, or left for
  human decision
- verified stale states reconciled, including merged work marked done
- intake-state issues promoted to the configured ready state, if requested
- issues newly implementation-ready, newly startable, blocked-but-ready, and
  removed from readiness
- duplicates, dependency cycles, stale active work, and config gaps found
- user questions asked or exact human next actions left
- actual next items to do before the remaining issues can become
  implementation-ready or startable
- whether the run was dry-run, partial, or applied
