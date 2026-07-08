# Integrate Checklist

The full per-PR procedure behind `ziw-orchestrate`'s PR Review And Integrate
step. Walk it for each returned PR. The SKILL carries the invariants; this
file carries the order of operations.

## Review And Readiness

1. Refresh PR draft status, branch head, required checks, review comments, and
   linked issue state from the code host and tracker. If the tracker/code-host
   integration syncs linked PRs and tickets, assume the synced state is real
   when both linked entities exist; manually repair only after both systems
   have been refreshed. Require evidence-complete handoff before treating a
   returned PR as ready for review or merge: current PR head SHA, base SHA,
   merge base, exact checks, hosted check state, review verdict, hosted bot
   review decision, and non-draft state unless a blocker says why the PR must
   remain draft.
2. If the PR is draft, diagnose draft state before asking for review: inspect
   repo draft policy, PR body, check state, unresolved review comments, linked
   issue state, handoff notes, configured review evidence label state, and the
   original worker session. A draft-only stall is an orchestration repair, not
   a code review request.
3. For a draft PR, identify the exact blocker. If checks are still running or
   failing, rerun or route the check failure. If author fixes, missing
   metadata, or human prep are required, reply to the original worker's
   continuation target or mark the ticket for human attention. If no explicit
   draft blocker remains, mark the PR ready-for-review and verify it is
   non-draft.
4. Confirm code review happened when feasible and covers the current PR head
   before applying the configured review evidence label, moving to
   `Ready to Merge`, or calling integrate. Request Agent Review only when
   review evidence is the actual blocker, not merely because the PR is draft.
5. When the next action requires review evidence, first verify the review
   target is stable enough to spend a review pass: the PR head matches the
   code host, the original worker is not still pushing to that head, and
   required checks are complete or at least attached to the current head. If
   the head moved, checks are empty or pending after a push, or the worker
   session is still actively iterating, defer review until the next tick
   instead of producing unusable review evidence. If a review pass was already
   wasted, log the cost with an existing friction category, usually
   `stuck-worker` for live worker churn or `config-gap` for missing
   check-state expectations.
6. When the review target is stable, run independent `ziw-code-review` in a
   subagent or disposable worktree. Parallel reviews must use isolated
   worktrees or sessions, never one shared mutable checkout.
7. Read the review verdict and hosted bot review recommendation from the review
   artifact. If multiple current review artifacts disagree on blocking
   findings, reconcile conservatively: treat the PR as blocked until a focused
   re-review resolves the exact findings or the risky diff is fixed.
8. If the PR head changed since the configured review evidence label was
   applied, or the label lacks reviewed head SHA evidence, remove the label
   before continuing. Also remove the configured code-host human-merge PR
   label if it is present.
9. If the latest review has blocking findings, remove the configured review
   evidence label and post actionable findings as PR review comments when
   configured.
10. Move the issue to `Changes Requested` when author fixes are needed.
11. Send feedback as a direct reply to the original worker's continuation
    target when available. Do not use a top-level issue comment for a remote
    Cursor agent unless config verifies that route. Record a `review-thrash`
    friction entry when a ticket returns to review more than the configured
    number of times.
12. Keep fixes on the same branch and PR. After fixes, rerun review and
    required checks.
13. When review is clean for the current PR head, apply the configured review
    evidence label to the issue and record the PR URL, reviewed head SHA,
    review artifact, and reviewer path in a tracker comment or configured
    evidence field.
14. Before changing draft state, refresh code-host PR state and the current PR
    head. Before applying the configured review evidence label, moving tracker
    state to `Ready to Merge`, or calling integrate, refresh local Git refs
    and code-host PR state. Verify the local branch or worktree HEAD, PR head
    SHA, and default branch HEAD still match the review and check evidence. If
    they do not match, rerun review and checks for the current head instead of
    approving or merging from stale local state. If the base branch moved
    since the review or `Ready to Merge` evidence was recorded, treat merge
    readiness as expired. For GitHub PRs, refresh PR state, run
    `gh pr update-branch <pr>`, then rerun checks and review on the updated
    head. Do not delegate this routine update; delegate only when the command or
    code host reports a merge conflict or equivalent manual conflict state.
15. If review is clean, required checks pass or are not required, and the PR
    is still draft, move the PR to ready-for-review unless the user or repo
    config explicitly says to keep it draft. Then refresh the code-host PR
    state and verify it is non-draft. This is a code-host PR state change,
    separate from tracker status. A kept-draft PR is pre-review; do not call
    it ready-for-review.
16. Resolve hosted bot review escalation per the operating profile's
    merge-safety rules and the review artifact's recommendation. Supported
    configured providers include CodeRabbit and Cursor Bugbot. Resolve provider,
    auto-review mode, trigger policy, and current PR-hosted review state before
    posting any command. If provider policy is unknown, stop and resolve it
    first. If a hosted review is enabled, pending, or already current for the
    PR head, record that state and wait. For CodeRabbit, top-level PR comments
    such as `@coderabbitai review` and `@coderabbitai full review`, plus
    `@coderabbitai ignore` in the PR description, are provider-specific tools;
    never run the CodeRabbit CLI for an existing PR. For Cursor Bugbot, use only
    the repo-configured trigger or automatic review policy; do not guess a
    command. Treat missing auth, rate limits, or credits as a recorded skip
    unless that provider is explicitly required.
17. Act only on high-priority hosted bot review findings: P0/P1, security, data
    loss, correctness regression, production blocker, or a user-requested
    finding.
18. Move to `Ready to Merge` only when review is clean, required checks pass,
    the PR is non-draft and ready-for-review, the configured review evidence
    label is current for the PR head, the diff matches the linked issue's
    in-scope and out-of-scope boundary, and required hosted bot review escalation is
    complete or recorded as skipped by policy. If configured merge authority is
    human, apply the configured code-host human-merge PR label such as
    `needs-human-merge` only after this full condition is true. Clear that label
    when a new commit, draft transition, failed or pending required check,
    blocking review finding, unresolved review thread, required hosted review,
    or stale/missing review evidence makes the PR no longer merge-ready.
19. Call integrate when the auto-merge gate is satisfied.

## Merge Preflight

Merge preflight must enumerate every unresolved review thread on the PR with
severity, using the code host's thread-level view, before deciding merge
readiness; a partial comment count can green-light a real bug. If a code-host
review verdict such as `CHANGES_REQUESTED` predates the current head and its
findings are resolved on the current head, dismiss or re-request that review
through the configured mechanism instead of leaving stale verdict metadata to
block the merge.

If config says hosted checks are unavailable or unknown but the code host
exposes required, recently attached, or clearly relevant checks on the PR,
treat that as a setup drift signal. Log `config-gap`, use the live code-host
checks as the minimum safety evidence for this PR, and route setup refresh to
record the real gate. Do not merge by relying on stale "no CI" config.

## Merge

When the integrate gate passes:

1. Refresh local Git refs and code-host PR state immediately before merging.
   Verify the local observation of the PR head, default branch HEAD, merge
   base, required checks, review verdict, and draft state matches the code
   host. If any value is stale or missing, update the local checkout and rerun
   the affected gate instead of merging.
2. If the default branch moved since the PR branch last updated, refresh PR
   state, run `gh pr update-branch <pr>` for GitHub PRs, then rerun required
   checks and `ziw-code-review`. Do not merge a stale branch on the assumption
   it still applies, and do not preserve `Ready to Merge` state without fresh
   evidence. Do not send routine branch updates to the implementation worker.
   Record a `merge-conflict` friction entry and delegate or escalate only when
   the update command or code host reports a merge conflict or equivalent manual
   conflict state.
3. Merge through the configured mechanism, such as squash, merge commit, or
   rebase merge. If the code host rejects the configured method, stop, log
   `config-gap`, and refresh setup instead of retrying with a guessed method.
   If branch policy rejects a direct merge despite green checks, use the
   host's auto-merge when config allows it and record the policy for the next
   setup refresh. Confirm the merge completed from refreshed code-host state,
   not from the merge command's output; some CLIs print nothing on success.
4. Refresh local Git refs and update the local default branch to the merged
   head before any post-merge check, next PR decision, or issue `Done`
   transition.
5. Run configured post-merge preparation before judging the default branch:
   update dependencies when the lockfile or workspace graph changed, rebuild
   or regenerate artifacts when config says they can be stale, and use the
   configured runner for tests or checks. Do not infer the runner from file
   names. Then run the configured post-merge check when config names one,
   including the production deploy status on the default-branch HEAD when the
   repo deploys on push. Mergeable does not prove correct after merge. If a
   prep step clears a stale local artifact failure, log `config-gap`; if the
   checked default branch still fails, record `post-merge-break` and escalate.
6. Move the issue to `Done` only after the merge and post-merge check succeed,
   the full issue scope is complete, and the merged PR did not deliver sibling
   ticket work or behavior named out of scope. For Linear + GitHub, assume the
   linked PR can auto-advance the ticket state; do not duplicate that
   transition unless refreshed state still needs repair. If a code-host
   integration auto-moved the issue to `Done` after the first linked PR but
   acceptance criteria remain, reopen or narrow the issue according to config,
   record the residual scope, and log `config-gap`. In the same tracker update
   for true Done, remove `ready-for-agent` or the repo-configured readiness
   label from the done ticket. Done work is no longer waiting for agent
   handoff.
