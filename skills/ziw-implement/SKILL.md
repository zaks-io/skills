---
name: ziw-implement
description: Use to implement one tracker issue end to end. Makes the scoped change, runs its checks, opens a draft PR with ziw-pr, and hands it back for independent review.
argument-hint: "[issue-id-or-url]"
---

# Implement

Deliver one ticket as a draft PR. Finish with a PR, or with the exact blocker.
Terms and rules follow the [workflow contract](../ziw-setup/references/workflow.md).

## Inputs

One ticket, the repo config, and the branch or worktree you were given.

## Steps

1. Read the ticket, `AGENTS.md`, the config, and the docs the ticket cites.
   If Orchestrate started you, the ticket is already claimed. If you were
   invoked directly, check that the ticket is ready and has no open blockers,
   then move it to `In Progress`.
2. Work on the branch you were given, or create the ticket branch. Never work
   in another session's worktree.
3. Restate the outcome, scope, and acceptance criteria. Stop and ask if the
   ticket is unclear, contradicts itself, or needs a human decision.
4. Make the change, following existing patterns. Add or update tests for the
   behavior you changed. For a bug, reproduce it first with
   [Debug](../ziw-debug/SKILL.md).
5. Run focused checks while you work, then the ticket's checks. Hooks and CI
   run the full gate.
6. Match each acceptance criterion to a test, check, or result you saw this
   session.
7. If the change is risky or you're unsure of it, run `ziw-code-review` as
   author QA and fix what it finds. This doesn't count as the independent
   review.
8. Run [Create PR](../ziw-pr/SKILL.md) to open a draft PR linked to the ticket.

## Review feedback

When review findings or failing checks come back, fix only those, push to the
same branch, and rerun the affected checks.

## Done

Report the PR URL and head, the checks run with results, how each acceptance
criterion is covered, whether you ran author QA, and any follow-ups.
