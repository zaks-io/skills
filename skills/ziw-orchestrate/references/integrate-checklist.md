# Integrate Checklist

How to carry out each PR action that `tick-plan` emits. The planner decides
which action is next from the snapshot. This file says how to perform it
safely. Follow the planner unless current evidence exposes a gap it cannot
model.

## Ground rules

- Reuse the tick snapshot. Refresh only the affected PR or issue before a
  mutation, or when a change signal arrives. Do not rebuild inventories per action.
- Read head, base, merge base, draft state, checks, reviews, and threads from
  the code host yourself. Never send a worker back to collect them.
- From a worker, require only what the code host cannot know: issue and PR
  identity, scope audit, local checks run, and the author-QA decision.
- When the tracker and code host sync linked PRs and issues, trust the synced
  state once both linked records exist. Repair by hand only after refreshing both.

## Review lifecycle

1. The worker opens a draft PR. CI runs; hosted reviewers skip drafts.
2. After required checks pass, one local independent review covers the diff.
3. Fixes go to the original worker on the same branch, and the PR stays draft.
4. A clean review of the current diff marks the PR ready for review.
5. Hosted review runs only when required, after the PR is ready.
6. The PR merges, or receives the human-merge label.

Run local review first so fixes land before any hosted reviewer sees the PR.
A non-draft PR that lacks review, such as one opened by a human or under an
older config, follows the same path without the draft step.

## Review evidence

Evidence belongs to the PR's own changes, not to a commit. The snapshot's
`reviewDiffFingerprint` identifies those changes.

- Same fingerprint, new head: keep the evidence. Base updates, rebases, empty
  commits, and squashes rerun checks, never review.
- New fingerprint: the evidence expires. The next review covers only the delta.
- A missing fingerprint fails closed: evidence counts only for its exact head.
- Evidence counts from three sources:
  - a local `ziw-code-review` run in a fresh isolated thread
  - a human GitHub approval covering the current diff
  - the configured hosted reviewer's bot account, which also satisfies
    required hosted review
- No other bot approval counts.
- Never review an empty diff. Never repeat a pending or equivalent-diff review.
- Never send conformance, CI, provider, or authority failures to a reviewer.

## Actions

### request-review

- Confirm the target is stable first:
  - the PR head matches the code host
  - the worker has stopped pushing
  - required checks are attached to the current head
- Otherwise defer to the next tick.
- If a review pass was wasted on an unstable target, log `stuck-worker` for
  worker churn or `config-gap` for missing check-state expectations.
- Start one `ziw-code-review` in a fresh session or subagent without the
  implementation conversation. A worktree isolates files, not context.
- Use a different model or provider from the author when one is available.
  Record the reviewer and model. A fresh same-model thread is the minimum.
- Pass the PR, base, intent source, required checks, and the planner's
  `reviewDiffFingerprint`.
- When the action carries `deltaFrom`, ask for a review of how the PR's own
  patch changed since that head, plus any interactions it affects. Compare the
  two merge-base diffs, for example with `git range-diff`. Never use
  `git diff <deltaFrom> HEAD`; after a base merge it includes the base's changes.
- Give parallel reviewers separate sessions and checkouts, never one shared
  mutable checkout.

### Reading a review

- Read the verdict and the hosted-review recommendation from the review artifact.
- When the artifact recommends `PR REVIEW`, record hosted review as required
  for this PR in planner state (`hostedReviewByPr`).
- When current artifacts disagree on blocking findings, treat the PR as blocked
  until a focused re-review settles those findings or the risky diff is fixed.
- Clean verdict:
  - refresh the PR and confirm its fingerprint still matches the reviewed one
  - apply the configured review evidence label to the issue
  - record the PR URL, reviewed head, fingerprint, verdict, artifact, and
    reviewer and model in a tracker comment or the configured evidence field
- Blocking verdict:
  - clear the evidence label and the human-merge PR label
  - post actionable findings as PR review comments when configured
  - move the issue to `Changes Requested`
  - take the `route-fix` path

### route-fix and route-review-fix

- First check whether a `CHANGES_REQUESTED` verdict predates the current head
  and its findings are resolved on that head. If so, dismiss or re-request it
  through the configured mechanism instead of sending the worker back.
- Otherwise reply directly to the original worker's continuation target. For a remote
  Cursor agent, use a top-level issue comment only when config verifies that route.
- Keep fixes on the same branch and PR. The planner then requests a delta review.
- Log `review-thrash` when a ticket returns to review more often than configured.
- Act on hosted findings only when they are high priority: P0/P1, security,
  data loss, correctness regressions, production blockers, or user-requested.

### route-check-fix and verify-checks

- Rerun a flaky check once, or route the failure to the worker.
- Live code-host checks are the minimum evidence, even when config says CI is
  unavailable or unknown. Log `config-gap` and route a setup refresh to record
  the real gate. Never merge on stale "no CI" config.

### update-branch and route-conflict-fix

- On GitHub, run `gh pr update-branch <pr>` yourself, then rerun checks.
- Reuse review evidence while the fingerprint holds.
- Delegate only when the update reports a merge conflict. Log `merge-conflict`
  and send it to the worker.

### mark-ready

- Refresh the PR and its head first, then mark it ready for review.
- Verify from refreshed state that it is non-draft.
- Exception: keep it draft when the user or repo config asks, and report it as
  pre-review.
- Draft state belongs to the code host and is separate from tracker status.
- A draft held for human prep or missing metadata goes to the worker's
  continuation target, or to human attention.

### Hosted review

- Hosted review is required when any of these is true:
  - the risk tier is in the configured hosted-review tiers
  - the user or config explicitly asks for it
  - the local reviewer flags concrete uncertainty
- Otherwise skip it. Optional hosted review never parks a merge-ready PR.
- Before posting any command, resolve the provider, its auto-review mode, its
  trigger policy, and the PR's current hosted state. When policy is unknown,
  stop and resolve it first.
- `request-hosted-review`: trigger once per fingerprint through the configured
  mechanism. Wait only when a required review is already pending for the current diff.
- CodeRabbit:
  - use top-level comments `@coderabbitai review` (incremental) or
    `@coderabbitai full review`
  - use `@coderabbitai ignore` in the PR description to skip optional automatic review
  - never run the CodeRabbit CLI for an existing PR
- Cursor Bugbot: use only the repo-configured trigger or automatic policy.
  Never guess a command.
- Missing auth, rate limits, or credits are a recorded skip, unless hosted review
  is required. When required review is unavailable, route the PR to human merge
  or use the configured substitute.
- After hosted-driven fixes, the hosted reviewer's incremental pass covers the delta.

### Labels

Apply label actions exactly as the planner emits them.

- The review evidence label means the current fingerprint passed review. Clear
  it when the fingerprint changes or the label lacks a recorded fingerprint.
- The human-merge PR label, such as `needs-human-merge`, means merge-ready
  except for human merge authority:
  - the PR is open and non-draft
  - review evidence is clean for the current diff
  - required checks pass
  - required hosted review is complete or skipped by policy
  - the diff matches issue scope
  - no blocking review thread is unresolved
- Clear the human-merge label as soon as any of those facts stops holding.
- Never apply readiness or human-attention labels while agent-fixable findings remain.

### route-human-merge and arm-auto-merge

- Run the readiness preflight below first. Then move the issue to `Ready to Merge`.
- `route-human-merge`: apply the human-merge label. Report the merge decision
  to the user in the configured shape.
- `arm-auto-merge`: merge as described below.

### reconcile-empty-pr

Never send an empty diff to review. Find out why it is empty: already
merged, superseded, or nothing pushed. Close it only under the
[PR closure guard](dispatch-policy.md#pr-closure-guard). Otherwise route it to
the worker.

## Readiness preflight

Run it before moving an issue to `Ready to Merge`, applying the human-merge
label, or merging.

- Enumerate every unresolved review thread with severity, using the code host's
  thread-level view. A partial comment count can green-light a real bug.
- Refresh local Git refs and code-host state. Verify the PR head, fingerprint,
  default-branch HEAD, merge base, required checks, review verdict, and draft
  state. When a value is stale or missing, update and rerun the affected gate.
- When the default branch moved, run `update-branch` above. Never send routine
  branch updates to the implementation worker.

## Merge

1. Merge with the configured method: squash, merge commit, or rebase.
   - If the host rejects the method, stop, log `config-gap`, and refresh setup.
     Never retry with a guessed method.
   - If branch policy blocks a direct merge despite green checks, use host
     auto-merge when config allows it, and record the policy for setup.
2. Confirm the merge from refreshed code-host state. Some CLIs print nothing on success.
3. Refresh local refs and fast-forward the local default branch. Do this before
   any post-merge check, next PR decision, or `Done` transition.
4. Run configured post-merge preparation first:
   - install dependencies when the lockfile or workspace graph changed
   - regenerate artifacts that config marks as possibly stale
   - use the configured runner; never infer one from file names
5. Run the configured post-merge check. When the repo deploys on push, include
   the production deploy status on default-branch HEAD.
   - If preparation clears a stale local failure, log `config-gap`.
   - If the default branch still fails, record `post-merge-break` and escalate.
6. Move the issue to `Done` only when all of these hold:
   - the merge and the post-merge check succeeded
   - the full scope is complete
   - the PR delivered no sibling or out-of-scope work

   With Linear and GitHub, the linked PR may auto-advance the issue; repair
   only what refreshed state still needs. If an integration marked the issue
   `Done` early, reopen or narrow it per config, record the residual scope, and
   log `config-gap`. In the same update for a true `Done`, remove
   `ready-for-agent` or the configured readiness label.
