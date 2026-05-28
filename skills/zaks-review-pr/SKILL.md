---
name: zaks-review-pr
description: Use when reviewing a PR against its Linear issue, acceptance criteria, security invariants, tests, and docs.
---

# Zaks Review PR

Review PRs for correctness, security posture, and issue fit. Use a bug-focused
review stance.

## Review Model

Use the strongest available code-review-capable model and reasoning setting. Do
not use the fast implementation workhorse as the default reviewer when a
stronger review tier is available.

If only a lower-tier reviewer is available, state that limitation. Do not move
security-sensitive, schema, destructive-data, auth, authorization, background
job, or cross-cutting PRs to `Ready to Merge` without a strong review pass or
explicit human approval.

## Required Context

Read these first:

- `AGENTS.md`
- `docs/ops/project-status.md`
- `docs/agents/workflow.md`
- `docs/agents/autonomous-loop.md`
- `docs/agents/issue-tracker.md`
- `CONTEXT.md`
- `docs/specs/README.md`
- `docs/adr/README.md`
- the PR description, commits, changed files, and checks
- the linked Linear issue body, comments, labels, dependencies, and linked docs

Also use `zaks-code-review` and its checklist for the bug taxonomy.

## Review Checks

Check:

- The PR implements the linked issue and does not bundle unrelated work.
- Acceptance criteria are satisfied and observable.
- Tests are meaningful for risky behavior and would fail for the likely bug.
- Contracts, docs, generated artifacts, and ledgers are updated when behavior
  changed.
- Auth, authorization, tenant isolation, tokens, logging, retention, background
  work, and public API/CLI behavior still match the ADRs and specs.
- Required checks passed, or any skipped checks have an explicit reason.

## Output

Lead with findings, ordered by severity, with file and line references when
available. If there are no blocking findings, say that directly and list any
residual risk or test gap.

When running under the queue-moving loop and findings require author changes:

- post detailed feedback on the PR
- move or ask the queue-moving loop to move Linear to `Changes Requested`
- send feedback back to the original implementation worker thread
- keep fixes on the same branch and PR

Move Linear to `Ready to Merge` only when the user asked you to manage Linear
state, review is clean, and required checks are passing.
