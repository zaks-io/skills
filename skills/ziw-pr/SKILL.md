---
name: ziw-pr
description: Use when opening, refreshing, or shipping the current branch as a pull request with cached focused checks, Conventional Commits, push, PR creation, and issue linking.
argument-hint: "[issue-id|branch|pr-url]"
---

# Create PR

Ship the current branch as a non-draft pull request and hand off in one pass.
This is a shipping step, not a verification or review stage: hooks and CI run
the full gate, and Agent Review owns independent review. Stop only for secrets
in the diff, unrelated work mixed together, a check failure you cannot fix
mechanically, or missing permission.

For encountered friction, use [friction-log.md](../ziw-orchestrate/references/friction-log.md)
with the configured complaint store and this role's mutation authority.

## Inputs

The current branch and its changes, plus an optional issue ID, branch, or PR
URL from the invocation. Read `docs/agents/workflow/config.md` if present; otherwise use repo files and
note that `ziw-setup` should run. In one parallel batch, gather
`git status --short`, `git diff HEAD --stat`, the current branch,
`git log --oneline -10`, and the branch's existing PR.

Use an issue only when the invocation, branch name, or commits name its ID.
Fetch it once for its title, URL, and out-of-scope list. Do not search for or
create a tracking issue; report the PR as untracked instead.

## Branch And Scope

- Never push to the default branch. On the default branch or detached HEAD,
  create a branch with the configured prefix, such as
  `<branch-prefix>/<issue-id>-<short-slug>`.
- Update the branch's existing PR instead of opening a duplicate.
- Include all repo changes except secrets, credential files, and unintended
  lockfiles.
- Ask before shipping only when the diff mixes unrelated work or contains
  something the linked issue names out of scope.

## Checks

- When the caller, usually Agent Implement, reports checks that passed on this
  tree, reuse them and run nothing again.
- Otherwise run the configured focused checks for the touched packages, plus
  the docs format check when Markdown changed. When manifests, lockfiles, or
  generated sources changed, run the configured install or artifact refresh
  first.
- Run the full local gate by hand only when neither a hook nor CI runs it.
- Use task caches. A cache hit is valid evidence; never pass `--force`,
  `--no-cache`, or other cache-busting flags. When config names a task whose
  cache key misses inputs, rerun only that task. A config policy that distrusts
  the cache wholesale is stale: use the cache and report that `ziw-setup` should
  refresh it.
- Fix mechanical failures and rerun only the failing check. Stop and report a
  failure you cannot fix mechanically. Never use `--no-verify`.

## Review

Author QA is judgment-based and belongs to the implementer. Run
`ziw-code-review` here only when the user asks, or when the change is HIGH risk
and the caller reports no author QA. Never run or repeat it
merely because a commit changed. If it runs, fix P0/P1 findings and ask before
architecture, product, security, or data-behavior changes.

Do not request hosted bot review; Agent Orchestrator or the user owns that
escalation.

## Commit And Push

- Stage with `git add -A`, then unstage `.env*`, credential files, local
  secrets, and unintended lockfiles.
- Use Conventional Commits. Add the configured issue trailer when an issue
  exists, such as `Issue: <ISSUE-ID>` or `Fixes #123`.
- If a hook fails, fix the root cause and commit again. Do not amend published
  commits or force-push unless the user asks.

## PR

Create or update the PR as non-draft unless the user or config requires a
draft, and report a draft as pre-review. Mark an existing draft ready when
checks pass and no blocker remains. Do not wait for CI or hosted review; report
their state at handoff.

Title: the issue title when available, otherwise the commit subject; under 70
characters when practical.

Body:

```markdown
## Summary

[why this change exists]

## Changes

- [key change]

## Risk: LOW | MEDIUM | HIGH

[what could break]

## Test plan

- [x] [command and result]

[Issue: ISSUE-ID](url)
```

Risk is HIGH for auth, secrets, destructive data, schema migrations, queues or
background jobs, production data flow, public contracts, or broad refactors;
MEDIUM for normal feature logic; LOW for docs, tests, copy, or isolated UI.

## Issue Tracker

When an issue exists, keep its exact URL in the PR body and attach the PR to
it. A title or branch token is only a delivery hint, not an issue association.
When the tracker and code host are linked, the integration moves issue state;
do not duplicate it. Otherwise make only the review-state transition that
config or the user delegates to Create PR. Never move the issue to `Done`.

Create PR does not own approval state. Author QA is not independent review
evidence. Do not apply or clear review-evidence labels, move the issue to
`Ready to Merge`, or apply merge-ready PR labels.

## Done

The PR exists on the code host and the report below is filled from current
code-host state. Agent Implement copies these fields into its
[handoff](../ziw-setup/references/handoff.md).

```text
PR:     <url and number> (<ready-for-review|draft>)
Head:   <sha>
Checks: <commands and result, or reused from caller>; CI <state at handoff>
Review: author QA <reused|ran: verdict|skipped: reason>
Issue:  <issueKey and URL, linked | untracked>
Next:   <owner and exact next action>
```

Never commit secrets, bypass hooks, or deploy production.
