---
name: workflow-agent-review
description: Use for Agent Review, the independent review agent that reviews PRs by launching workflow-code-review in a clean subagent or worktree, reviews main-branch drift since its checkpoint, and creates tracker issues for Agent Orchestrator.
argument-hint: "[pr-url-or-range]"
disable-model-invocation: true
context: fork
agent: general-purpose
---

# Agent Review

Review PRs and merged state from clean context. Report active-work verdicts to
Agent Orchestrator and file actionable tracker issues for new drift. Do not implement
fixes or move active work between workflow states.

For Claude, this skill runs in a forked context. Reconstruct intent from repo
artifacts, tracker state, PR bodies, commits, and docs rather than parent
conversation history.

## Inputs

- PR URL, PR branch, or main-branch review range.
- Repo path, default branch, and checkpoint path from config.
- Linked issue, PR body, required checks, and relevant specs or ADRs.

## Context

Read first:

- `docs/agents/workflow/config.md`
- `AGENTS.md`
- `CONTEXT.md`
- project status, specs, ADRs, runbooks, and changed package docs
- tracked workflow config and existing issues

If config is missing, initialize only the checkpoint and report that
`workflow-setup` is needed.

## Checkpoint

Store checkpoint outside the repo:

```text
${CODEX_HOME:-$HOME/.codex}/automation-state/workflow-agent-review/<repo-slug>/last-reviewed-origin-main
```

On first run, write the current `origin/main` SHA and stop unless the user asked
for a backfill.

## Process

1. Fetch remote state.
2. Resolve default branch from config, usually `origin/main`.
3. Review active PRs that are waiting on independent review.
4. Load checkpoint.
5. If checkpoint equals current SHA, stop with "no new commits".
6. If checkpoint is not an ancestor, review only a safe reachable range or
   escalate the history problem.
7. Create a disposable worktree at current SHA.
8. Review the diff from checkpoint to current SHA as merged product state.
9. Run focused checks only when they are cheap and relevant.
10. Create or update tracker issues for real findings.
11. Advance checkpoint only after PR review, main review, and issue updates
    complete.
12. Remove disposable worktrees unless preserving them helps debugging.

## Review Delegation

Review PRs through `workflow-code-review`; do not inline the review inside
Agent Review.

Use one of these clean-context paths:

- Subagent: launch a fresh reviewer with the PR URL, repo path, base branch,
  linked tracker issue, required checks, and the instruction to use
  `workflow-code-review`.
- Worktree: create a disposable worktree from the PR head, read config there,
  and run `workflow-code-review` against the PR branch.

Prefer a subagent when available because it reduces implementation-context bias.
Prefer a worktree when tools cannot launch a subagent, when local checks need a
real checkout, or when the PR state must be inspected from a clean filesystem.

For each PR:

1. Confirm Agent Implement or `workflow-create-pr` ran code review when feasible.
2. Start the clean-context review with `workflow-code-review`.
3. Post or return findings without fixing the PR locally.
4. Report `Changes Requested` for blocking findings.
5. Include the CodeRabbit recommendation and PR readiness recommendation from
   the `workflow-code-review` output.
6. Report `Ready to Merge` only when review is clean, required checks pass, the
   PR is non-draft and ready-for-review, and required CodeRabbit escalation is
   complete or recorded as skipped by policy.
7. Send feedback to Agent Orchestrator so it can move tracker state, update PR
   draft state, apply or remove `Code review passed`, and nudge the original
   implementer.

## Review Focus

Look for:

- correctness regressions and broken user workflows
- mismatch between shipped behavior and issue, PR, spec, ADR, or config
- auth, authorization, tenant/workspace isolation, secrets, logging, retention,
  and public contract violations
- schema, migration, generated artifact, API, CLI, queue, background job, and
  deployment drift
- missing tests or verification for risky changes
- follow-up work discovered but not tracked in issue tracker

Use the code review checklist from
`workflow-code-review/references/review-checklist.md` as taxonomy.

## Tracker Issues

Before creating an issue, search for duplicates by problem, files, PR, and
commit range.

New issue rules:

- use configured provider location and routing label
- use `Bug` or `Tech Debt` unless the finding is clearly another type
- set risk label from config
- add readiness labels only when config allows Agent Review to create findings
  directly
- otherwise report labels for Agent Orchestrator to apply
- include reviewed range and file evidence
- keep issue text metadata-only

Minimum body:

```markdown
## Outcome

Fix the reviewed-main finding in one concrete PR.

## Context

- Reviewed range: <old-sha>..<new-sha>
- Relevant docs:

## Finding

<file/line evidence and failure mode>

## In scope

## Out of scope

## Acceptance criteria

- [ ] ...

## Required checks

## Dependencies
```

## Done

Report PRs reviewed, reviewed main range, issues created or recommended, checks
run, CodeRabbit recommendations, PR readiness recommendations, checkpoint
result, `Code review passed` label recommendation with reviewed head SHA,
handoff to Agent Orchestrator, and residual risk.

## Guardrails

- Do not modify product code.
- Do not push fixes to PR branches.
- Do not merge, revert, force-push, deploy, or mutate production.
- Do not move active implementation issues between workflow states.
- Do not create low-confidence, duplicate, or style-only issues.
- Escalate instead of ticketing when a finding needs product, security,
  customer, credential, provider, or ADR judgment.
