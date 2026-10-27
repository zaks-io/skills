# Delegation Policy

Use this reference when launching local worktree workers, issue-assigned agents,
Cursor remote agents, or review/triage workers. Done means the worker has a
bounded prompt and a verified return path.

## Steps

1. [Choose the role](#role-split).
2. [Build its prompt](#prompt-rules) using the templates below.
3. [Verify issue-assigned agents](#issue-assigned-agents) when that route applies.
4. [Continue the same worker](#remote-continuation) for fixes or changed scope.
5. [Apply environment metadata](#worker-environment-metadata) from verified approval criteria.

## Role Split

- Orchestrator owns the loop and metadata decisions; it delegates context-heavy work without reviewing diffs or patching source.
- Implementers code, check, choose author QA by judgment, and use `ziw-pr` for draft PR handoff.
- Reviewers return independent findings from clean context under
  [Review lifecycle](integrate-checklist.md#review-lifecycle) and [Review limits](../../ziw-code-review/SKILL.md#review-limits).
- Triage repairs shape, dependencies, routing, readiness, and queue truth.
- Orchestrator merges and writes the default branch only through
  [integrate-checklist.md](integrate-checklist.md), within configured merge authority.
- Orchestrator performs routine branch updates; delegate only reported conflicts.

## Prompt Rules

Build short prompts. The worker must fetch details from the repo, tracker,
branch, PR, or linked docs. Include hard literals only when the issue depends on
exact external config, resource IDs, provider names, label slugs, secret names,
or environment values.

Always include:

- repo path
- tracker issue URL plus `issueKey`/`issueUuid` when known, or PR URL/number
- confirmed session/receipt identity supplied by the worker runtime, preserved
  in the return; never invent a session ID from an issue or worktree
- one-sentence scope
- explicit non-goals and sibling tickets not to deliver
- branch/worktree policy
- required checks or config reference
- constraints: preserve unrelated changes, no production deploy, no secrets
- role boundary: author QA is not independent review evidence; the implementer
  cannot mutate review-evidence labels or merge-ready state
- author-QA policy: use worker judgment based on risk, uncertainty, scope, and
  test evidence; do not require review after every change
- review history on review/repair continuations: completed rounds including
  Author QA, limit, prior findings, attempted fixes, and any stop condition

If a critical literal exists only in a prior comment, update or route the issue
body first so the worker does not rediscover it from history.

## Implementation Prompt

```text
Use the isolated implementation worker for this runtime.
Claude Code: zaks-io-skills:ziw-implementer.
Codex or Agent Skills: $ziw-implement.
Repo: <path>
Issue: <URL; issueKey/issueUuid when known>
Receipt/session: <receiptId/sessionId assigned by the runtime; report unknown if unavailable>
Branch/worktree: <branch-or-create-policy>
Scope: <one sentence from issue>
Non-goals: <out-of-scope line from issue, including sibling tickets; do not deliver adjacent work>
Required checks: <commands or config reference>
Review history: <completed rounds including Author QA, limit, findings, attempted fixes, stop condition; preserve on return>
Constraints: preserve unrelated changes; no production deploy; no secrets. Use best judgment on whether author QA adds value; do not run or repeat it merely because a commit changed. Author QA is not independent review evidence. Do not apply or clear review-evidence labels, move the issue to `Ready to Merge`, or apply merge-ready PR labels.
Return the workflow handoff, including actual receipt/session identity, PR number,
worktree path, and explicit running/returned/stopped lifecycle. Opening a PR does
not by itself confirm that the worker returned.
```

## Review Prompt

```text
Use the isolated review worker for this runtime.
Claude Code: zaks-io-skills:ziw-reviewer.
Codex or Agent Skills: $ziw-code-review.
Repo: <path>
PR/branch/range: <target>
Base: <base branch or range>
Review target: <head SHA and review-diff fingerprint; one request per materially distinct diff>
Delta from: <previously reviewed head SHA from the planner's deltaFrom, or none for a full review>
Intent source: <issue or PR URL>
Required checks: <commands or config reference>
Review history: <completed rounds including Author QA, limit, findings, attempted fixes, stop condition>
Do the review yourself. Never spawn subagents or delegate any review work.
Return the review report and no code changes. With a delta, review how the PR's
own patch changed since that head and the interactions it affects. Compare
`git diff <base>...<delta>` with `git diff <base>...HEAD`, including merge
resolutions; `git range-diff` skips merges and `git diff <delta> HEAD` adds base changes.
Refuse an empty diff or a duplicate equivalent-diff review request.
```

## Triage Prompt

```text
Use the isolated triage worker for this runtime.
Claude Code: zaks-io-skills:ziw-triager.
Codex or Agent Skills: $ziw-triage.
Repo: <path>
Scope: <ticket list, query, project, Linear Backlog, intake scope, or delivery scope>
Goal: <make ready/current work truthful/until Linear Backlog clear>
Authority: <config mutation authority summary>
Backlog gate: <whether Linear Backlog review/backfill was explicitly requested>
Return changed issues, newly startable issues, blockers, and questions.
```

## Issue-Assigned Agents

Use tracker assignment only when the tracker exposes an assignable coding agent
or config verifies a delegation field, tool, or agent ID. This is not a local CLI invocation.

- Verify the issue resolves by configured tracker ID.
- Apply [dispatch preconditions and capacity](dispatch-policy.md#dispatch-preconditions),
  including current priority, environment metadata, and one primary outcome.
- Verify the requested delegation mechanism read-only.
- Do not mutate real issues to probe capability. Use metadata or documented config; otherwise report missing setup.
- Exception: an explicitly approved probe uses a dedicated test issue, restored afterward.

## Remote Continuation

The assigned agent owns its environment, branch, implementation run, review,
and PR return path.

- Send fixes or scope changes to the same session's latest agent thread,
  configured reply location, or provider continuation target.
- For Cursor, use top-level issue comments only when config verifies they continue that session.
- If no direct target exists, report the missing path instead of starting a second agent.
- Send one authoritative reply explicitly superseding earlier guidance when instructions change mid-session.

## Worker Environment Metadata

Environment labels/fields, such as `remote-cursor`, are approval metadata.

- Apply or preserve them after verifying issue identity, repo route, and configured environment approval criteria.
- Dependency blockers need not be clear to apply environment labels.
- Remote ineligibility does not bar authorized local implementation, including sensitive or cross-cutting work.
- Use the local budget policy; record a local-budget hold only when that path is paused.
