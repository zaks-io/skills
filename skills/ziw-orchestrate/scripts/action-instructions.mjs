export const actionInstructions = {
  "prepare-ticket":
    "Run Triage on this ticket. Use the reported gaps. Record its outcome, reason, and confirmed updatedAt after preparation. Recollect tracker facts before dispatch.",
  dispatch:
    "Move the ticket to targetState before launching the worker. Record the launch receipt immediately. Recover existing work before retrying a launch.",
  "request-review":
    "Move the ticket to targetState. For a follow-up, recover and paste the previous report findings into the brief. Launch a fresh independent review and record its receipt. Record the matching report when it returns.",
  "route-fix":
    "Move the ticket to targetState. Send the current findings to its implementation worker and record the new run receipt.",
  "route-review-fix":
    "Move the ticket to targetState. Send the current review findings to its implementation worker and record the new run receipt.",
  "route-check-fix":
    "Send the failing checks to its implementation worker and record the new run receipt.",
  "route-conflict-fix":
    "Send the conflict to its implementation worker and record the new run receipt.",
  "promote-ready": "Move the ticket to targetState.",
  "update-branch": "Update this PR branch with gh pr update-branch, then recollect its facts.",
  "verify-checks":
    "Rerun CI once on this head. If checks still do not appear, report the missing evidence.",
  "mark-ready": "Mark this draft PR ready for review.",
  "request-hosted-review":
    "Trigger the configured hosted reviewer once for this diff, then record requested. Report unavailable reviewers.",
  "resolve-hosted-review-mode":
    "Check whether the configured hosted reviewer runs automatically. Record autoReviewMode as enabled or disabled.",
  "apply-human-merge-pr-label": "Apply the action's label to this PR.",
  "clear-human-merge-pr-label": "Remove the action's label from this PR.",
  "apply-review-evidence":
    "Record the confirmed current review evidence through the configured tracker mapping.",
  "clear-review-evidence":
    "Clear the stale review evidence through the configured tracker mapping.",
  "route-human-merge":
    "Re-read the PR. If it changed, replan. Otherwise move the ticket to targetState and report it ready for human merge.",
  "arm-auto-merge":
    "Re-read the PR. If it changed, replan. Otherwise merge using configured authority and method, or arm auto-merge when required. Recollect after merge for reconciliation.",
  "reconcile-merged-pr":
    "Confirm this merge and ticket association. If verifyPostMerge is true, check the configured default branch including mergeCommitSha in your worktree and run the post-merge check. On success move the ticket to targetState, remove removeLabels, and record its confirmed updatedAt as trackerUpdatedAt. Use the supplied merge-result command to record the observed check result. On failure omit --tracker-updated-at and leave the ticket unchanged; a human owns recovery.",
  "reconcile-empty-pr":
    "Determine why the PR has no diff. Close it only if its work already merged; otherwise ask its worker.",
  "record-closed-pr":
    "Record the confirmed closed PR and terminal ticket revisions using record.stdin. This settles local history without changing the tracker or claiming a merge.",
  "record-pr-state":
    "Record this observed reopened PR using record.stdin. This clears its old closed settlement so future ticks collect its terminal result.",
};
