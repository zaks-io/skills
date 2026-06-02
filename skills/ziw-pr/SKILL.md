---
name: ziw-pr
description: Use when opening, refreshing, or shipping the current branch as a pull request with local checks, code review, Conventional Commits, PR creation, and issue tracking.
argument-hint: "[issue-id|branch|pr-url]"
disable-model-invocation: true
---

# Create PR

Take the current code to a non-draft ready-for-review PR. Do the whole workflow
unless blocked.

## Inputs

- Current branch and all intended staged or unstaged repo changes.
- Optional issue ID, branch name, or PR URL from the invocation.
- Repo config for checks, branch naming, PR format, and tracker updates.

## Context

Read `docs/agents/workflow/config.md` first. If missing, infer the minimum from
repo files and note that `ziw-setup` should be run.

Gather in parallel:

- `git status --short`
- `git diff HEAD`
- `git branch --show-current`
- `git log --oneline -10`
- existing PR for the branch

## Issue Tracker

Find or create tracking before naming the PR:

1. If the branch or commits include an issue ID, fetch that issue.
2. Otherwise search the issue tracker using branch name, commit subjects, touched packages,
   and diff keywords.
3. If exactly one issue is a strong match, use it. If matches are ambiguous,
   ask. If none exists and the change is non-trivial, create a tracking issue
   in the configured provider location with the repo routing label.
4. Capture original intent: title, scope, out of scope, acceptance criteria,
   required checks, and linked docs.

Skip issue tracker only when tools are unavailable or config lacks enough information.
Record the skip in the final report.

## Scope And Branch

- Never push to the default branch.
- If already on a feature branch, use it.
- If on the default branch or detached HEAD, create a branch using the repo
  config branch prefix, such as `<branch-prefix>/<issue-id>-<short-slug>` when
  an issue exists.
- If a PR already exists for this branch, update that PR instead of creating a
  duplicate.
- Include all staged and unstaged repo changes by default, except secrets.
- If the diff is unrelated work mixed together, stop and ask how to split.

## Checks

Run the repo full local gate from config. If absent, discover it from package
scripts, CI, Makefile, Justfile, lockfiles, and touched languages.

Run focused checks for high-risk touched areas. Fix mechanical failures and
rerun. Never use `--no-verify`.

## Code Review

Before committing, check whether a fresh `ziw-code-review` artifact already
covers the current diff. If no review has run, or the diff changed since the
review, run `ziw-code-review`. Fix P0/P1 findings and obvious mechanical
P2 findings. Ask before broad architecture, product, security, or data-behavior
changes.

Use CodeRabbit only when code review recommends it, the change is high-risk, or
the user asks. Missing auth, rate limits, or credits are a skip, not a blocker.
Record the CodeRabbit decision in the handoff so Agent Orchestrator can decide
whether any post-PR escalation remains.

## Commit

- Stage with `git add -A`.
- Unstage `.env*`, credential files, local secrets, and unintended lockfiles.
- Use Conventional Commits.
- Include the configured issue trailer or link when an issue exists, such as
  `Issue: <ISSUE-ID>`, `Fixes #123`, or the repo's configured equivalent.
- If hooks fail, fix root cause and create a new commit. Do not amend published
  commits unless the user explicitly asks.

## PR

Create or update a ready-for-review PR unless the user asked for draft or a
required review gate has not passed. Ready-for-review means non-draft.

If an existing PR is draft, mark it ready-for-review when the current diff has a
clean code review, required local checks pass, and the user did not ask to keep
it draft. Refresh the code-host PR state afterward and verify it is non-draft. If
CodeRabbit `PR REVIEW` is recommended for a high-risk or complex open PR, report
that post-PR escalation in the handoff; do not use draft state as a holding pen
after local review is clean.

If the user or repo config requires a draft PR, report the PR as a draft
pre-review handoff. Do not call it ready-for-review until it is marked non-draft
in the code host.

PR title:

- Use the tracker issue title when available.
- Keep under 70 characters when practical.

PR body:

```markdown
## Summary

[why this change exists]

## Changes

- [key change]

## Risk: LOW | MEDIUM | HIGH

- Areas touched:
- Security:
- Performance:
- Breaking:

## Test plan

- [ ] [command or verification]

[Issue: ISSUE-ID](url)
```

Risk is HIGH for auth, authorization, secrets, destructive data, schema
migrations, queues/background jobs, production data flow, public contracts, or
broad refactors. MEDIUM is normal feature/business logic work. LOW is docs,
tests, copy, or isolated UI.

## Issue Tracker Update

When an issue exists:

- attach the PR URL
- report the configured review-state transition, usually `In Review`, for
  Agent Orchestrator
- comment with checks run, code review verdict, CodeRabbit decision,
  PR draft or ready-for-review state, `Code review passed` recommendation with
  reviewed head SHA, acceptance criteria status, and differences from original
  intent
- never move to `Done`; merge is not complete

Do not move workflow state unless the repo config or user explicitly delegates
that authority to Create PR.

## Done

Report:

```text
PR:     <url>
Title:  <title>
Risk:   <LOW|MEDIUM|HIGH>
Checks: <commands and result>
Review: local <verdict>; CodeRabbit <skipped|CLI|PR review>
PR state: <draft|ready-for-review>
Issue:  <issue, handoff status, created, or skipped>
```

## Guardrails

- Never bypass hooks.
- Never commit secrets.
- Never force-push unless the user explicitly requested it for an existing PR
  maintenance flow.
- Never deploy production manually.
