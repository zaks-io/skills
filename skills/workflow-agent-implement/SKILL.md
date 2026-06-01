---
name: workflow-agent-implement
description: Use for Agent Implement when taking one tracker issue through the full implementation pipeline by claiming the issue, making scoped changes locally or remotely, verifying, running workflow-code-review, iterating until PR-ready, running workflow-create-pr, and updating issue tracking.
argument-hint: "[issue-id-or-url]"
disable-model-invocation: true
---

# Agent Implement

Implement exactly one issue as one scoped PR. Own the whole path from assigned
work through PR creation unless blocked by missing credentials or permissions.

## Inputs

- One tracker issue ID or URL, or a worker assignment that names one issue.
- Repo path, branch, and agent access constraints from
  `docs/agents/workflow/config.md`.
- Required checks and acceptance criteria from the issue.

## Context

Read first:

- `docs/agents/workflow/config.md`
- `AGENTS.md`
- `CONTEXT.md`
- linked tracker issue body, comments, labels, dependencies, and attachments
- docs named by the issue
- changed package or app README/context docs

If config is missing, infer minimally and report that `workflow-setup` is needed.

## Claim

Start only when the issue:

- belongs to the configured tracker location
- is unblocked
- is scoped to one PR
- has `ready-for-agent`
- has any project-configured worker environment label or field required for the
  selected delegation path
- has the configured repo-route label (such as `<org>/<repo>`) when the
  delegation path needs it to resolve the target repository
- has enough acceptance criteria and required checks to verify

For issue-assigned agents, the claim should come from the configured issue
tracker assignment. Do not treat a local CLI with the same brand name as the
issue-tracker integration.

When starting:

- confirm Agent Orchestrator moved or delegated the issue to `In Progress`
- assign yourself or record the delegate when supported
- comment with the short plan
- use or create a branch containing the issue ID

If invoked directly outside Agent Orchestrator, do not move workflow state unless the
repo config or user explicitly delegates that authority. Otherwise report the
needed claim transition for Agent Orchestrator.

Stop on missing product, security, credential, provider, ADR, customer, or
production approval decisions.

## Implement

- Stay inside the issue scope.
- Preserve unrelated user changes.
- Follow existing repo patterns and package boundaries.
- Update tests, docs, generated artifacts, and status ledgers only when the
  behavior contract changed or the issue requires it.
- Create follow-up tracker issues for adjacent work instead of broadening scope.
- Never deploy production, rotate secrets, or mutate live customer data without
  explicit approval.

## Implementation Pipeline

Treat implementation, code review, and PR creation as one pipeline:

1. Implement the scoped change.
2. Run focused checks while iterating.
3. Run the issue's required checks.
4. Run `workflow-code-review`.
5. Fix blocking findings and rerun relevant checks.
6. Repeat code review until the verdict is `READY FOR PR`, or stop on a
   blocker that needs human input.
7. Run `workflow-create-pr` to commit, push, create or update the PR, and update
   the issue tracker. Tell Create PR whether the latest code review covers the
   current diff and whether any CodeRabbit escalation remains.

Do not hand off after code changes alone. A completed Agent Implement run should
end with a PR or a clear reason the PR could not be created.

## Verify

Run the issue's required checks first, then the configured full local gate unless
a narrower gate is justified. Use focused checks while iterating.

If hosted verification is required but not authorized or unavailable, stop and
report the gap. Do not mark acceptance criteria complete on partial evidence.

## Review And PR

Use `workflow-code-review` as the implementation quality gate. Then use
`workflow-create-pr` as the shipping gate. `workflow-create-pr` may rerun code
review, but Agent Implement should still run it before PR creation so review
feedback is handled while the implementation context is fresh.

Do not leave the PR in draft after checks and code review pass unless the user
or repo config explicitly asks for a draft handoff. If a draft handoff remains,
report it as pre-review and state exactly what must happen before Agent
Orchestrator can mark it ready-for-review. Ready-for-review means non-draft.

Remote workers should not create another worktree. Continue on the assigned
branch and PR for review fixes.

Issue-assigned agents should receive fixes and PR process feedback as direct
replies to the assigned agent's continuation target. For remote Cursor agents, do
not rely on top-level issue comments unless config verifies that they continue
the assigned-agent session.

## Changes Requested

When resuming:

- read PR comments, failed checks, issue context, and config again
- address only requested changes and directly required tests/docs
- push fixes to the same PR
- comment with what changed and checks rerun
- report that the issue is ready to return to `In Review` for Agent Orchestrator

## Done

Report:

- issue ID and branch
- PR URL or reason no PR exists
- files changed
- checks run and result
- code review verdict
- whether code review covers the current diff
- PR draft or ready-for-review state
- `Code review passed` recommendation with reviewed head SHA
- CodeRabbit decision or remaining escalation
- tracker comments and status handoff
- blockers or follow-up issues
