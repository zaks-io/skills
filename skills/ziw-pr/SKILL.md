---
name: ziw-pr
description: Use when opening, refreshing, or shipping the current branch as a pull request in one pass with Conventional Commits, push, PR creation, and issue linking; hooks and CI are the check gate.
argument-hint: "[issue-id|branch|pr-url]"
---

# Create PR

Commit, push, open or update a non-draft PR, link the issue, and hand off in
one pass. That is the whole job. You have standing permission to skip
everything else: this skill runs no checks of its own, no code review, no issue
search, and no CI wait. Hooks run on commit and push, CI runs on the PR, and
Agent Review owns independent review. Stop and ask only for a secret in the
diff, unrelated work mixed together, a hook failure you cannot fix, or missing
permission.

For encountered friction, use [friction-log.md](../ziw-orchestrate/references/friction-log.md)
with the configured complaint store and this role's mutation authority.

## Inputs

The current branch and its changes, plus an optional issue ID, branch, or PR
URL from the invocation. Read `docs/agents/workflow/config.md` if present;
otherwise use repo files and note that `ziw-setup` should run. In one parallel
batch, gather `git status --short`, `git diff HEAD`, the current branch,
`git log --oneline -10`, and the branch's existing PR.

Use an issue only when the invocation, caller, branch name, or commits name its
ID. Fetch it once for its title and URL unless the caller already gave both.

## Branch

- Never push to the default branch. On the default branch or detached HEAD,
  create a branch with the configured prefix, such as
  `<branch-prefix>/<issue-id>-<short-slug>`. Keep any other existing branch
  name.
- Update the branch's existing PR instead of opening a duplicate.
- Include all repo changes except secrets, credential files, and unintended
  lockfiles.

## Checks

Run none. A caller's reported results, the hooks that run on commit and push,
and CI are the evidence; trust a caller's report as given. Two exceptions:

- When package manifests changed without the lockfile, run the configured
  install so the lockfile ships with them.
- When the repo has neither a hook nor CI that runs the full gate, run the
  configured full local gate once.

If a hook fails, fix it and commit again, rerunning only that hook. Stop and
report when the fix needs a product, design, or scope decision. Never use
`--no-verify`, `--force`, `--no-cache`, or other cache-busting flags. A cache
hit is valid evidence, whatever config says about cache policy.

## Review

Author QA is the implementer's judgment-based call, made before this skill
runs. Run `ziw-code-review` here only when the user asks for it in this
request; a new commit alone never calls for it. Do not request hosted bot
review; Agent Orchestrator or the user owns that escalation.

## Commit And Push

- Stage with `git add -A`, then unstage `.env*`, credential files, local
  secrets, and unintended lockfiles.
- Use Conventional Commits. Add the configured issue trailer when an issue
  exists, defaulting to `Issue: <ISSUE-ID>`.
- Do not amend published commits or force-push unless the user asks.

## PR

Create or update the PR as non-draft, and mark an existing draft ready now,
unless the user or config requires a draft; report a required draft as
pre-review. Do not wait for CI or hosted review; report CI as pending when it
has not finished.

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

- [x] [command and result, including hook runs and reused caller checks]

[Issue: ISSUE-ID](url)
```

Risk is a label for the reader and triggers nothing here. HIGH covers auth,
secrets, destructive data, schema migrations, queues or background jobs,
production data flow, public contracts, and broad refactors; MEDIUM is normal
feature logic; LOW is docs, tests, copy, or isolated UI.

## Issue Tracker

When an issue exists, put its exact URL in the PR body. If the tracker and code
host are integrated, that link is the association and the integration moves
issue state; otherwise attach the PR URL to the issue. A title or branch token
alone is only a delivery hint. Make a state transition only when config or the
user delegates it to Create PR, and never move the issue to `Done`.

Create PR does not own approval state. Author QA is not independent review
evidence. Do not apply or clear review-evidence labels, move the issue to
`Ready to Merge`, or apply merge-ready PR labels.

## Done

The PR exists on the code host. Fill the report from the PR you just created
or updated, without polling; Agent Implement copies these fields into its
[handoff](../ziw-setup/references/handoff.md).

```text
PR:     <url and number> (<ready-for-review|draft>)
Head:   <sha>
Checks: <reused caller checks and hook runs, with results>; CI <pending|state>
Review: author QA <caller's decision, or user-requested verdict>
Issue:  <issueKey and URL, linked | untracked>
Next:   <owner and exact next action>
```

Never commit secrets, bypass hooks, or deploy production.
