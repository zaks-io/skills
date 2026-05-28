---
name: zaks-implement-issue
description: Use when implementing one Linear issue as one scoped branch and PR, especially a Todo or In Progress project issue labeled ready-for-agent.
---

# Zaks Implement Issue

Implement one ready Linear issue. Keep the change scoped to that issue and the
repo's current docs.

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
- the Linear issue body, comments, labels, dependencies, and linked docs

Cursor workers must also read `docs/agents/remote-cursor-agent.md`.

## Claim

Before editing:

- confirm the issue is unblocked, scoped to one PR, and labeled
  `ready-for-agent`
- require `remote-cursor` for Cursor Background Agent work
- stop on missing product, security, credential, provider, or ADR decisions
- move the issue to `In Progress` when claiming it
- include `<issue-id>` in the branch name when no branch was assigned

## Implementation Rules

- Implement only the issue scope and directly required tests/docs.
- Use current repo behavior. This project is pre-launch, so do not add legacy
  compatibility shims.
- Preserve unrelated user changes in the worktree.
- Read package/app README or local context docs before editing that area.
- Update `docs/ops` ledgers only when the change affects project status,
  implementation state, coverage, or hosted operations.

## Verification

Run focused checks while iterating. Before handoff, run the checks named by the
issue and use `pnpm verify` unless a narrower gate is justified.

Common checks:

```sh
pnpm --filter <package-name> test
pnpm --filter <package-name> typecheck
pnpm openapi:check
pnpm verify
```

Use `pnpm smoke:local` when the change touches publish/read/delete flows or
shared runtime behavior. Use hosted commands only when the issue explicitly
authorizes credentials and environment access.

## Pre-PR Review

Before opening a PR, run or request `zaks-local-code-review` on the local
branch or working-tree diff when the environment supports it. Address blocking
findings before PR handoff.

## PR Handoff

Open a ready-for-review PR, not a draft, unless the issue explicitly asks for a
draft. Use `zaks-create-pr` when available.

The handoff must include:

- summary of behavior changed
- files changed
- checks run, with exact command names
- local review verdict and CodeRabbit decision
- checks not run and why
- known gaps, follow-up issues, or blocked hosted verification

Move the Linear issue to `In Review` once the PR is ready for review. Do not
move it to `Ready to Merge`.

## Changes Requested

When resuming after review feedback:

- continue the same branch and PR
- read PR review comments, failed checks, the Linear issue, and linked docs
- address only requested changes and directly required tests/docs
- push fixes to the same PR
- leave a short PR or Linear comment summarizing what changed and which checks
  were rerun
- move the issue back to `In Review` when fixes are ready for another review
  pass
