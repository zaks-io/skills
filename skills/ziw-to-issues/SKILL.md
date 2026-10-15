---
name: ziw-to-issues
description: Use to turn a spec, PRD, or epic ticket into the fewest dependency-ordered one-PR implementation tickets that ship safely, adopting and merging any hand-created tickets, applying the agent-ready body contract, configured estimates, and kind labels, and emitting a dependency graph and predicted file footprint.
argument-hint: "[spec-doc|prd-ticket|epic-ticket|project]"
---

# To Issues

Create and shape the fewest dependency-ordered one-PR implementation tickets
that ship safely, including hand-created tickets. A run is complete when the
slices meet the intake contract, dependencies and footprints are recorded, and
any required coverage matrix is complete; report gaps that prevent readiness.

For encountered friction, use [friction-log.md](../ziw-orchestrate/references/friction-log.md)
with the configured complaint store and this role's mutation authority.

## Inputs

- A spec, PRD, epic ticket, plan, or project. A Grill-managed spec must be
  `Ready for slicing`.
- Repo path and `docs/agents/workflow/config.md`.
- Existing tickets under the same parent, project, or route, including
  hand-created ones.

## Steps

1. [Read config](#read-config) before any tracker write.
2. [Check the planning handoff](#check-the-planning-handoff).
3. [Plan slices](#plan-slices) and consolidate the whole list before writing.
4. [Adopt before creating](#adopt-before-creating) tickets.
5. [Fill the body contract](#fill-the-body-contract) for every slice.
6. [Set labels, estimates, and readiness](#set-labels-estimates-and-readiness).
7. [Record the dependency graph](#record-the-dependency-graph).
8. [Record file footprints](#record-file-footprints) and compare siblings.
9. [Map coverage](#map-coverage) when the source is a spec, PRD, or container linking one.
10. [Heal structure](#heal-structure) and [report](#done) results and gaps.

## Read config

- Read config first.
- Exception: if config is missing, run or request `ziw-setup` before creating tickets.
- Read the body contract, label rules, and Estimate Rules from
  [issue-tracker-contract.md](../ziw-setup/references/issue-tracker-contract.md).

Before any tracker write, confirm these mappings and policies from config:

- Provider location, project, team, parent, and routing label.
- Status names, ready state, and intake states.
- Kind, readiness, risk, type, and area labels and their policies.
- Estimate field, scale, and requiredness.
- Body contract.
- Dependency and blocker fields.
- Footprint convention.

### Ticket kinds

- Kind is separate from type.
- Set exactly one kind on every ticket you touch.
- Clear any other `kind-*`, even when the tracker group allows several.
- `kind-spec` holds spec or PRD prose; `kind-epic` holds a parent or workstream.
  Both are containers.
- Read containers' prose, linked docs, and acceptance signals.
- Link emitted slices under their containers.
- `kind-slice` is a one-PR implementation ticket, the only kind a worker runs.

### Intake ownership

- To Issues is the single front door for implementation tickets, including
  hand-created ones.
- Flows that file tickets elsewhere, such as review sweeps or eval sessions,
  must run this intake pass or leave readiness labels off.
- A `ready-for-agent` ticket without intake metadata is a dispatch hazard.

## Check the planning handoff

- `Status: Ready for slicing`, or its configured equivalent, may proceed.
- Exception: `Status: Draft`, or its configured equivalent, stops. Report its
  blocking questions.
- Exception: if the user explicitly asks to preserve a Draft, create or update
  only a non-ready `kind-spec` or `kind-epic` container carrying the gaps.
- A legacy plan without status proceeds only when its outcome, scope,
  non-goals, behavior, acceptance signals, and material open questions are
  clear enough for the ticket contract.
- Return contradictions or questions to `ziw-grill` when they could change
  slice boundaries, risk, dependencies, or required proof.
- Existing tickets do not weaken this gate. Adopt them only once the source
  defines their boundaries.

## Plan slices

- Cut the fewest one-PR slices that ship safely.
- Default to the larger slice; split only for a split reason.
- Each slice costs a worker session, a check run, a review, a PR, and a merge.
- A slice is one outcome a user, operator, or later slice can observe.
- Include everything needed to ship it: code in every layer, tests, docs,
  config, fixtures, generated artifacts, and migration.
- Each slice must be verifiable end to end and fit one PR, including its Done.
- Ticket only requirements the plan states.
- Name tempting unrequested polish, cleanup, hardening, future-proofing, and
  follow-ups in out-of-scope; raise important ones as open questions on the container.
- Leave vague ideas un-ticketed until scope is clear; record them as open questions.
- A merge-test batch of trivial same-area items is one outcome, not a bundle.

### Split Reasons

Keep work in separate slices only for these reasons:

- Distinct outcome: each is observable and useful alone, and neither exists
  only to serve the other.
- Size: together they exceed one reviewable PR or the configured estimate maximum.
- Rollout order: a deploy gate separates the steps. Examples include data cleanup
  before a schema change, or a flag or preview flip after the code it enables.
- Risk or authority: one part needs human planning, security judgment,
  production approval, or a different risk label.
- Readiness: one part waits on an open question or external dependency while
  the rest can start.

For size splits:

- Start with a tracer bullet that proves the path end to end.
- Then widen with slices that each add observable behavior.

For rollout-order splits:

- Put gated slices under a `kind-epic` so the first PR cannot close the whole scope.

### Merge Test

A slice matching any line below is a fragment, not a ticket, unless a split
reason separates it from its fold target.

- Exception: any split reason keeps it apart, including the no-behavior cases.
  A gated flag flip or an expand-only migration stays its own slice.
- Depending on a sibling does not make a fragment; lacking observable
  behavior of its own does.
- "Another slice" means an unmerged one. Work for behavior that already shipped
  stands alone.

Apply the test:

- No consumer or observable behavior in its own PR, such as scaffold, types,
  interface, stub, config, or wiring: fold into the first slice that uses it.
- Only tests, docs, fixtures, or generated artifacts for another slice's
  behavior: fold into that slice.
- A step, such as running checks, verifying deploy, confirming migration, or
  opening a PR: make it an acceptance criterion or required check on the slice it verifies.
- One mechanical change repeated across files, modules, or call sites: keep one
  slice unless size forces a split.
- Trivially small work, such as a rename, copy tweak, config value, or one-line
  fix, with other planned work in the same area: fold it in.
- Exception: trivial items sharing area, risk label, and required checks may be
  batched into one slice with a single outcome, such as "settings copy matches the spec".
- Exception: a small fix that is the whole request stays one ticket.
- Shares most of its predicted footprint with the one slice it blocks or is
  blocked by: treat it as a fragment, subject to the split-reason exception above.

### Consolidate Before Writing

Draft the whole slice list before any tracker write, then:

- Name the split reason separating each slice from every slice it blocks, is
  blocked by, or shares files with.
- Apply the merge test and merge each pair with no split reason.
- In a chain where each slice only unblocks the next, merge only the links
  without a split reason. A rollout gate keeps its two links apart.
- Re-split any merged slice that no longer fits one PR, on a split reason.
- Record each split reason in the slice's dependencies or blockers section so
  triage can see it.
- List each split reason in the run summary.

## Adopt before creating

Re-runs converge without duplicating tickets. Before creating any ticket:

- Inventory existing tickets under the target.
- Match planned slices by outcome, scope, and area.
- Adopt each match: bring it to the body contract, set `kind-slice`, and fix
  labels and links.
- Create new `kind-slice` tickets only for planned work with no match.
- When two tickets cover one slice, keep the canonical one and mark the other
  a duplicate.
- Fold unstarted tickets that fail the merge test into one canonical unstarted ticket.
- When folding, carry over scope, acceptance criteria, spec citations, and footprint.
- Re-estimate the canonical ticket after folding.
- Repoint dependency links and coverage rows, and mark the rest duplicates.

Exceptions:

- A fragment whose partner is active stays open, blocked by it, with
  `needs-info` asking whether the partner's PR covers it.
- Once the partner is Done, close the fragment as covered or reshape it as its own slice.
- Preserve and report tickets the plan does not cover, such as worker follow-ups
  or review debt. Leave them separate and do not mark them duplicates.
- Adoption fixes mechanics from plan evidence. Where intent is unknowable,
  apply `needs-info` with the exact question.

## Fill the body contract

Every `kind-slice` gets the agent-ready body:

- Outcome.
- Context docs.
- Likely files, packages, or artifacts.
- In scope.
- Out of scope.
- Acceptance criteria.
- Required checks.
- Security, privacy, data, and operational invariants.
- Dependencies or blockers.
- Estimate when config stores it in the body.

### Scope and citations

- Scope is a hard stop line.
- `In scope` names only the behavior, files, docs, tests, and workflow state
  this PR may change.
- `Out of scope` names tempting adjacent work, sibling ticket IDs when known,
  optional polish, broad refactors, production actions, and follow-up behavior.
- Exception: if the boundary is too unclear to write, keep the work under a
  container or mark it `needs-info`.
- In context docs, cite the exact spec, PRD, or ADR sections a slice implements
  as resolvable anchors, such as `docs/specs/<file>.md#<section-anchor>`.
- Verify each anchor resolves. A spec-derived slice without resolvable
  citations is not ready.

### Acceptance evidence

- Write acceptance criteria as proof obligations that map one-for-one to evidence.
- For structural requirements, name the exact behavior and regression test.
  Examples include "derive, do not copy", "fail closed", "no production-path
  assertion", "real driver path", and "env var reaches the test process".
- Make deploy prerequisites, runtime secrets, hosted gates, generated artifact
  updates, and CI env passthrough explicit acceptance criteria or required checks.
  Background-doc notes are insufficient.
- Put exact external literals or their config lookup location in the body,
  not only in prior comments. These include config values, resource IDs,
  provider names, label slugs, secret names, and environment values.

### Boundary-specific evidence

- For auth, bootstrap, claim, invitation, one-use grant, custody, or ownership
  slices, name the authenticated actor, tenant or resource binding, replay
  behavior, atomic consume or claim, and concurrency checks before ready.
- For custody, persistence, driver, or provider integration slices, use
  executable criteria that exercise the real boundary.
  Examples include multi-instance readback, concurrent first use, real driver
  queries, env passthrough, or provider-shape checks. Prose-only assertions are insufficient.

### Retained-data schema changes

For slices that drop or narrow schema on retained data:

- Put deploy order in the criteria.
- When the platform validates existing rows, require pre-deploy cleanup to
  land before the schema change.
- Require bulk migrations to use a resumable batched runner rather than one transaction.
- Name the production deploy status that proves it landed. A green preview
  does not prove it.

### Missing information

- Agent suitability decides readiness labels, not slice boundaries.
- Route high-risk or ambiguous work to human planning when the plan does not
  settle the security, product, data, or architecture decision.

When a required field, required estimate, or scope boundary is unknowable
from the plan:

- Add the heading and the exact question.
- Apply `needs-info` and leave the ticket non-ready.
- Exception: for an unknowable required estimate, apply `ready-for-human`.

## Set labels, estimates, and readiness

For each `kind-slice`:

- Apply one type and one risk label, plus routing and area labels, from config.
- Estimate after consolidation per the Estimate Rules.
- Use only the configured estimate field and scale, and only when policy grants
  To Issues that authority.
- Exception: omit estimates when config defines none.
- Apply the worker environment label only when its approval criteria are met.
- Dependency state never withholds the worker environment label.

Apply `ready-for-agent` only when the slice:

- Fits one PR and survives the merge test.
- Is routed, typed, risk-labeled, and estimated if required.
- Has concrete scope boundaries and is complete enough to verify.
- Has no body statement that human setup, credentials, provider decisions, or
  security judgment remain.

Then:

- Place ready slices in the configured ready state, usually `Todo`, even when blocked.
- Otherwise, apply `needs-info` or `ready-for-human` with the exact gap.
- Encode blockers separately.
- `ready-for-agent` means no further human refinement is needed; it does not
  mean unblocked or startable.
- Blockers never remove `ready-for-agent`, the ready state, or a worker
  environment label.

## Record the dependency graph

Emit a graph so the orchestrator can compute the ready frontier and run safe
work in parallel.

- Use tracker relationship or blocker fields when supported.
- Exception: when unsupported, use the configured body shape.
- Use the configured direction.
- By default, if A needs B first, A is blocked by B.
- Order slices so each depends only on earlier ones.
- Break and report cycles.
- Serialize slices that must not run concurrently even without a data dependency,
  such as shared schema or migration ordering.
- When surviving slices converge on the same core files or regenerate the same
  shared artifact, land the convergent slice first or immediately adjacent to
  its siblings, or serialize the cohort.
- Same-base siblings all conflict once one merges.

## Record file footprints

Record each slice's predicted footprint in the configured location and shape so
the orchestrator can avoid concurrent collisions. It is a prediction; workers may diverge.

- By default, write it under `## Likely files, packages, or artifacts`, with one
  backticked path per bullet.
- Exception: use another shape when config names one.
- List likely files, directories, or packages, including shared document
  surfaces such as dense markdown lists, status ledgers, registries,
  changelogs, config tables, and docs sections many slices edit.
- Treat heavy overlap between two slices as a merge candidate first.
- Exception: flag them for serializing or sequencing only when a split reason
  keeps them apart.
- After assigning footprints, compare siblings and record hot files or packages
  and safe fan-out pairs so collisions surface before workers are in flight.

## Map coverage

For a spec, PRD, or container linking one, emit a coverage matrix so dropped
requirements surface at slicing time.

- Use the spec's section anchors as rows, the same ones slices cite, with no
  separate numbering.
- A section is a row, not a slice boundary; one slice usually covers several.
- Map each requirement-bearing section to exactly one of: implementing slice
  IDs, `deferred` with reason and owning ticket, or an open `needs-info` question.
- Mark sections without requirements `not-applicable`.
- An absent anchor is an uncovered gap.
- Record the matrix on the container body or the configured location.
- Re-runs update the one matrix in place.
- The run is incomplete while any requirement-bearing section is unmapped.
- Report those gaps and keep the container's slices non-ready until every
  requirement-bearing section is mapped.

## Heal structure

- Repair stale or inconsistent structure from current evidence.
- Escalate missing intent or authority.
- Record every fix and leave no silent dead end.
- Heal wrong or duplicate `kind-*` values, stale labels that resolve to a
  verified one, re-run duplicates, and over-split cohorts.
- Escalate unknowable scope or acceptance criteria with `needs-info`.

## Never

- Do not implement, review, open PRs, merge, deploy, or move active work.
- Do not ship or ready containers, mark them `ready-for-agent`, or dispatch them.
- Do not duplicate tickets or invent scope, acceptance criteria, or product decisions.
- Do not invent the decisions returned to `ziw-grill`.
- Do not ticket unrequired work or a layer, step, or fragment of another slice.
- Do not bundle unrelated outcomes, unrequired adjacent fixes, or work the plan
  assigns to another slice.
- Do not split by layer (schema, API, UI), artifact type (tests, docs, types,
  config), file or module, work step (scaffold, wire up, clean up, verify),
  spec section, or acceptance criterion.
- Do not carve tests, docs, or a small refactor out of an outcome to make an
  agent-fit ticket.
- Do not fold into or out of a ticket that is claimed, active, or linked to an
  open PR.
- Do not paraphrase spec behavior without a citation or cite a whole document
  when sections apply.
- For custody, persistence, driver, or provider integration slices, do not use
  a mock of the integrated seam as the only proof.
- Do not fabricate content to make a ticket look ready.
- Do not park ready slices in Linear `Backlog`.
- Do not create label taxonomies or statuses without config or explicit user approval.
- Keep ticket text metadata-only: no secrets, customer data, signed URLs,
  credentials, or private logs.

## Done

Report:

- Source plan and target location.
- Slices created, adopted, and merged, duplicates converged, slice count, and
  each slice's split reason.
- Kinds set and contradictions healed.
- Estimates set, preserved, omitted by policy, or left with exact questions.
- Tickets marked `ready-for-agent`, `needs-info`, or `ready-for-human`.
- Dependency graph, cycles, and required serializations.
- Footprints recorded and overlaps flagged.
- Coverage matrix location, rows mapped, and uncovered or deferred sections.
- Heals applied, gaps escalated with exact questions, and what the user must
  answer before the remaining slices can become ready.
