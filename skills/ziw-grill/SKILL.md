---
name: ziw-grill
description: Grills a plan or spec with rounds of focused questions until it is a spec ready for slicing into tickets. Use when asked to grill, or when an unresolved product, scope, or design question blocks safe progress.
argument-hint: "[idea|plan|spec-path]"
---

# Grill

Ask the questions that settle a plan, then write it down as a spec. Grill
settles decisions; it doesn't create tickets or code. Rules follow the
[workflow contract](../ziw-setup/references/workflow.md).

## Inputs

An idea, plan, or existing spec, plus the repo and its workflow config.

## Steps

1. Read the plan, related specs, the glossary, and enough code to know what
   exists. Answer anything the evidence settles yourself.
2. Ask one numbered round of the open questions that matter most. For each,
   give the evidence, your recommendation, and what it changes. Wait for
   answers.
3. Repeat until no question would change scope, behavior, risk, or acceptance.
   Stop asking about preferences that change nothing.
4. Write or update the spec in the configured specs directory, with
   `Status: Draft` and these sections: Outcome, Scope, Non-goals, Behavior,
   Edge cases and failures, Acceptance, and Open questions (each one blocking or
   deferred, with a reason).
5. When nothing blocking remains, ask exactly
   `Mark this spec ready for slicing?` Only on a yes, change the status line
   to `Status: Ready for slicing` and run the focused checks.

If the answer only clarifies existing work and changes no scope or acceptance,
return it to whoever asked instead of writing a spec.

Write an ADR only for a decision that is expensive to reverse, surprising
without its rationale, and chosen among real alternatives.

## Rules

- Never decide a product or design question for the user.
- Don't edit specs until the user has confirmed the decision.
- Don't create tickets, write code, or start To Issues yourself.

## Done

Report the spec path and status, the decisions made, and the open questions.
For a ready spec, give the handoff: `$ziw-to-issues <spec-path>`.
