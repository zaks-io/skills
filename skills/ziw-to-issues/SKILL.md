---
name: ziw-to-issues
description: Use to turn a ready spec, PRD, or epic ticket into the fewest one-PR tickets, each with a complete body, labels, likely files, and dependency order.
argument-hint: "[spec-path|epic-ticket]"
---

# To Issues

Turn a ready spec into the fewest tickets that can each ship as one PR. Tickets
follow the [workflow contract](../ziw-setup/references/workflow.md#ticket-body).

## Inputs

A spec, PRD, or epic; the repo config; and any tickets that already exist for it.

## Steps

1. Check the spec says `Status: Ready for slicing`. If it says `Draft`, stop
   and send its open questions back to Grill.
2. Start from one ticket per feature the spec asks for. Split a feature only
   when one of these holds, and write the reason down:
   - **Size**: it exceeds the largest estimate config allows, or is too large to
     review in one sitting.
   - **Rollout order**: a deploy has to happen between the parts.
   - **Authority**: one part needs a human decision or approval the rest
     doesn't.
   - **Readiness**: one part is waiting on an answer and the rest can start.

   Never split by layer, file, step, or acceptance criterion. Tests, docs, and
   wiring belong in the ticket whose behavior they serve.

3. Check for existing tickets with the same outcome and update them rather than
   creating duplicates.
4. If you would create more than three new tickets, show the list with each
   split reason and wait for confirmation.
5. Write each ticket: full body, one kind, one risk, the route label, and an
   estimate if config requires one. Put tickets for one spec under its epic.
6. Record dependencies: a ticket that needs another is blocked by it.
7. File complete tickets in the ready state with `ready-for-agent`. File
   incomplete ones in the intake state with `needs-info` and the exact
   question.

## Rules

- Never invent scope, acceptance criteria, or file paths. A missing fact
  becomes a `needs-info` question.
- Epics and specs are containers; never mark them ready.
- Don't change tickets that are in progress or have an open PR.

## Done

Report the tickets created or updated with each split reason, the dependency
order, which spec requirements each ticket covers, and any requirement left
uncovered or deferred.
