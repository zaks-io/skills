---
name: ziw-architecture
description: Assess codebase architecture and propose module interface or ownership improvements from concrete caller and change-history evidence. Use for requested architecture assessments or module design; this is advisory work, not a routine PR review gate or permission to refactor.
---

# Architecture

Find worthwhile structural improvements or design a named module interface.
Finish with evidence, alternatives, and an actionable recommendation.

## Inputs

Requested area or interface problem and constraints; repo instructions; workflow
config when present; real callers, tests, relevant specs, glossary, and accepted ADRs.

## Steps

1. Load context for the requested work.
   - For assessments, load [assessment.md](references/assessment.md) and
     investigate the named area.
   - For module design, load [codebase-design.md](references/codebase-design.md),
     trace real callers, and compare plausible interfaces. A named module
     does not require a whole-codebase assessment.
   - Ordinary implementation and PR review may consult the design reference
     directly. This workflow is not mandatory for them.
   - Read configured planning paths before discovering conventions. For unmapped
     glossary paths, use [glossary-discovery.md](../ziw-grill/references/glossary-discovery.md).
   - For encountered friction, use [friction-log.md](../ziw-orchestrate/references/friction-log.md).
2. Recommend from concrete evidence.
   - Separate observed implementation from intended behavior. Support each
     change with real caller knowledge, repeated orchestration, change locality,
     or a verification gap; cite affected paths.
   - Compare compatibility, testability, migration cost, and domain ownership.
     Prefer existing interfaces and the simplest design that resolves the problem.
     A future adapter or line-count preference alone cannot justify an abstraction.
   - Show call examples or before/after dependency diagrams when useful. Explain
     which behavior becomes easier to verify and at what public interface.
   - State recommendation strength and uncertainty.
3. Return the report in conversation or at the requested location. Label written
   reports as proposals, distinct from accepted decisions and current-truth specs.
   - Assessment and design authorize investigation and proposals. Report ADR
     implications within that authority. An assessment needs no interview to finish.
   - If the user selects a proposal with material unanswered decisions, hand its
     evidence, alternatives, constraints, and ready questions to `$ziw-grill`.
     Selection authorizes exploration, not acceptance of every detail. Grill owns
     confirmed specs and explicit readiness approval.
   - Scoped implementation callers retain their original acceptance and proof boundaries.

## Never

- Manufacture candidates or infer defects from code alone.
- Implement code, change tracker state, create tickets or PRs, or mark specs
  ready under assessment or design authority.
- Create or override an accepted ADR.
- Launch implementation or ticket creation during handoff.

## Done

Return investigated scope and source evidence, candidates or why none warrant
change, interface alternatives, compatibility and migration implications,
verification opportunities, unresolved decisions, and the recommended next action.
