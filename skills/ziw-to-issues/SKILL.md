---
name: ziw-to-issues
description: Use to turn a spec, PRD, or epic ticket into dependency-ordered one-PR implementation tickets, adopting any hand-created tickets, applying the agent-ready body contract, configured estimates, and kind labels, and emitting a dependency graph and predicted file footprint.
argument-hint: "[spec-doc|prd-ticket|epic-ticket|project]"
disable-model-invocation: true
---

# To Issues

Turn planned work into implementation tickets that are ready to run and fit the
plan. This is the single front door for creating implementation tickets. Every
implementation ticket the workflow runs should pass through here, including ones
the user created by hand.

To Issues creates and shapes tickets. It does not implement, review, or move
active work. Spec or epic tickets are input containers, not work to ship.

Flows that file tickets outside To Issues, such as review sweeps or eval
sessions, must either run this intake pass or leave readiness labels off so
the gap stays visible. A hand-filed ticket carrying `ready-for-agent` without
intake metadata is a dispatch hazard.

## Inputs

- A spec doc, PRD ticket, epic ticket, plan, or project to turn into issues.
- Repo path and `docs/agents/workflow/config.md`.
- Existing tracker tickets under the same parent, project, or route.
- Any hand-created implementation tickets to adopt into the plan.

## Context

Read `docs/agents/workflow/config.md` first. If it is missing, run or request
`ziw-setup` before creating tickets.

Confirm before creating or editing tickets:

- provider location, project, team, parent, and routing label
- status names, the configured ready state, and intake states
- kind label set and its single-select policy
- readiness, risk, type, and area labels and their policies
- estimate field, scale, and requiredness policy
- agent-ready issue body contract
- dependency and blocker fields
- file footprint convention from config

Read the agent-ready body contract and label rules from
[../ziw-setup/references/issue-tracker-contract.md](../ziw-setup/references/issue-tracker-contract.md)
so the body shape and labels stay defined in one place. See Self-Healing below
when existing tickets are inconsistent.

## Ticket Kinds

Kind is a single-select axis, separate from type. Skills enforce exclusivity even
when the tracker group does not.

- `kind-spec`: holds spec or PRD prose. Input to To Issues. Never dispatched.
- `kind-epic`: a parent or workstream container grouping slices. Never
  dispatched.
- `kind-slice`: one-PR implementation ticket. The only kind a worker runs.

Set exactly one kind on every ticket To Issues touches, and clear any other
`kind-*` value.

## Containers Are Input

Treat a `kind-spec` or `kind-epic` ticket as the source you turn into issues, not a
ticket to ship.

- Read its prose, linked docs, and acceptance signals.
- Emit `kind-slice` children and link them under it.
- Keep the container as a container. Never put `ready-for-agent` on it and never
  hand it to a worker.

## Adopt Before Creating

To Issues is idempotent. Re-running it over the same plan converges; it does not
duplicate.

Before creating any ticket:

1. Inventory existing tickets under the target parent, project, or route,
   including hand-created ones.
2. Match planned slices to existing tickets by outcome, scope, and touched area.
3. Adopt each match: bring it up to the body contract, set `kind-slice`, fix
   labels and links. Do not create a duplicate.
4. Create new `kind-slice` tickets only for planned work that has no existing
   ticket.
5. When two existing tickets cover the same slice, converge on the canonical one
   and mark the other a duplicate; do not silently leave both. See Self-Healing.

Adoption fixes mechanics and fills missing contract headings from evidence in the
plan. It never invents scope or acceptance criteria. Where intent is unknowable,
apply `needs-info` and leave the exact question.

## Slice

Cut work into thin, independently shippable, one-PR vertical slices.

- Each slice delivers a verifiable end-to-end behavior, not a layer.
- Each slice is scoped to one PR.
- Each slice has one primary outcome. Do not bundle "while you are there"
  cleanup, polish, adjacent bug fixes, future-proofing, or sibling ticket work
  into the same `kind-slice`.
- Prefer a tracer-bullet first slice that proves the path end to end, then
  slices that widen it.
- Do not make a `kind-slice` whose Done state requires multiple PRs. Split
  scaffold, CI gate, data migration, preview flip, and final wiring into separate
  slices or keep them under a `kind-epic` container so a first linked PR cannot
  falsely close the whole scope.
- When adjacent outcomes are useful but not required for this PR, create sibling
  slices, link them, and name them in this ticket's out-of-scope section.
- Leave vague ideas un-ticketed until scope is clear; record them as open
  questions rather than guessing scope.

## Body Contract

Give every `kind-slice` ticket the agent-ready body from the issue tracker
contract:

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

The `in scope` and `out of scope` fields are a hard boundary, not placeholders.
Write them so an implementation worker can tell when to stop:

- `in scope` names only the behavior, files, docs, tests, and workflow state this
  PR may change.
- `out of scope` names tempting adjacent work, sibling ticket IDs when known,
  optional polish, broad refactors, production actions, and follow-up behavior
  the worker must not deliver.
- If out-of-scope cannot be written because the slice boundary is unclear, mark
  the ticket `needs-info` or keep it under a container. Do not mark it
  `ready-for-agent`.

If a required field is unknowable from the plan, add the heading, mark the ticket
`needs-info`, leave the specific question, and do not mark it ready. Do not
fabricate criteria to make a ticket look ready.

Write acceptance criteria as proof obligations the implementer and reviewer can
map one-for-one to evidence. If the requirement is structural, such as "derive,
do not copy", "fail closed", "no production-path assertion", "real driver path",
or "env var reaches the test process", name the exact behavior and regression
test that must prove it.

Record deploy prerequisites, runtime secrets, hosted gates, generated artifact
updates, and CI env passthrough requirements as explicit acceptance criteria or
required checks. Do not bury launch blockers only in background docs.

When a slice depends on exact external config, resource IDs, provider names,
label slugs, secret names, or environment values, put the exact configured
literals or their config lookup location in the body. Do not rely on prior issue
comments as the only source for hard values a worker must use.

Prefer slices that match known strong agent-fit work: docs, tests, build or CI
updates, small refactors with clear checks, scoped bugs with reproduction, and
isolated UI changes with target states. Mark high-risk or ambiguous work for
human planning when the plan does not settle the security, product, data, or
architecture decision.

For auth, bootstrap, claim, invitation, one-use grant, custody, or ownership
slices, make the security invariants concrete before marking the ticket ready.
Name the authenticated actor, tenant or resource binding, replay behavior,
atomic consume or claim requirement, and concurrency checks the worker must
prove.

For custody, persistence, driver-integration, or provider-integration slices,
give acceptance criteria an executable shape that exercises the real boundary.
Prefer checks such as multi-instance readback, concurrent first use, real driver
queries, env passthrough, or provider-shape verification over prose-only
assertions. Do not make a mock of the integrated seam the only proof.

For slices that drop or narrow schema on retained data, put the deploy order in
the acceptance criteria: pre-deploy data cleanup must land before the schema
change deploys when the platform validates the new schema against existing
rows, and bulk migrations must use a resumable batched runner, not a single
transaction. Name the production deploy status that proves the change landed; a
green preview does not prove the production deploy.

## Estimates

Follow the Estimate Rules in
[../ziw-setup/references/issue-tracker-contract.md](../ziw-setup/references/issue-tracker-contract.md):
estimate each `kind-slice` after splitting to one PR, using only the
configured field and scale, and omit estimates when config defines none. If
estimates are required before `ready-for-agent` and a value is unknowable from
the plan, leave the exact question, apply `needs-info` or `ready-for-human`,
and do not mark the ticket ready.

## Labels And Readiness

For each `kind-slice`:

- apply one type and one risk label from config
- apply routing and area labels from config
- apply the configured estimate when the estimate policy grants To Issues that
  authority
- apply the configured worker environment label only when the environment
  approval criteria are met; dependency state is not a reason to withhold it
- apply `ready-for-agent` only when the slice is scoped to one PR, routed,
  type and risk labeled, estimated if required, has a concrete in-scope and
  out-of-scope boundary, and is complete enough to verify
- do not apply `ready-for-agent` when the body itself says human setup,
  credentials, provider decisions, or security judgment are still required
- place ready `kind-slice` issues in the configured ready state, usually `Todo`,
  even when they are blocked by other tickets; do not park
  implementation-ready slices in Linear `Backlog`
- otherwise apply `needs-info` or `ready-for-human` with the exact gap

`ready-for-agent` means no further human refinement is needed before agent
handoff. It does not mean unblocked or startable. Blocked slices can still be
`ready-for-agent`; encode the blocker separately.

## Dependency Graph

Emit a dependency graph so the orchestrator can compute the ready frontier and
run safe work in parallel.

- Encode dependencies with the tracker's relationship or blocker fields when the
  provider supports them; otherwise record them in the body in the configured
  shape.
- Use the configured relationship direction. By default, if ticket A needs ticket
  B first, A is blocked by B and B blocks A.
- Order slices so each depends only on earlier ones. Break cycles and report
  them.
- Serialize slices that must not run concurrently even without a direct data
  dependency, such as shared schema or migration ordering, using the configured
  dependency mechanism.
- When several slices converge on the same core files or regenerate the same
  shared artifact, sequence the convergent slice to land first or immediately
  adjacent to its siblings, or serialize the cohort. Same-base siblings all
  conflict the moment one merges.
- Encoding a dependency never removes `ready-for-agent`, the configured ready
  state, or a worker environment label.

## File Footprint

For each `kind-slice`, record a predicted file or package footprint in the
configured location and shape, so the orchestrator can avoid dispatching
colliding slices concurrently.

- List the files, directories, or packages the slice is most likely to change.
- Include shared document surfaces the slice is likely to edit, such as dense
  markdown list blocks, status ledgers, registries, changelogs, config tables,
  and docs sections owned by many slices.
- Keep it a prediction, not a guarantee; the worker may diverge.
- Flag slices with heavy expected overlap so they are serialized or sequenced.
- Compare sibling slices after assigning individual footprints. Record hot files
  or packages and the safe fan-out pairs, so Orchestrator does not discover
  obvious collisions only after workers are already in flight.

## Self-Healing

Use model judgment over current evidence to repair stale or inconsistent ticket
structure, escalate missing intent or authority, never leave a silent dead end,
and record every fix. For To Issues specifically:

- Heal a wrong or duplicate `kind-*`, a stale label that resolves to a verified
  one, and a re-run duplicate by converging on the canonical ticket.
- Escalate with `needs-info` when scope or acceptance criteria are unknowable;
  never fabricate them to make a ticket look ready.
- Report every heal and every escalated gap in the run summary.

## Guardrails

- Do not implement code, open PRs, merge, deploy, or move active work states.
- Do not ship or mark ready a `kind-spec` or `kind-epic` container.
- Do not duplicate existing tickets; adopt and converge.
- Do not invent scope, acceptance criteria, or product decisions.
- Do not create new label taxonomies or statuses without config or explicit user
  approval.
- Keep ticket text metadata-only. Never paste secrets, customer data, signed
  URLs, credentials, or private logs.

## Done

Report:

- source plan and target location
- slices created, slices adopted, and duplicates converged
- kind labels set and any kind contradictions healed
- estimates set, preserved, omitted by policy, or left with exact questions
- tickets marked `ready-for-agent`, `needs-info`, or `ready-for-human`
- dependency graph and any cycles or required serializations
- file footprints recorded and overlaps flagged
- heals applied and intent gaps escalated, with exact questions left
- what the user must answer before the remaining slices can become ready
