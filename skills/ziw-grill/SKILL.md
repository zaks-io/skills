---
name: ziw-grill
description: Grills plans or specs in rounds of independent questions and produces authoritative specs ready for ticket slicing. Use for requested grilling or material product, domain, scope, or architecture ambiguity that blocks safe progress after evidence is checked.
argument-hint: "[idea|plan|spec-path|prd|adr]"
---

# Grill

Resolve material ambiguity. Return a confirmed clarification to its caller, or
prepare authoritative planning artifacts for an explicitly approved slicing handoff.
Grill owns clarification, not tickets or implementation.

## Inputs

- An idea, plan, question, PRD, ADR set, or existing spec to challenge.
- The current repo, caller context, and workflow config when available.

## Steps

1. [Choose scope](#choose-scope) and check available evidence.
2. [Ask a question round](#ask-a-question-round) for material unresolved decisions.
3. Return a resolved scoped clarification, or [update planning artifacts](#update-planning-artifacts).
4. For slicing handoffs, [confirm readiness](#confirm-readiness) and report the result.

## Choose scope

- Explicit invocation always starts.
- Invoke implicitly only after checking evidence for an unresolved product,
  domain, scope, or architecture decision affecting behavior, ticket boundaries,
  risk, dependencies, or required proof. Name the ambiguity causing the pause.
- Read repo instructions and the planning-artifact mapping in
  `docs/agents/workflow/config.md`. Discover unmapped specs, glossaries, ADRs,
  roadmaps, and relevant implementation; preserve conventions and report the Setup gap.
- **Scoped clarification:** when the confirmed answer leaves ticket scope, risk,
  dependencies, acceptance, and proof boundaries unchanged, return it to the caller.
  Update an existing owning doc only when needed, with applicable documentation
  checks. No new spec, Draft transition, slicing approval, or To Issues handoff is required.
- **Planning:** for new plans or changed boundaries, load
  [references/planning-artifacts.md](references/planning-artifacts.md) for authority,
  ADR rules, and readiness. A changed boundary stops implementation; continue
  clarification without widening the PR or silently rewriting tracker work.

Load additional references only for the matching work:

- Designing or changing a module interface:
  [codebase-design.md](../ziw-architecture/references/codebase-design.md).
- Planning across sessions:
  [references/resumable-planning.md](references/resumable-planning.md).
- Encountered friction:
  [../ziw-orchestrate/references/friction-log.md](../ziw-orchestrate/references/friction-log.md).

## Ask a question round

- Build a private decision tree ordered by dependency and impact. Check existing
  artifacts for contradictions and requirement coverage; start new ideas from scratch.
- Cover applicable outcome, actor, language, scope, behavior, data, security,
  failure, concurrency, integration, operations, rollout, and acceptance branches.
  Code and external systems are evidence, not automatically intended behavior.
- Resolve discoverable facts independently from code, docs, config, or authoritative sources.
- Ask ready questions in one numbered round, ordered by impact, with evidence,
  a recommendation, and its consequence. Split large sets into coherent batches;
  keep a single question single. Defer dependent questions whose options or
  recommendations could change with another answer.
- Accept authoritative facts without reconfirmation.
- Wait for answers and record only what they confirm, without unstated constraints.
  Retain unanswered ready questions unless explicitly deferred.
- Ground recommendations in evidence, label assumptions, propose canonical terms,
  and stress-test boundary, lifecycle, failure, concurrency, authorization, and recovery cases.
- Recompute after answers. Continue only while material decisions remain; do not
  repeat answered questions or add rounds for harmless preferences. If a round
  yields no answer or new evidence, report the pending decision instead of looping.

## Update planning artifacts

- After explicit confirmation, update the smallest authoritative artifact set.
  Update the owning spec, or create one focused spec when none exists. Keep it
  `Draft` until readiness approval. Both existing and new specs use the reference's readiness contract.
- Update context docs only for domain language. In conversation-only planning,
  emit a self-contained Markdown spec.
- Create an ADR only after a confirmed decision passes all three ADR tests in the reference.

## Confirm readiness

- After the reference's pre-approval gate and final contradiction pass, present
  the recommendation, outcome, non-goals, deferred questions, artifacts, risks, and assumptions.
- Ask exactly one final question: `Mark this spec ready for slicing?`
- Change status to `Ready for slicing` only after explicit confirmation.
- Run configured documentation checks.
- Failed checks return the spec to `Draft`.

For a ready spec, return the matching handoff without invoking it:

- File: `$ziw-to-issues <spec-path>`
- Conversation: `$ziw-to-issues use the Ready for slicing spec in this conversation`

## Never

- Do not create or edit tracker tickets.
- Do not invoke To Issues, implement code, open PRs, merge, or deploy.
- Do not edit planning artifacts before the user confirms the decision.
- Do not invoke for routine details, harmless preferences, or discoverable facts.
- Do not ask a question that available evidence can answer.
- Do not answer a product or architecture decision on the user's behalf.
- Do not substitute an ADR, transcript, scratch note, or ticket for current truth.
- Do not expose secrets or private customer data in planning artifacts.

## Done

Report the confirmed clarification or spec status/path, decisions and evidence,
changed artifacts/checks, material questions, and Setup gaps. Return to the caller,
ask the next ready question round, or give the exact To Issues handoff as applicable.
