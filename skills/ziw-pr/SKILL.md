---
name: ziw-pr
description: Use to open or update a pull request for the current branch. Commits with Conventional Commits, pushes, opens a draft PR, and links the issue. Hooks and CI are the check gate.
argument-hint: "[issue-id|branch|pr-url]"
---

# Create PR

Commit, push, and open or update the branch's PR as a draft linked to its
ticket. Rules follow the [workflow contract](../ziw-setup/references/workflow.md).

## Inputs

The current branch and changes, and the ticket. Implement also passes the
checks it ran.

## Steps

1. Read `git status` and the diff. If you're on the default branch, create a
   branch named `<prefix>/<ticket>-<slug>`.
2. Stop if the diff contains a secret or work outside the ticket.
3. Stage everything except secrets, `.env` files, and unintended lockfile
   changes. If you changed a dependency manifest, run the install so the
   lockfile matches.
4. Commit with a Conventional Commits message and the configured issue trailer,
   then push.
5. If a hook fails or the push is rejected, fix the cause and try again. Stop
   after three rounds, or sooner if the same failure survives two fixes.
6. Open a draft PR, or update the existing one, with this body, and put the
   ticket's URL in it:

   ```markdown
   ## Summary

   ## Changes

   ## Risk: LOW | MEDIUM | HIGH

   ## Test plan

   [Issue: ABC-123](url)
   ```

Don't wait for CI or reviews.

## Rules

- Never push to the default branch, use `--no-verify`, or force-push unless
  the user asks.
- Don't mark the PR ready, add labels, or request bot reviews.

## Done

Report the PR URL and number, the head SHA, the checks reported to you and the
hook results, the ticket link, and the next owner.
