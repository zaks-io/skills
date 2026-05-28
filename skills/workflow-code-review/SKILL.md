---
name: workflow-code-review
description: Use for code review before opening a PR, before handing off a branch, or when reviewing committed changes, uncommitted changes, a PR branch, or a main-branch commit range for correctness, security, scope, tests, and issue tracker fit.
when_to_use: Use automatically for code review requests, pre-PR review gates, PR branch review, main drift review, or when another workflow skill asks for workflow-code-review.
argument-hint: "[branch|pr-url|range]"
context: fork
agent: general-purpose
---

# Code Review

Run a bug-focused review from local files or a clean worktree. This is the
shared review gate for implementation self-checks, PR reviews, worker handoffs,
and main-branch drift checks.

For Claude, this skill runs in a forked context to avoid implementation-context
bias. Reconstruct intent from explicit arguments, repo config, tracker state,
PR bodies, commits, and docs.

## Inputs

- Branch, PR URL, commit range, or current working tree to review.
- Base branch from config or Git, usually `origin/main`.
- Issue, PR, spec, ADR, or user request that defines intent.

## Context

Read first when present:

- `docs/agents/workflow/config.md`
- `AGENTS.md`
- `CONTEXT.md`
- project status, roadmap, specs, ADRs, and runbooks relevant to touched files
- linked tracker issue body, comments, labels, dependencies, and acceptance
  criteria
- changed app or package README/context docs

Load [references/review-checklist.md](references/review-checklist.md) for the
bug taxonomy. Load [references/remote-worker-review.md](references/remote-worker-review.md)
only when preparing a remote worker review.

## Scope

1. Identify base branch from config or Git, usually `origin/main`.
2. Review committed branch changes against merge base.
3. Include uncommitted changes when the user asked for a working-tree review or
   this is a pre-PR self-check.
4. For PR review, use a clean checkout or disposable worktree for the PR head.
5. For main drift review, compare the checkpoint range supplied by Agent Review.
6. Recover intent from the user request, tracker issue, PR body, commits, and
   docs before judging implementation.
7. Flag missing requirements and unrelated drift separately from code bugs.

## Review

Check:

- issue and PR scope
- acceptance criteria
- auth, authorization, tenant or workspace boundaries
- secrets, tokens, signed URLs, customer data, and logging
- destructive operations, retention, revocation, migrations, and rollback
- concurrency, idempotency, queues, background jobs, and retries
- public API, CLI, schema, generated artifacts, and docs contract drift
- tests that would fail for the likely bug
- package manager, CI, preview, and deploy rules from config

Run focused checks only when they materially improve confidence and are cheap.
Do not spend time on style nits or broad refactors.

## CodeRabbit

Default to `SKIP` after a clean code review.

Recommend `CLI` or `PR REVIEW` only for high-risk or genuinely complex work:
auth, authorization, secrets, payments, destructive data, migrations,
background jobs, public contracts, broad refactors, or unresolved reviewer
uncertainty. Treat missing auth, rate limits, or credits as skipped unless the
user explicitly requested CodeRabbit.

## Output

```markdown
## REVIEW REPORT

Scope check: CLEAN | DRIFT DETECTED | REQUIREMENTS MISSING
Diff: <N files, +X/-Y>
Checks run: <commands or "not run">
CodeRabbit recommendation: SKIP | CLI | PR REVIEW, because <reason>

Findings:

- [P1] (confidence: 9/10) path/file.ts:42 - <bug and impact>
  Evidence: <short source fact>
  Fix: <specific direction>

High-priority remaining: <none or list>
Verdict: READY FOR PR | APPROVE | NEEDS REVISION | DO NOT MERGE
```

## Guardrails

- Do not edit code unless the user explicitly asks for fixes.
- Do not move the issue to `In Review`; Agent Queue handles that after PR
  creation.
- Do not move an issue to merge-ready state unless Agent Queue or the user asked
  you to manage tracker state.
- Do not broaden scope or decide product/security questions during review.
- Create or recommend follow-up tracker issues for adjacent work.
- Never include sensitive values in review output.
