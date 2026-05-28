---
name: zaks-local-code-review
description: Use when reviewing local changes, an implementation branch, or an uncommitted diff before opening a PR.
---

# Zaks Local Code Review

Review local changes before a PR exists. This is a pre-PR quality gate, not a
substitute for PR review.

## Review Model

Use the strongest available code-review-capable model and reasoning setting. If
only a lower-tier reviewer is available, state that limitation in the output.

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
- the Linear issue body when the changes correspond to an issue
- context docs named by the issue
- changed app/package README or context docs

Also use `zaks-code-review` and its checklist for the bug taxonomy.

## Diff Scope

Determine the review scope before reading code:

1. Check the current branch and working tree.
2. Identify the base branch, usually `main`.
3. Review committed branch changes against the merge base.
4. Include uncommitted changes when the user asked for working-tree review or
   the implementation worker is doing a final self-check before PR.

If the intended issue or base branch is unclear, state the assumption in the
output.

## Review Checks

Check:

- The diff is scoped to one Linear issue when issue context is available.
- The branch or PR metadata includes the `<issue-id>` issue.
- The implementation satisfies the issue acceptance criteria.
- Required checks are present or there is a clear reason they have not run yet.
- Security invariants from the issue, ADRs, and specs still hold.
- Sensitive values are not logged, stored, tested as fixtures, screenshotted, or
  exposed.
- Authorization uses documented scopes and repository seams.
- Tests cover risky behavior, tenant boundaries, and security boundaries for the
  slice.
- Cross-layer invariants hold for every touched workflow:
  - accepted auth principals match route contracts, rate limits, repository
    actors, audit events, and tenant isolation expectations
  - idempotency covers completed retries, in-flight retries, and optional side
    effects such as notifications, queue sends, and external API calls
  - destructive paths perform required invalidation and cleanup before old
    externally visible handles can still resolve
  - specs, route contracts, schemas, implementation, docs, and tests describe
    the same behavior
- Docs changed only when the contract changed or the issue required it.
- The diff has no leftover TODOs, debug output, commented dead code, unrelated
  cleanup, or broad refactors outside the issue scope.

## Output

Lead with findings, ordered by severity, with file and line references when
available.

Use this verdict:

- `READY FOR PR`: no blocking findings remain.
- `NEEDS REVISION`: blocking findings or missing required checks remain.

If findings require implementation changes, keep the Linear issue in
`In Progress`. The assigned implementation worker should fix the same branch
before opening a PR.

## Guardrails

- Do not make code changes unless the user explicitly asks for fixes.
- Do not move Linear to `In Review`; that happens after the PR is opened.
- Do not broaden scope or create product/security decisions during review.
- Create follow-up Linear issues for adjacent work instead of requesting
  unrelated changes in this branch.
- Never include sensitive values in review output, examples, comments, logs, or
  screenshots.
