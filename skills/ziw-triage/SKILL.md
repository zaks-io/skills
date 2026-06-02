---
name: ziw-triage
description: Use for issue tracker triage when reconciling current project issues with reality, making Todo tickets agent-ready, applying workflow labels, setting dependencies, normalizing issue bodies, and updating verified stale states.
argument-hint: "[project-url|team|repo|filter]"
disable-model-invocation: true
---

# Issue Triage

Maintain current issue tracker work so Todo tickets are ready for agents and
tracker state reflects reality. This is tracker metadata cleanup, readiness
repair, and verified state reconciliation, not implementation.

By default, focus on the configured ready state, usually `Todo`, and active or
PR-linked issues that need tracker repair. Do not review `Backlog` or equivalent
future-work states unless the user explicitly asks for backlog review, first-run
backfill, or intake cleanup.

Apply safe tracker updates directly. When external state proves the tracker is
stale, such as a linked PR already merged, update the issue to the configured
truthful state such as `Done`. When something is unclear, ask the user if they
are available; otherwise mark the issue with the configured human-input state or
label and return the exact questions or next actions needed.

## Inputs

- Issue tracker project, team, repo, board, roadmap, query, or explicit backlog
  scope.
- Repo path and `docs/agents/workflow/config.md`.
- Existing tracker teams, projects, statuses, labels, priorities, dependencies,
  parent or child relationships, PR links, and issue comments.
- Optional user instructions for first-run backfill, dry run, priority policy,
  backlog review, intake cleanup, or orphan routing.

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
- priority policy, dependency policy, and orphan policy
- agent-ready issue body contract
- active workflow status transition owner
- Issue Triage intake-state transition authority
- Issue Triage verified-state reconciliation authority

If tracker metadata disagrees with config, update only exact label gaps that are
safe to create. Do not create or rename workflows, statuses, teams, projects,
boards, or roadmaps without explicit approval.

## Default Scope

Unless the user asks for backlog review, first-run backfill, or intake cleanup,
do not scan the whole backlog. Build the default triage set from:

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

Treat `Backlog`, icebox, roadmap, someday, or equivalent future-work states as
out of scope unless explicitly requested. `Triage` or other intake states are
also out of scope by default unless config names them as current work,
review-debt intake, or the user asks for intake cleanup.

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
6. `Triage`, `Backlog`, or equivalent intake and future-work states only when
   explicitly requested or when config explicitly uses them for review-debt
   intake.

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
  contract, labels, blockers, and route
- move issues from configured intake states such as `Triage` or equivalent to
  the configured ready state only when the user asked for intake cleanup or
  backfill and routing, labels, and the agent-ready body contract are complete
- leave `Backlog` or equivalent future-work states alone unless the user
  explicitly asks for backlog review
- move issues to the configured done state when linked PR, branch, release, or
  code-host evidence proves the work is merged or otherwise complete
- remove `ready-for-agent` or the repo-configured readiness label when moving an
  issue to the configured done state
- recommend moving issues out of done or merge-ready states when current external
  state proves the status is wrong, such as a closed-unmerged PR or reverted work
- add missing routing, type, risk, area, kind, and readiness labels from config
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
- apply configured worker environment labels or fields when the repo-configured
  environment policy says that issue may run there; dependency state is not a
  reason to refuse the environment label
- remove `ready-for-agent` from vague, duplicate, parent, human-owned, or
  body-incomplete issues
- encode blockers before ready-state promotion; recommend the configured blocked
  state for Agent Orchestrator when an active issue should stop
- apply configured review, merge-ready, or blocked states only when the repo
  config gives Issue Triage that authority and current external evidence is
  direct
- remove stale `Code review passed` when the linked PR head changed, blocking
  findings exist, the linked PR changed, or reviewed head SHA evidence is
  missing
- mark duplicates only when the duplicate relationship is clear and preserve the
  canonical issue

Do not close, cancel, reprioritize across projects, review backlog, or rewrite
scope because an issue looks stale. Leave a concise comment and use `needs-info`
or `ready-for-human` when judgment is required.

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
- assigned to the configured project or route
- labeled with one clear type and risk
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

If any required field is unknowable, add the missing heading, ask the specific
question when the user is available, label the issue `needs-info` or
`ready-for-human`, and do not mark it ready.

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

Do not use dependencies as a reason to withhold or remove `ready-for-agent` or a
configured worker environment label. Encode dependency order with tracker
relationships, blocker fields, body text, or workflow state so Agent
Orchestrator can avoid starting blocked work.

## Priority

Use the configured priority policy. Good signals are:

- user-provided priority
- project priority, milestone order, due date, or initiative priority
- security, data loss, production breakage, or customer-blocking impact
- dependencies that unlock multiple ready issues
- failed PRs or active work that needs repair

Do not turn personal preference into priority. When priority is unclear, leave it
neutral and mark the issue for human triage.

## First Run

For first-run backfill:

1. Snapshot current project counts by status, label, priority, dependency state,
   and readiness.
2. Create missing workflow labels only when names are exact and config-approved.
3. Normalize orphan routing and body headings before setting priorities.
4. Include `Backlog` or equivalent future-work states only if the user explicitly
   asked for backlog review.
5. Make readiness and intake-to-ready status promotion the final step after
   labels and body contracts are correct. Encode blockers separately; blocker
   state does not decide whether `ready-for-agent` or ready-state promotion
   applies.
6. Report the before and after counts.

## Guardrails

- Keep comments metadata-only. Do not paste secrets, customer data, logs,
  signed URLs, or credentials into the tracker.
- Do not implement code, create PRs, merge, deploy, or mutate production.
- Do not review `Backlog` or equivalent future-work states unless the user
  explicitly asks for backlog review.
- Do not move active issues between workflow states unless config or the user
  explicitly delegates that authority to Issue Triage, or direct external
  evidence proves a terminal state such as merged equals `Done`. When that
  terminal-state repair is made, also remove `ready-for-agent` or the
  repo-configured readiness label. Moving complete issues from configured intake
  states to the configured ready state is allowed only for requested intake
  cleanup or backfill.
- Do not create noisy comments for every small label edit. Prefer one summary
  comment when an issue needs explanation.
- Do not create new label taxonomies unless config or the user explicitly names
  them.
- Stop before destructive bulk changes if more than a small number of issues
  would be canceled, closed, moved across projects, or reprioritized.

## Done

Report:

- issue tracker scope reviewed
- whether backlog or intake states were skipped or explicitly included
- issues changed, unchanged, and needing human decision
- orphans routed or left with reasons
- labels, priorities, body contracts, dependencies, and status recommendations
  updated
- ready-state issues made agent-ready or left with exact blockers
- review-debt intake issues normalized, promoted, left for To Issues, or left for
  human decision
- verified stale states reconciled, including merged work marked done
- intake-state issues promoted to the configured ready state, if requested
- issues newly implementation-ready, newly startable, and removed from readiness
- duplicates, dependency cycles, stale active work, and config gaps found
- user questions asked or exact human next actions left
- actual next items to do before the remaining issues can become
  implementation-ready or startable
- whether the run was dry-run, partial, or applied
