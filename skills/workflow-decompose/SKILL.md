---
name: workflow-decompose
description: Use for decompose, the front door that turns a spec, PRD, or epic ticket into dependency-ordered one-PR implementation tickets, adopting any hand-created tickets, applying the agent-ready body contract and kind labels, and emitting a dependency graph and predicted file footprint.
argument-hint: "[spec-doc|prd-ticket|epic-ticket|project]"
disable-model-invocation: true
---

# Decompose

Turn planned work into implementation tickets that are ready to run and fit the
plan. This is the single front door for creating implementation tickets. Every
implementation ticket the workflow runs should pass through here, including ones
the user created by hand.

Decompose creates and shapes tickets. It does not implement, review, or move
active work. Spec or epic tickets are input containers, not work to ship.

## Inputs

- A spec doc, PRD ticket, epic ticket, plan, or project to decompose.
- Repo path and `docs/agents/workflow/config.md`.
- Existing tracker tickets under the same parent, project, or route.
- Any hand-created implementation tickets to adopt into the plan.

## Context

Read `docs/agents/workflow/config.md` first. If it is missing, run or request
`workflow-setup` before creating tickets.

Confirm before creating or editing tickets:

- provider location, project, team, parent, and routing label
- status names, the configured ready state, and intake states
- kind label set and its single-select policy
- readiness, risk, type, and area labels and their policies
- agent-ready issue body contract
- dependency and blocker fields
- file footprint convention from config

Read the agent-ready body contract and label rules from
[../workflow-setup/references/issue-tracker-contract.md](../workflow-setup/references/issue-tracker-contract.md)
so the body shape and labels stay defined in one place. See Self-Healing below
when existing tickets are inconsistent.

## Ticket Kinds

Kind is a single-select axis, separate from type. Skills enforce exclusivity even
when the tracker group does not.

- `kind-spec`: holds spec or PRD prose. Input to decompose. Never dispatched.
- `kind-epic`: a parent or workstream container grouping slices. Never
  dispatched.
- `kind-slice`: one-PR implementation ticket. The only kind a worker runs.

Set exactly one kind on every ticket decompose touches, and clear any other
`kind-*` value.

## Containers Are Input

Treat a `kind-spec` or `kind-epic` ticket as the source you decompose, not a
ticket to ship.

- Read its prose, linked docs, and acceptance signals.
- Emit `kind-slice` children and link them under it.
- Keep the container as a container. Never put `ready-for-agent` on it and never
  hand it to a worker.

## Adopt Before Creating

Decompose is idempotent. Re-running it over the same plan converges; it does not
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
- Prefer a tracer-bullet first slice that proves the path end to end, then
  slices that widen it.
- Leave vague ideas un-ticketed until scope is clear; record them as open
  questions rather than guessing scope.

## Body Contract

Give every `kind-slice` ticket the agent-ready body from the issue tracker
contract:

- outcome
- context docs
- in scope
- out of scope
- acceptance criteria
- required checks
- security, privacy, data, and operational invariants
- dependencies or blockers

If a required field is unknowable from the plan, add the heading, mark the ticket
`needs-info`, leave the specific question, and do not mark it ready. Do not
fabricate criteria to make a ticket look ready.

## Labels And Readiness

For each `kind-slice`:

- apply one type and one risk label from config
- apply routing and area labels from config
- apply the configured worker environment label only when the environment
  approval criteria are met; dependency state is not a reason to withhold it
- apply `ready-for-agent` only when the slice is scoped to one PR, routed,
  type and risk labeled, and complete enough to verify
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
- Order slices so each depends only on earlier ones. Break cycles and report
  them.
- Serialize slices that must not run concurrently even without a direct data
  dependency, such as shared schema or migration ordering, using the configured
  dependency mechanism.
- Encoding a dependency never removes `ready-for-agent` or a worker environment
  label.

## File Footprint

For each `kind-slice`, record a predicted file or package footprint in the
configured location and shape, so the orchestrator can avoid dispatching
colliding slices concurrently.

- List the files, directories, or packages the slice is most likely to change.
- Keep it a prediction, not a guarantee; the worker may diverge.
- Flag slices with heavy expected overlap so they are serialized or sequenced.

## Self-Healing

Heal unambiguous mechanical mistakes, escalate intent, never leave a silent dead
end, and record every fix. For decompose specifically:

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

- source decomposed and target location
- slices created, slices adopted, and duplicates converged
- kind labels set and any kind contradictions healed
- tickets marked `ready-for-agent`, `needs-info`, or `ready-for-human`
- dependency graph and any cycles or required serializations
- file footprints recorded and overlaps flagged
- heals applied and intent gaps escalated, with exact questions left
- what the user must answer before the remaining slices can become ready
