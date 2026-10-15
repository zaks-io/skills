---
name: ziw-grill
description: Grills plans or specs in rounds of independent questions and produces authoritative specs ready for ticket slicing. Use for requested grilling or material product, domain, scope, or architecture ambiguity that blocks safe progress after evidence is checked.
argument-hint: "[idea|plan|spec-path|prd|adr]"
---

# Grill

Turn fuzzy or contradictory plans into shared understanding and authoritative
planning artifacts. Finish with the spec's status and either the next question
round or the exact To Issues handoff. Grill owns clarification, not tickets or
implementation.

## Inputs

- An idea, plan, question, PRD, ADR set, or existing spec to challenge.
- The current repo, caller context, and workflow config when available.

## Steps

1. [Read context](#read-context) and the planning-artifact contract.
2. [Build the decision tree](#build-the-decision-tree) from evidence and unresolved decisions.
3. [Ask a question round](#ask-a-question-round) with independent, ready questions.
4. [Update artifacts](#update-artifacts) after explicit confirmation, then recompute the tree.
5. [Confirm readiness](#confirm-readiness) when the pre-approval gate can pass.
6. [Hand off to the caller](#hand-off-to-the-caller) within the original scope.
7. [Report the result](#done).

## Invocation Threshold

- Explicit invocation always starts.
- Invoke implicitly only when an unresolved product, domain, scope, or architecture decision could change behavior, ticket boundaries, risk, dependencies, or required proof.
- Check available evidence before implicit invocation.
- Say what ambiguity caused the pause.
- Do not invoke for routine details, harmless preferences, or discoverable facts.

## Read context

- Read repo instructions first.
- Then read the planning-artifact mapping in `docs/agents/workflow/config.md` when present.
- Load [references/planning-artifacts.md](references/planning-artifacts.md) for authority, default formats, ADR rules, and the readiness contract.

Load additional references only for the matching work:

- Designing or changing a module interface:
  [codebase-design.md](../ziw-architecture/references/codebase-design.md).
- Planning across sessions:
  [references/resumable-planning.md](references/resumable-planning.md).
- Encountered friction:
  [../ziw-orchestrate/references/friction-log.md](../ziw-orchestrate/references/friction-log.md).

**Exception: config does not map planning artifacts.**

- Discover existing specs, context or glossary files, ADRs, roadmaps, and relevant implementation.
- Preserve the established convention.
- Report the missing mapping as a Setup gap.

## Build the decision tree

- Treat code and external systems as evidence, not automatically as intended behavior.
- For existing artifacts, run a contradiction and requirement-coverage pass first.
- **Exception: a new idea.** Build the decision tree from scratch.
- Use the same readiness contract for both paths.
- Build a private decision tree ordered by dependency and impact.
- Cover only applicable outcome, actor, language, scope, behavior, data, security, failure, concurrency, integration, operations, rollout, and acceptance branches.
- Resolve discoverable facts from code, docs, config, or authoritative sources.

## Ask a question round

- Ask ready questions in one numbered round, ordered by impact.
- A ready question has no unresolved prerequisite.
- Give each question evidence, a recommended answer, and its consequence.
- Keep rounds easy to answer.
- Split a large set of ready questions into coherent batches.
- Keep a single ready question single.
- If an answer could change another question's options or recommendation, ask the dependent question in a later round.
- Accept authoritative facts without reconfirmation.
- Wait for the user's answers.
- Record only what each answer confirms, without adding exclusivity or unstated constraints.
- Keep unanswered ready questions in the next round.
- **Exception: explicit deferral.** Leave questions the user explicitly defers out of the next round.
- Ground recommendations in this task's evidence.
- Label assumptions.
- Investigate facts independently.
- Challenge vague terminology and propose one canonical term.
- Stress-test answers with concrete scenarios, especially boundary, lifecycle, failure, concurrency, authorization, and recovery cases.

## Update artifacts

- After explicit confirmation, update the smallest authoritative artifact set immediately.
- Keep the active spec `Draft`.
- Update the spec that already owns the behavior.
- **Exception: no spec owns the behavior.** Create one focused spec.
- Update context docs only for domain language.
- Create an ADR only after a confirmed decision passes all three ADR tests in the reference.
- In conversation-only use, emit a self-contained Markdown spec.
- Recompute the decision tree from the answers and evidence before repeating the question round.
- Repeat for unresolved branches until the reference's pre-approval gate can pass, then move to readiness confirmation.

## Confirm readiness

- Keep the active spec `Draft`.
- After the reference's pre-approval gate and final contradiction pass, present the recommendation, outcome, non-goals, deferred questions, changed artifacts, risks, and assumptions.
- Ask exactly one final question: `Mark this spec ready for slicing?`
- Change status to `Ready for slicing` only after explicit confirmation.
- Run configured documentation checks.
- Failed checks return the spec to `Draft`.

## Hand off to the caller

- Return to an implementation caller only when no ticket scope, risk, dependency, acceptance, or proof boundary changed.
- **Exception: a boundary changed.** Stop implementation.

Use the matching handoff:

- File: `$ziw-to-issues <spec-path>`
- Conversation: `$ziw-to-issues use the Ready for slicing spec in this conversation`

## Never

- Do not create or edit tracker tickets.
- Do not invoke To Issues, implement code, open PRs, merge, or deploy.
- Do not edit planning artifacts before the user confirms the decision.
- Do not ask a question that available evidence can answer.
- Do not answer a product or architecture decision on the user's behalf.
- Do not substitute an ADR, transcript, scratch note, or ticket for current truth.
- Do not widen the PR or silently rewrite tracker work when a boundary changes.
- Do not expose secrets or private customer data in planning artifacts.

## Done

Report:

- Spec status and path.
- Decisions and evidence.
- Changed artifacts.
- Blocking and deferred questions.
- Checks.
- Setup gaps.
- Either the next question round or the exact file-backed or conversation-only To Issues handoff.
