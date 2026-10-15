---
name: ziw-architecture
description: Assess codebase architecture and propose module interface or ownership improvements from concrete caller and change-history evidence. Use for requested architecture assessments or module design; this is advisory work, not a routine PR review gate or permission to refactor.
---

# Architecture

Find worthwhile structural improvements or design a named module interface.
Finish with evidence, alternatives, and a recommendation the user can act on,
including a reason when no improvement earns its cost.

## Inputs

- The requested assessment area or interface design problem and its constraints.
- Repo instructions.
- Workflow config when present.
- Real callers, tests, relevant specs, glossary, and accepted ADRs.

## Steps

1. [Choose the work](#choose-the-work) and load the relevant context.
2. [Recommend](#recommend) from concrete evidence and alternatives.
3. [Hand off](#hand-off) within the request's authority.
4. [Report the result](#done).

## Choose the work

- **Assessment:** load [references/assessment.md](references/assessment.md)
  and investigate the named area.
- **Module design:** load [references/codebase-design.md](references/codebase-design.md),
  trace real callers, and compare plausible interfaces.
- A named module request does not require a whole-codebase assessment.
- Ordinary implementation and PR review callers may consult the design
  reference directly for their scoped changes.
- Read configured planning paths before discovering conventions.
- For unmapped glossary paths, use
  [glossary-discovery.md](../ziw-grill/references/glossary-discovery.md).
- For encountered friction, use
  [friction-log.md](../ziw-orchestrate/references/friction-log.md).

## Recommend

- Separate observed implementation from intended behavior.
- Support each proposed change with real caller knowledge, repeated
  orchestration, change locality, or a verification gap.
- Cite affected paths.
- Compare compatibility, testability, migration cost, and domain ownership.
- Prefer existing interfaces and the simplest design that resolves the
  observed problem.
- A future adapter or a line-count preference alone does not justify a new
  abstraction.
- Show concrete call examples or before/after dependency diagrams when useful.
- Explain which behavior becomes easier to verify and at what public interface.
- State recommendation strength and uncertainty.
- If no improvement earns its cost, say so.

## Hand off

- Assessment and design requests authorize investigation and proposals.
- Keep proposed designs distinct from accepted decisions.
- Return an assessment report in conversation or write it to the requested
  location.
- Label written reports as proposals rather than current-truth specs.
- Report ADR implications within the limits in [Never](#never).
- An assessment may end with recommendations. An interview is not required
  to finish it.
- A scoped implementation caller retains its original acceptance and proof
  boundaries.

**Selected proposal with material unanswered decisions:**

- Hand its evidence, alternatives, constraints, and ready questions to `$ziw-grill`.
- Selection authorizes exploring that proposal. It does not accept every
  design detail.
- Grill owns confirmed specs and explicit readiness approval.

## Never

- Make this workflow mandatory for ordinary implementation or PR review.
- Manufacture candidates or infer defects from code alone.
- Implement code, change tracker state, create tickets or PRs, or mark specs
  ready under assessment or design authority.
- Create or override an accepted ADR.
- Launch implementation or ticket creation as part of the handoff.

## Done

Return:

- Investigated scope and source evidence.
- Candidates, or the reason none warrant change.
- Interface alternatives.
- Compatibility and migration implications.
- Verification opportunities.
- Unresolved decisions.
- The recommended next action.
