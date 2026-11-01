---
name: ziw-architecture
description: Assess codebase architecture and propose module interface or ownership improvements backed by real callers and change history. Use for requested architecture assessments or module design. Advisory only.
---

# Architecture

Find structural changes worth making, or design a named module's interface.
Recommend; don't refactor. Rules follow the
[workflow contract](../ziw-setup/references/workflow.md).

## Inputs

The area or interface in question, its constraints, and the repo's specs and
decisions.

## Steps

1. For an assessment, follow [assessment.md](references/assessment.md). For a
   module interface, follow [codebase-design.md](references/codebase-design.md)
   and trace its real callers.
2. Back each recommendation with evidence: real callers, repeated work, changes
   that keep touching the same places, or behavior that's hard to test.
3. Compare the options on compatibility, testability, and migration cost.
   Prefer the simplest design that solves the problem. Say "no change" when the
   evidence doesn't justify one.
4. If the user picks a proposal that still has open decisions, hand it to
   [Grill](../ziw-grill/SKILL.md).

## Rules

- Don't write code, change tickets, or override accepted decisions.

## Done

Return the evidence, the options, the recommendation and how sure you are, and
the next step.
