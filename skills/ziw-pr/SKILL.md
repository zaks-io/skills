---
name: ziw-pr
description: Use when opening, refreshing, or shipping the current branch as a pull request with Conventional Commits, push, PR creation, and issue linking, in bounded fix rounds; hooks and CI are the check gate.
argument-hint: "[issue-id|branch|pr-url]"
---

# Create PR

Open/update the current branch's PR, link its issue, and hand off for independent
review. Finish with the PR or a concrete stop report. Hooks and CI own checks;
skip issue search, code review, and CI waiting except as specified below.

## Steps

1. [Gather](#gather) branch state and the issue.
2. [Check the branch and scope](#branch-and-scope).
3. [Commit and push](#commit-and-push), taking [fix rounds](#fix-rounds) for
   hook failures.
4. [Open or update the PR](#pr) as draft and link the issue.
5. [Report](#done) without waiting for CI.

**Friction:** file encountered friction with the configured complaint tool, once per distinct issue and without secrets. Load [friction-log.md](../ziw-orchestrate/references/friction-log.md) only for a tracker fallback, orchestrator event categories, or a run rollup.

## Inputs

Current branch/changes; optional issue ID, branch, or PR URL. From Agent Implement,
take the author-QA decision, passed checks, issue title/URL, and scope confirmation.

## Gather

Read `docs/agents/workflow/config.md`; if absent, use repo files and request
`ziw-setup`. Gather in parallel: `git status --short`, `git diff HEAD`, current
branch, `git log --oneline -10`, and its existing PR.

Take the issue from the invocation, caller, PR links, branch, or commits;
never search. Fetch title, URL, and non-goals once. Exception: the caller
supplied title/URL and confirmed scope.

## Branch and scope

- On the default branch or detached HEAD, create a branch with the configured prefix, such as `<branch-prefix>/<issue-id>-<short-slug>`. Keep other branch names.
- Update the existing branch PR; preserve every issue link.
- Include all repo changes except secrets, credential files, and unintended
  lockfiles.
- Without a caller's scope confirmation, compare the diff once against the
  issue's out-of-scope list.

Stop when the diff holds a secret, unrelated work, or work the issue names out
of scope.

## Commit and push

Run no checks; trust caller results, hooks, and CI. Exceptions before the
first commit, neither counted as a fix round:

- Manifests changed without the lockfile: run the configured install and include the lockfile.
- No hook/CI full gate and no caller-reported pass: run the configured full local gate once.

Then:

- Stage with `git add -A`; unstage `.env*`, credential files, local secrets,
  and unintended lockfiles.
- Use Conventional Commits, with the configured issue trailer when an issue
  exists, defaulting to `Issue: <ISSUE-ID>`.
- Push.

Cache hits count regardless of config cache policy. Do not use cache-busting
flags, including `--force`/`--no-cache`. Exception: bypass only a task config
names as missing cache-key inputs.

## Fix rounds

For a hook failure or rejected push: find the cause, fix it, commit, and push
again. Optionally confirm with only the failing task.

- Every round must change something. Exception: one unchanged transient-error retry costs no round.
- A different failure after a fix is progress and does not reset the count.
- "The same failure" means the same check failing with the same error.

Stop and report, instead of starting another round, when:

- you cannot find a cause; do not try speculative changes;
- the same failure survives two fixes;
- three fix rounds have run;
- a product, design, or scope decision is needed, including outside-issue packages;
- the push or PR needs a permission you lack.

## PR

Open new PRs as draft and preserve existing draft state under the
[review lifecycle](../ziw-orchestrate/references/integrate-checklist.md#review-lifecycle).
Exception: open new PRs non-draft when user/config requests; report independent review as pending.
Do not wait for CI or hosted review.

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

Use the implementer's [author-QA decision](../ziw-implement/SKILL.md#author-qa).
Run `ziw-code-review` here only when the user asks in this request.

## Never

- Do not apply or clear review-evidence labels, move the issue to
  `Ready to Merge` or `Done`, or apply merge-ready PR labels.
- Do not push to the default branch, use `--no-verify`, commit secrets, or deploy production.
- Do not amend published commits or force-push unless the user asks.
- Do not request hosted bot review.

## Done

Report observed results without polling. At a stop, name the decision needed
and hand back. Agent Implement copies these fields into its
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
