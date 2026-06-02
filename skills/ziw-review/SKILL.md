---
name: ziw-review
description: Use for independent review that reviews the latest committed PR heads by launching ziw-code-review in a clean subagent or worktree, reviews main-branch drift since its checkpoint, and creates tracker issues or orchestrator refactor findings for Agent Orchestrator.
argument-hint: "[pr-url-or-range]"
disable-model-invocation: true
context: fork
agent: general-purpose
---

# Review

Review PRs and merged state from clean context. Always review current committed
code, not stale local files. Report active-work verdicts, stale-state gaps, and
orchestrator refactor findings to Agent Orchestrator. File actionable tracker
issues for new drift. Do not implement fixes or move active work between
workflow states.

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
`ziw-setup` is needed.

## Checkpoint

Store checkpoint outside the repo:

```text
${CODEX_HOME:-$HOME/.codex}/automation-state/ziw-review/<repo-slug>/last-reviewed-origin-main
```

On first run, write the current `origin/main` SHA and stop unless the user asked
for a backfill.

## Process

1. Fetch remote state.
2. Resolve default branch from config, usually `origin/main`.
3. Resolve each reviewed PR or branch to the current code-host head SHA.
4. Review active PRs that are waiting on independent review.
5. Load checkpoint.
6. If checkpoint equals current SHA, stop with "no new commits".
7. If checkpoint is not an ancestor, review only a safe reachable range or
   escalate the history problem.
8. Create a disposable worktree at current SHA.
9. Review the diff from checkpoint to current SHA as merged product state.
10. Run focused checks only when they are cheap and relevant.
11. Create or update tracker issues for real findings.
12. Advance checkpoint only after PR review, main review, and issue updates
    complete.
13. Remove disposable worktrees unless preserving them helps debugging.

## Review Delegation

Review PRs through `ziw-code-review`; do not inline the review inside
Agent Review.

Use one of these clean-context paths:

- Subagent: launch a fresh reviewer with the PR URL, repo path, base branch,
  linked tracker issue, required checks, current PR head SHA, and the instruction
  to use `ziw-code-review` against the latest committed code only.
- Worktree: create a disposable worktree from the PR head, read config there,
  and run `ziw-code-review` against the current PR branch head.

Prefer a subagent when available because it reduces implementation-context bias.
Prefer a worktree when tools cannot launch a subagent, when local checks need a
real checkout, or when the PR state must be inspected from a clean filesystem.

For each PR:

1. Confirm Agent Implement or `ziw-pr` ran code review when feasible.
2. Fetch remote state and verify the local review target matches the current
   code-host PR head. If not, update or recreate the review worktree and restart
   the review.
3. Verify the PR head is stable enough to review. If the head changed during
   review setup, the code host has not attached checks to the current head yet,
   or the implementation session is still actively pushing, stop with a stale
   review-target finding instead of producing a verdict for a moving head.
4. Start the clean-context review with `ziw-code-review`.
5. Post or return findings without fixing the PR locally.
6. Report `Changes Requested` for blocking findings.
7. Include stale-state findings when review evidence, local refs, draft state, or
   tracker metadata no longer match the current PR head.
8. Include the CodeRabbit recommendation and PR readiness recommendation from
   the `ziw-code-review` output.
9. Report `Ready to Merge` only when review is clean, required checks pass, the
   PR is non-draft and ready-for-review, and required CodeRabbit escalation is
   complete or recorded as skipped by policy.
10. Send feedback to Agent Orchestrator so it can move tracker state, update PR
    draft state, apply or remove `Code review passed`, and nudge the original
    implementer.

## Review Focus

Look for:

- correctness regressions and broken user workflows
- mismatch between shipped behavior and issue, PR, spec, ADR, or config
- auth, authorization, tenant/workspace isolation, secrets, logging, retention,
  and public contract violations
- security-sensitive flows where route input must bind to the authenticated
  actor, tenant, or capability rather than trusting a supplied user or owner ID
- one-use grants, bootstrap claims, revocation, or invitation flows that must be
  atomic under retries and concurrent attempts
- schema, migration, generated artifact, API, CLI, queue, background job, and
  deployment drift
- missing tests or verification for risky changes
- follow-up work discovered but not tracked in issue tracker
- orchestrator refactor opportunities: repeated manual repairs, stale review
  evidence, unclear status transitions, missing workflow config, brittle
  handoffs, review debt that cannot become clean `kind-slice` work, or places
  where Orchestrator has to infer state the systems of record should expose

Use the code review checklist from
`ziw-code-review/references/review-checklist.md` as taxonomy.

## Tracker Issues

Before creating an issue, search for duplicates by problem, files, PR, and
commit range.

Review-created issues are current-work intake, not a parking lot. Use the
configured review-debt intake filter, label, project, or parent so Issue Triage
and Agent Orchestrator can find them without a separate human sweep. If config
does not define a review-debt intake location, use the normal repo route and
report the missing config as a setup gap.

New issue rules:

- use configured provider location and routing label
- use `Bug` or `Tech Debt` unless the finding is clearly another type
- set risk label from config
- set `kind-slice` only when the finding is scoped to one concrete PR with clear
  acceptance criteria and checks; otherwise create or recommend `kind-spec` or
  `kind-epic` for To Issues to slice
- add `ready-for-agent` and the worker environment label only when config allows
  Agent Review to create implementation-ready review debt directly and the issue
  satisfies the full body contract
- otherwise apply or recommend `needs-info` or `ready-for-human` with the exact
  decision needed, so the issue is visible but not dispatchable
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

Report PRs reviewed, freshness result for each review target, reviewed main
range, issues created or recommended, checks run, CodeRabbit recommendations, PR
readiness recommendations, checkpoint result, `Code review passed` label
recommendation with reviewed head SHA, review-debt intake route used,
orchestrator refactor candidates, handoff to Agent Orchestrator, and residual
risk.

## Guardrails

- Do not modify product code.
- Do not push fixes to PR branches.
- Do not merge, revert, force-push, deploy, or mutate production.
- Do not move active implementation issues between workflow states.
- Do not create low-confidence, duplicate, or style-only issues.
- Escalate instead of ticketing when a finding needs product, security,
  customer, credential, provider, or ADR judgment.
