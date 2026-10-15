---
name: ziw-pr
description: Use when opening, refreshing, or shipping the current branch as a pull request with Conventional Commits, push, PR creation, and issue linking, in bounded fix rounds; hooks and CI are the check gate.
argument-hint: "[issue-id|branch|pr-url]"
---

# Create PR

Get the branch to an open, non-draft PR linked to its issue, then hand off.
That is the whole job. You have standing permission to skip everything else:
no checks of your own, no code review, no issue search, no CI wait. Hooks run on
commit and push, CI runs on the PR, and Agent Review owns independent review.

For encountered friction, use [friction-log.md](../ziw-orchestrate/references/friction-log.md)
with the configured complaint store and this role's mutation authority.

## Inputs

- The current branch and its changes.
- Optional issue ID, branch, or PR URL from the invocation.
- The caller's report, when Agent Implement calls you: author-QA decision,
  checks that passed, issue title and URL, and scope confirmation.

## Steps

1. [Gather](#gather) branch state and the issue.
2. [Check the branch and scope](#branch-and-scope).
3. [Commit and push](#commit-and-push), taking [fix rounds](#fix-rounds) for
   hook failures.
4. [Open or update the PR](#pr) as non-draft and link the issue.
5. [Report](#done) without waiting for CI.

## Gather

Read `docs/agents/workflow/config.md` if present; otherwise use repo files and
note that `ziw-setup` should run. In one parallel batch, gather
`git status --short`, `git diff HEAD`, the current branch,
`git log --oneline -10`, and the branch's existing PR.

Take the issue from the invocation, the caller, the existing PR's issue links,
the branch name, or the commits. Never search for one. Fetch it once for its
title, URL, and out-of-scope list, unless the caller gave the title and URL and
confirmed scope.

## Branch And Scope

- Never push to the default branch. On the default branch or detached HEAD,
  create a branch with the configured prefix, such as
  `<branch-prefix>/<issue-id>-<short-slug>`. Keep any other branch name.
- Update the branch's existing PR instead of opening a duplicate, and keep
  every issue link it already has.
- Include all repo changes except secrets, credential files, and unintended
  lockfiles.
- Without a caller's scope confirmation, compare the diff once against the
  issue's out-of-scope list.

Stop when the diff holds a secret, unrelated work, or work the issue names out
of scope.

## Commit And Push

**Checks: run none.** A caller's reported results, the hooks, and CI are the
evidence; trust a caller's report as given. Two exceptions, both before the
first commit and neither counted as a fix round:

- Package manifests changed without the lockfile: run the configured install
  so the lockfile ships with them.
- Neither a hook nor CI runs the full gate, and the caller did not report it
  passing: run the configured full local gate once.

Then:

- Stage with `git add -A`; unstage `.env*`, credential files, local secrets,
  and unintended lockfiles.
- Use Conventional Commits, with the configured issue trailer when an issue
  exists, defaulting to `Issue: <ISSUE-ID>`.
- Push.

A cache hit is valid evidence, whatever config says about cache policy.

## Fix Rounds

A hook failure or rejected push starts a fix round: find the cause, fix it,
commit, optionally run just the failing task to confirm, then push again.

- A round must change something. One plain retry with no change is allowed
  for a transient error such as a network failure; it is not a round.
- A different failure after a fix is progress and does not reset the count.
- "The same failure" means the same check failing with the same error.

Stop and report, instead of starting another round, when:

- you cannot find a cause; do not try speculative changes;
- the same failure survives two fixes;
- three fix rounds have run, even if a fourth looks close; or
- the fix needs a product, design, or scope decision, such as editing a
  package outside the issue; or
- the push or PR needs a permission you lack.

## PR

Create or update the PR as non-draft, and mark an existing draft ready now,
unless the user or config requires a draft; report a required draft as
pre-review. Do not wait for CI or hosted review.

Title: the issue title, otherwise the commit subject; under 70 characters when
practical.

Body:

```markdown
## Summary

[why this change exists]

## Changes

- [key change]

## Risk: LOW | MEDIUM | HIGH

[what could break]

## Test plan

- [x] [command and result, including hook runs and reused caller checks]

[Issue: ISSUE-ID](url)
```

Risk is a label for the reader and triggers nothing. HIGH: auth, secrets,
destructive data, schema migrations, queues or background jobs, production data
flow, public contracts, broad refactors. MEDIUM: normal feature logic. LOW:
docs, tests, copy, isolated UI.

Issue linking:

- Put the issue's exact URL in the PR body. With a tracker and code-host
  integration, that link is the association and the integration moves issue
  state; otherwise attach the PR URL to the issue.
- A title or branch token alone is only a delivery hint.
- Change issue state only when config or the user delegates it to Create PR.

## Review

Author QA is the implementer's judgment-based call, made before this skill
runs. Run `ziw-code-review` here only when the user asks for it in this
request; a new commit alone never calls for it. Hosted bot review belongs to
Agent Orchestrator or the user.

Create PR does not own approval state. Author QA is not independent review
evidence.

## Never

- Do not apply or clear review-evidence labels, move the issue to
  `Ready to Merge` or `Done`, or apply merge-ready PR labels.
- Do not use `--no-verify`, commit secrets, or deploy production.
- Do not pass `--force`, `--no-cache`, or other cache-busting flags, except to
  bypass the cache for one task config names as having a cache key that misses
  inputs.
- Do not amend published commits or force-push unless the user asks.
- Do not request hosted bot review.

## Done

The PR exists on the code host, or a stop rule fired. Fill the report from what
you just did, without polling. A stop is a report, not a wait: name the
decision needed and hand back. Agent Implement copies these fields into its
[handoff](../ziw-setup/references/handoff.md).

```text
PR:     <url and number> (<ready-for-review|draft>) | none, stopped
Head:   <sha>, <pushed|unpushed>
Checks: <reused caller checks and hook runs, with results>; CI <pending|state|not run>
Review: author QA <caller's decision | user-requested verdict | none>
Issue:  <issueKey and URL>, <linked|not linked yet> | untracked
Rounds: <count and what each tried; if stopped, the rule and the failure>
Next:   <owner and exact next action>
```
