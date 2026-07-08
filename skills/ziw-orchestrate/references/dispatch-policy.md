# Dispatch Policy

Use this reference when deciding scope boundaries, active delivery capacity,
file-footprint contention, draft PR handling, or PR closure.

## Scope Boundaries

Orchestrator owns delivery scope only for work the user explicitly named or for
the configured current-work queue. Do not expand into adjacent tickets just
because they are nearby or cheap.

- Explicit ticket IDs or URLs are a fixed set.
- A one-ticket request remains one ticket through implementation, review, and
  integration.
- A verified-ready ticket set can be repaired and advanced, but not widened.
- Linear Backlog work is not dispatchable until triage promotes committed,
  shaped work into the ready state.
- Done tickets are terminal even when stale readiness labels remain.

When a scoped ticket is not moving, verify the fact that would make it eligible
for the next pipeline step. Repair routine status, label, route, environment,
review-evidence, or handoff drift when refreshed evidence is clear. Escalate
only missing intent, authority, credentials, provider/customer input, production
approval, security posture, or ADR-level judgment.

## Active Delivery Cap

The active cap protects repo footprint, not just live worker sessions. Default
to 3 active delivery slots when config names no cap. Prefer the config field
`Active PR/preview cap`; accept legacy `Concurrency cap` only with these
semantics.

Count:

- every open product PR, including draft PRs
- active PR-scoped previews not clearly linked to an already counted PR
- implementation dispatches that have not returned, stopped, or produced a PR

Do not double-count a PR and its normal linked preview. Track bot dependency PRs
as separate drain work unless config says they consume product delivery slots.

When the footprint is at or above cap, do not dispatch new implementation work.
Drain existing footprint first: advance draft PRs, rerun or route checks, request
or apply review, send fixes to the original worker, integrate green PRs when
authorized, terminate orphan previews according to config, or report the exact
capacity blocker.

When all capacity is consumed by merge-ready PRs that lack only human merge
authority, post the merge queue once, apply the configured code-host
human-merge PR label only when the green gate is satisfied, mark the scope
blocked on merge authority, and stop or stretch the loop until the queue drains.

## File Footprint Dispatch

Capacity headroom is necessary, not sufficient. Before dispatching more than one
startable issue, compare predicted footprints from To Issues against:

- open PRs, including drafts
- active worker branches and unreturned dispatches
- selected candidates for the same tick
- shared packages, schemas, migrations, generated artifacts, route files, config
  files, and refactor-plus-test seams
- dense document hotspots such as changelog lists, status ledgers, registries,
  config tables, and caveat lists

Dispatch only a non-colliding set that fits remaining headroom. Hold colliding
items as `file-collision` with "held, not skipped" evidence.

If a startable ticket lacks predicted footprint, route it to triage or To Issues
for repair before fanout. A single explicitly requested ticket may still run when
no active work can collide with it.

Prefer the set that unlocks blocked dependents, drains hot seams first, and keeps
risk isolated. Do not fill every slot just because headroom exists.

## Dispatch Preconditions

Dispatch only when current tracker and code-host evidence show all of these:

- ticket is `kind-slice`
- readiness state and label satisfy config
- issue body has concrete in-scope, out-of-scope, acceptance, and verification
  content
- dependencies and blocker relations are clear
- repo route and worker environment metadata are present or safely repairable
- ticket is not claimed, delegated, linked to an open PR, or represented by an
  active worker session
- predicted footprint does not collide with active or selected work

A `kind-spec` or `kind-epic` at dispatch is a hard refuse. Treat it as a To
Issues miss, repair only when unambiguous, and log `config-gap`.

Body or comment evidence can override readiness. If the body says it waits on a
human decision, contains a ready-for-human rationale, leaves required sections
blank, or names unresolved setup, credential, provider, or security choices, do
not dispatch. Heal the label or route to triage.

## Draft PRs

Draft PRs are active code-host work. A draft PR that did not sync to the tracker
still consumes capacity and file seams. Do not start another worker for the same
ticket because the returned PR is draft.

Draft state is an orchestration repair signal. Find the blocker: running or
failed checks, requested author fixes, missing metadata, human prep, or an
explicit repo policy. When no blocker remains, move the PR to ready-for-review if
authority allows. If authority is missing, stop with the exact code-host action
needed.

## PR Closure Guard

Capacity pressure is never a reason to close legitimate in-progress work. Before
closing any PR, refresh code-host and tracker state and verify one closure
reason:

- duplicate PR for the same issue after current evidence selects a canonical PR
- explicitly canceled, abandoned, or out-of-scope work, with owner or config
  evidence that closure is allowed
- already merged, superseded, or terminal according to code-host and tracker
  evidence
- security or policy reason requiring closure, with the reason recorded

PR age, draft status, and delivery-slot pressure are not abandonment evidence. If
an open PR consumes capacity but fails this guard, keep it open and route the
next action: review, worker feedback, check repair, merge escalation, or exact
capacity blocker report.
