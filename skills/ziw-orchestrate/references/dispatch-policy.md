# Dispatch Policy

The planner selects starts within scope, capacity, footprints, and budget. You
check each start, supply missing footprints, claim, and keep the ledger true.
Done means every selected ticket has a confirmed claim and every hold has a reason.

## Steps

1. [Stay in scope](#scope-boundaries).
2. [Check each planned start](#dispatch-preconditions).
3. [Supply missing footprints](#footprints).
4. Claim and dispatch through [Dispatch workers](../SKILL.md#dispatch-workers),
   then [record the worker](#worker-slots).
5. [Advance draft PRs](#draft-prs); apply the [closure guard](#pr-closure-guard) before closing any PR.

## Scope Boundaries

- Follow [Resolve scope](../SKILL.md#resolve-scope); do not widen the named or configured current-work queue.
- Done tickets remain terminal despite stale readiness labels.
- Repair clear status, label, route, environment, review-evidence, or handoff drift from refreshed facts.
- Escalate missing intent, authority, credentials, provider/customer input,
  production approval, security posture, or ADR judgment.

## Dispatch Preconditions

- Require `kind-slice`, configured ready state, and readiness label, default `ready-for-agent`.
- Verify the [agent-ready body and readiness checks](../../ziw-setup/references/issue-tracker-contract.md#agent-ready-issue-body).
- Require clear dependencies and no incomplete blockers.
- Require repo route/environment metadata present or safely repairable.
- Exclude claimed, delegated, PR-linked, or active-session work.
- Return sibling-delivering tickets, missing non-goals, or unresolved human decisions to triage or `ready-for-human`.
- Refuse `kind-spec` and `kind-epic`; repair unambiguous To Issues misses and log `config-gap`.
- Body/comment evidence overrides labels; unresolved human, setup, credential,
  provider, or security decisions prevent dispatch. Heal labels or route to triage.

## Footprints

- When a candidate lacks a footprint, derive it this tick from likely files,
  packages, or artifacts in its body. Route to triage or To Issues only when
  the body lacks that information.
- Include shared packages, schemas, migrations, generated artifacts, routes,
  config, refactor/test seams, and dense document hotspots.
- Collisions need concrete overlap. Labels such as `e2e`, `schema`, or
  `security` cannot lock a whole category.
- Report a collision hold, `FILE_COLLISION` in planner output, as held, not
  skipped. Its friction category is `file-collision`.

## Worker Slots

The cap is `Worker concurrency cap`, default 3 implementation or repair sessions.
Follow the planner's capacity and holds.

- Record every dispatch in the ledger as a [state record](planner-input.md#state-records).
- One confirmed live worker is one slot until the provider confirms return,
  stop, or failure. Opening a PR does not free it.
- Count each worker once by confirmed session, or by receipt when no session
  is known, from the ledger or a repo-scoped tracker claim. Two workers sharing
  an issue or branch are two slots.
- A terminal receipt frees a tracker-claim slot only when it names the same
  session. Current live observations outrank older terminal receipts, since
  receipts may be reused.
- PRs, previews, worktrees, and human assignees are not workers. They still
  reserve files and delivery.
- A live worker, open PR, or claim on an issue prevents another dispatch for it.
- A failed worktree or tracker inventory is a snapshot failure, not zero workers.
- Drop stale ledger entries. Re-dispatch or escalate stuck workers after checking for duplicates.
- Backfill returned, failed, or stopped slots in the same tick. Merges may
  serialize; PR work must not hold up unrelated dispatch.
- An idle slot with safe ready work is an orchestration failure. Valid holds:
  collisions, missing footprints, authority, provider capacity, and configured budgets.

### Without the planner

Select the same way by hand:

- Order startable tickets by how many blocked tickets they unlock, then priority.
- Fill headroom with tickets whose footprints do not overlap active work, open
  PRs including drafts, or earlier selections. The first start may lack a
  footprint when nothing active can collide.
- Local budget: below the soft stop, start local work up to the per-tick limit;
  at the soft stop, pause new local starts; at the hard stop, stop them.
  Remote workers keep running. Without budget state, infer neither usage nor exhaustion.
- With budget limits configured, hold tickets whose worker kind is unknown.
- Remote ineligibility is not global blockage; check the configured local path.
- Record a hold reason for every unselected start.

## Draft PRs

Draft PRs reserve files and delivery, not worker slots by themselves. Advance
them through [Review lifecycle](integrate-checklist.md#review-lifecycle).
If mark-ready authority is missing, report the exact code-host action needed.

## PR Closure Guard

Refresh code-host and tracker state before closing any PR. Verify one reason:

- Duplicate for the same issue, after current evidence selects a canonical PR.
- Explicitly canceled, abandoned, or out-of-scope work, with owner/config authority to close.
- Already merged, superseded, or terminal according to both systems.
- Security or policy requires closure, with the reason recorded.

Age, draft status, and capacity pressure do not prove abandonment. Keep
legitimate active PRs open and route review, feedback, checks, or merge.
