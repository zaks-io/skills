---
name: ziw-to-issues
description: Use to turn a spec, PRD, or epic ticket into the fewest dependency-ordered one-PR implementation tickets that ship safely, adopting and merging any hand-created tickets, applying the agent-ready body contract, configured estimates, and kind labels, and emitting a dependency graph and predicted file footprint.
argument-hint: "[spec-doc|prd-ticket|epic-ticket|project]"
---

# To Issues

Create and shape the fewest dependency-ordered one-PR implementation tickets
that ship safely, including hand-created ones. Finish with complete intake,
dependencies, footprints, and required coverage; report gaps preventing readiness.
To Issues is the single front door for implementation tickets. Other filing flows,
such as review sweeps or evals, must run intake or leave readiness labels off.
A `ready-for-agent` ticket without intake metadata is a dispatch hazard.

## Inputs

- Spec, PRD, epic ticket, plan, or project; Grill-managed specs must be `Ready for slicing`.
- Repo path and `docs/agents/workflow/config.md`.
- Existing tickets under the same parent, project, or route, including hand-created ones.

## Steps

1. Read config before any tracker write. If missing, run or request `ziw-setup`
   before creating tickets.
   - Confirm provider location, project, team, parent, routing label; statuses,
     ready and intake states; kind, readiness, risk, type, area labels and policies;
     estimate field, scale, requiredness; body contract; dependency and blocker fields;
     footprint convention.
   - Read the body contract, label rules, and Estimate Rules in
     [issue-tracker-contract.md](../ziw-setup/references/issue-tracker-contract.md).
   - For friction, use [friction-log.md](../ziw-orchestrate/references/friction-log.md)
     with the configured complaint store and this role's mutation authority.
2. Read source containers' prose, linked docs, and acceptance signals. Check the
   planning handoff before adopting or creating tickets.
   - `Status: Ready for slicing`, or configured equivalent, may proceed.
   - `Status: Draft`, or configured equivalent, stops; report blocking questions.
     Exception: if explicitly asked to preserve a Draft, create or update only a non-ready
     `kind-spec` or `kind-epic` container carrying the gaps.
   - A legacy plan without status proceeds only when outcome, scope, non-goals,
     behavior, acceptance signals, and material open questions satisfy the ticket contract.
   - Return contradictions or questions affecting slice boundaries, risk, dependencies,
     or required proof to `ziw-grill`. Existing tickets do not weaken this gate;
     adopt only once the source defines their boundaries.
3. Draft and consolidate the whole slice list using [Plan slices](#plan-slices) before any tracker write.
4. Inventory existing tickets under the target; match planned slices by outcome,
   scope, and area before creating any ticket. Re-runs must converge without duplicates.
   - Adopt matches: apply the body contract, `kind-slice`, labels, and links.
     Create new slices only for unmatched planned work. Keep one canonical ticket
     when two cover one slice; mark the other duplicate.
   - Fold unstarted tickets failing the merge test into one canonical unstarted
     ticket. Carry over scope, acceptance criteria, spec citations, and footprint;
     re-estimate, repoint dependencies and coverage rows, and mark the rest duplicates.
   - Never fold into or out of a ticket that is claimed, active, or linked to an open PR.
     A fragment whose partner is active stays open, blocked by it, with `needs-info`
     asking whether the partner's PR covers it. Once the partner is Done, close
     the fragment as covered or reshape it as its own slice.
   - Preserve and report tickets outside the plan, including worker follow-ups and
     review debt. Leave them separate, never duplicates. Adoption fixes mechanics
     from plan evidence; unknowable intent gets `needs-info` with the exact question.
5. Fill every `kind-slice` body with outcome; context docs; likely files, packages,
   or artifacts; in scope; out of scope; acceptance criteria; required checks;
   security, privacy, data, and operational invariants; dependencies or blockers;
   and estimate when stored in the body. Apply [Body evidence](#body-evidence).
6. Set kinds, labels, estimates, and readiness from config.
   - Kind is separate from type. Set exactly one kind on every touched ticket;
     clear other `kind-*` values even if the tracker group allows several.
   - `kind-spec` holds spec or PRD prose; `kind-epic` holds a parent or workstream.
     Both are containers; link emitted slices under them. Only `kind-slice`, a
     one-PR implementation ticket, runs on a worker.
   - For each slice, apply one type, one risk label, routing and area labels.
     Estimate after consolidation per the Estimate Rules, only in the configured
     field and scale and within To Issues' authority. Omit estimates if config defines none.
   - Apply the worker environment label only when its approval criteria are met.
   - Apply `ready-for-agent` only when the slice fits one PR, survives the merge test,
     is routed, typed, risk-labeled, estimated if required, has concrete scope, and
     is complete enough to verify. Its body must not say human setup, credentials,
     provider decisions, or security judgment remain.
   - Place ready slices in the configured ready state, usually `Todo`, never Linear
     `Backlog`. Otherwise apply `needs-info` or `ready-for-human` with the exact gap.
   - Encode blockers separately. `ready-for-agent` means no further human refinement,
     not unblocked or startable. Blockers never withhold or remove `ready-for-agent`,
     the ready state, or an approved worker environment label.
7. Record the dependency graph so Orchestrator can compute the ready frontier
   and safe parallel work.
   - Use tracker relationship or blocker fields when supported, otherwise configured
     body shape, in the configured direction. By default, A needing B is blocked by B.
   - Each slice depends only on earlier ones; break and report cycles.
   - Serialize work that must not run concurrently even without data dependencies,
     such as shared schema or migration ordering.
   - For slices converging on core files or regenerating a shared artifact, land
     the convergent slice first or immediately adjacent to siblings, or serialize
     the cohort. Same-base siblings all conflict once one merges.
8. Record predicted file footprints in the configured location and shape. Workers may diverge.
   - Default to `## Likely files, packages, or artifacts`, one backticked path per
     bullet; use another shape only when config names one.
   - Include files, directories, packages, and shared document areas such as dense
     markdown lists, status ledgers, registries, changelogs, config tables, and
     sections many slices edit.
   - Treat heavy overlap as a merge candidate first; serialize or sequence only when
     a split reason keeps slices apart. Compare siblings and record hot files or packages
     and safe fan-out pairs before workers start.
9. For a spec, PRD, or container linking one, map coverage on the container body
   or configured location. Re-runs update the single matrix in place.
   - Rows use the spec section anchors slices cite, without separate numbering.
     A section is not a slice boundary; one slice usually covers several.
   - Map each requirement-bearing section to exactly one of implementing slice IDs,
     `deferred` with reason and owning ticket, or an open `needs-info` question.
     Mark sections without requirements `not-applicable`; absent anchors are uncovered gaps.
   - Report unmapped requirements. The run remains incomplete and the container's
     slices non-ready until every requirement-bearing section is mapped.
10. Heal stale or inconsistent structure from current evidence and record every fix.
    Repair wrong or duplicate `kind-*`, stale labels resolving to a verified one,
    re-run duplicates, and over-split cohorts. Escalate missing intent or authority
    and unknowable scope or criteria with exact `needs-info` questions; leave no silent
    dead end. Report the [Done](#done) results.

## Plan slices

Start from one slice per feature the plan asks for. Add a slice only when a
split reason forces it. Each slice costs a worker session, checks, review, PR,
and merge. That overhead outweighs smaller diffs, easier review, and parallel
fan-out, so none of those justify a split.

A slice delivers one outcome observable by a user, operator, or later slice,
verifiable end to end in one PR, including its Done. Include every needed layer,
tests, docs, config, fixtures, generated artifacts, and migration. A feature's
screens, endpoints, commands, states, and acceptance criteria are parts of its
one outcome, even when each is observable alone.

Ticket only stated requirements. Name tempting unrequested polish, cleanup,
hardening, future-proofing, and follow-ups in out-of-scope; raise important ones
on the container as open questions. Record vague ideas as open questions;
leave them un-ticketed until scope is clear.
Do not bundle unrelated outcomes, unrequired adjacent fixes, or another slice's
assigned work. A merge-test batch of trivial same-area items is one outcome.

### Split Reasons

A split reason names what would break if the parts shipped in one PR. Keep
slices separate only for:

- Size: the merged slice's estimate exceeds the configured maximum. Exception:
  without an estimate scale, the diff is too large to review in one sitting.
  Cut it into the fewest parts that fit, each with observable behavior.
- Rollout order: a deploy gate separates steps, such as cleanup before schema
  change or a flag or preview flip after enabling code. Put gated slices under a
  `kind-epic` so the first PR cannot close the whole scope.
- Authority: one part needs human planning, unsettled security judgment, or
  production approval that the rest does not.
- Readiness: one part awaits a question or external dependency while the rest can start.
- Separate features: the plan asks for unrelated features that it lets ship
  independently. Parts of one feature never qualify.

Do not split by layer, artifact type, file or module, work step, spec section,
acceptance criterion, screen, endpoint, command, or user state.

A different risk label alone is not a split reason. The merged slice keeps every
check, approval, and reviewer routing its parts' risks require, and its
invariants section names each risk.

Agent suitability determines readiness, not boundaries; do not carve out tests,
docs, or a small refactor to make an agent-fit ticket.

### Merge Test

A slice matching any line below is a fragment, not a ticket, unless a split
reason separates it from its fold target. This includes no-behavior cases:
a gated flag flip or expand-only migration stays separate. Dependency alone
does not make a fragment; lacking its own observable behavior does.
"Another slice" means unmerged; work for already-shipped behavior stands alone.

- No consumer or observable behavior in its PR, such as scaffold, types, interface,
  stub, config, or wiring: fold into its first consumer.
- Only tests, docs, fixtures, or generated artifacts for another slice: fold into it.
- A step such as checks, deploy or migration verification, or opening a PR: make it
  an acceptance criterion or required check on the verified slice.
- A mechanical change repeated across files, modules, or call sites: one slice
  unless size forces a split.
- Trivial work such as renames, copy, config values, or one-line fixes alongside
  planned work in the same area: fold in. Exception: batch trivial items sharing
  area, risk label, and checks into one outcome, such as "settings copy matches
  the spec". A small fix constituting the whole request stays one ticket.
- Shares most of its predicted footprint with the one slice it blocks or is blocked by:
  fold subject to the split-reason exception.

### Consolidate Before Writing

- Name the split reason separating each slice from every slice it blocks, is
  blocked by, or shares files with.
- Apply the merge test; merge pairs without split reasons. Size keeps a pair
  apart only when the merged pair meets the size reason above. In chains only
  unblocking the next link, merge only links without a split reason; rollout
  gates keep their two links apart.
- Re-split merged work exceeding one PR using a split reason.
- Record every split reason in dependencies or blockers for triage and in the run summary.
- Before creating more than three new slices in one run, show the user each
  slice's outcome, estimate, and split reason. Create only the list they confirm.
  Exception: when no user can confirm, create no slices and report the proposed
  list as the open question.

## Body evidence

- Scope is a hard stop. `In scope` names only behavior, files, docs, tests, and
  workflow state this PR may change. `Out of scope` names tempting adjacent work,
  known sibling IDs, polish, broad refactors, production actions, and follow-up
  behavior. If unclear, keep work under a container or mark `needs-info`.
- Context docs cite exact implemented spec, PRD, or ADR sections as resolvable
  anchors, such as `docs/specs/<file>.md#<section-anchor>`. Verify each resolves;
  spec-derived slices without them are non-ready. Never paraphrase spec behavior
  without citation or cite whole documents when sections apply.
- Acceptance criteria are proof obligations mapped one-for-one to evidence.
  Structural requirements name exact behavior and a regression test, such as
  "derive, do not copy", "fail closed", "no production-path assertion", "real
  driver path", or "env var reaches the test process".
- Put deploy prerequisites, runtime secrets, hosted gates, generated artifact
  updates, and CI env passthrough in explicit criteria or required checks,
  not background notes.
- Put exact external literals or their config lookup in the body, not only prior
  comments: config values, resource IDs, provider names, label slugs, secret names,
  and environment values.
- Auth, bootstrap, claim, invitation, one-use grant, custody, or ownership slices
  name authenticated actor, tenant or resource binding, replay behavior, atomic
  consume or claim, and concurrency checks before readiness.
- Custody, persistence, driver, or provider integration criteria must execute the
  real boundary: multi-instance readback, concurrent first use, real driver queries,
  env passthrough, or provider-shape checks. Prose-only assertions or only a mock
  of the integrated seam are insufficient.
- For dropping or narrowing schema on retained data, criteria specify deploy order.
  If the platform validates existing rows, pre-deploy cleanup lands first. Bulk
  migrations use a resumable batched runner, not one transaction. Name the production
  deploy status proving it landed; a green preview does not.
- Route high-risk or ambiguous work to human planning when the plan leaves security,
  product, data, or architecture decisions unsettled.
- For unknowable required fields, estimates, or boundaries, add the heading and
  exact question, apply `needs-info`, and keep non-ready. Exception: an unknowable
  required estimate gets `ready-for-human`. Never fabricate readiness content.

## Never

- Implement, review, open PRs, merge, deploy, or move active work.
- Ship or ready containers, mark them `ready-for-agent`, or dispatch them.
- Invent scope, acceptance criteria, product decisions, or decisions returned to `ziw-grill`.
- Create label taxonomies or statuses without config or explicit user approval.
- Put secrets, customer data, signed URLs, credentials, or private logs in ticket
  text. Keep it metadata-only.

## Done

Report:

- Source plan and target location.
- Slices created, adopted, and merged, duplicates converged, count, and each split reason.
- The user's confirmation when more than three new slices were created.
- Kinds set and contradictions healed.
- Estimates set, preserved, omitted by policy, or left with exact questions.
- Tickets marked `ready-for-agent`, `needs-info`, or `ready-for-human`.
- Dependency graph, cycles, and required serializations.
- Footprints and flagged overlaps.
- Coverage matrix location, mapped rows, uncovered or deferred sections.
- Heals, escalated gaps with exact questions, and answers needed before remaining
  slices become ready.
