# Dispatch Policy

Select the largest safe worker set within scope, capacity, and budget. Done
means every selected ticket has a confirmed claim and every hold has a reason.

## Steps

1. [Confirm scope](#scope-boundaries).
2. [Reconcile worker concurrency](#worker-concurrency).
3. [Compare file footprints](#file-footprint-dispatch).
4. [Choose worker routes and budget](#worker-routing-and-budget).
5. [Verify dispatch preconditions](#dispatch-preconditions).
6. [Advance draft PRs](#draft-prs); apply the [closure guard](#pr-closure-guard) before closing any PR.

## Scope Boundaries

- Follow [Resolve scope](../SKILL.md#resolve-scope); do not widen the named or configured current-work queue.
- Done tickets remain terminal despite stale readiness labels.
- Use typed candidates, dependencies, and `state.scopeIssues` from [planner-input.md](planner-input.md#role-specific-identity).
- Repair clear status, label, route, environment, review-evidence, or handoff drift from refreshed facts.
- Escalate missing intent, authority, credentials, provider/customer input,
  production approval, security posture, or ADR judgment.

## Worker Concurrency

Use `Worker concurrency cap`; default to 3 active implementation or repair sessions.

- Count confirmed implementation and repair sessions, including repo-scoped tracker claims, until provider-confirmed return, stop, or failure.
- Count distinct confirmed sessions even for one issue, branch, path, or PR.
- Deduplicate by confirmed session, or receipt identity without a session.
- Issue, branch, worktree, PR, and shared commit matches cannot deduplicate workers.
- Human assignees, PRs, previews, and abandoned worktrees are not workers.
- Started tracker work reserves delivery and files without inventing a session.
- Either live worker, PR, or claim covering an issue prevents another dispatch.
- Record provider lifecycle; opening/linking a PR, including `prNumber` or v3 `hasPr: true`, does not free a running worker's slot.
- A terminal receipt for the same explicit session retires a tracker-only slot,
  preserving delivery and footprint reservations.
- Current live observations beat historical terminal receipts without freshness evidence.
- Receipt-only terminal history cannot retire tracker claims; receipts may be reused.
- Use [typed identity and diagnostic rules](planner-input.md#role-specific-identity); retain unresolved references as holds.
- Branch/path and leading-title hints reserve possible delivery with at least
  medium risk; they cannot authorize scoped PR actions.
- Worktree paths preserve unassociated file reservations without inventing issue claims.
- Reconcile missing ledger entries from repo-scoped active claims and dirty,
  baseline-unmerged, or uncertain non-default worktrees.
- A failed worktree inventory is a snapshot failure, not zero workers.
- Drop stale ledger entries; re-dispatch or escalate stuck workers after duplicate checks.
- Backfill returned, failed, or stopped slots in the same tick while advancing PR actions.
- Merge may serialize; PR inventory must not suppress unrelated dispatch.
- Record an orchestration failure for idle slots with safe ready work.
- Valid holds include collisions, missing footprints, authority, provider capacity, and configured budgets.

## File Footprint Dispatch

- Compare predicted To Issues footprints against open PRs including drafts,
  active branches, unreturned dispatches, and selected candidates.
- Include shared packages, schemas, migrations, generated artifacts, routes,
  config, refactor/test seams, and dense document hotspots.
- Dispatch the largest non-colliding set within headroom.
- Hold collisions as `file-collision`, with "held, not skipped" evidence.
- Derive missing footprints from likely files, packages, or artifacts in the body this tick.
- Route to triage or To Issues only when the body lacks that information.
- Exception: the first selected issue may start without a footprint when no active work can collide.
- Prefer work unlocking blocked dependents, then backlog priority.
- Compare concrete overlaps. Labels such as `e2e`, `schema`, or `security` cannot lock a whole category without overlap evidence.

## Worker Routing And Budget

Keep startability, worker eligibility, and capacity/collision selection visible separately.

- Select by leverage and priority, not provider preference.
- Remote ineligibility is not global blockage; check the configured local path.
- Below the local soft stop, start the highest-leverage local-only work within
  the per-tick limit. Prefer dependency-chain unlocks.
- At the soft stop, pause new local-heavy starts; keep remote workers running.
- At the hard stop, stop new local starts; keep authorized remote work running.
- Record an authority or hold reason for every unselected start.
- Without budget state, infer neither usage nor exhaustion.
- Resolve the default path's local/remote kind before applying limits.
- With limits configured, hold unknown worker kinds, including missing ticket routing.
- Exception: an unknown default path remains usable without configured limits.
- Use [planner policy fields](planner-input.md#policy-and-evidence) for JSON names and routing aliases.

## Dispatch Preconditions

- Require `kind-slice`, configured ready state, and readiness label, default `ready-for-agent`.
- Verify the [agent-ready body and readiness checks](../../ziw-setup/references/issue-tracker-contract.md#agent-ready-issue-body).
- Require clear dependencies and no incomplete blockers.
- Require repo route/environment metadata present or safely repairable.
- Exclude claimed, delegated, PR-linked, or active-session work.
- Require a non-colliding footprint, subject to the [first-issue exception](#file-footprint-dispatch).
- Return sibling-delivering tickets, missing non-goals, or unresolved human decisions to triage or `ready-for-human`.
- Refuse `kind-spec` and `kind-epic`; repair unambiguous To Issues misses and log `config-gap`.
- Body/comment evidence overrides labels; unresolved human, setup, credential,
  provider, or security decisions prevent dispatch. Heal labels or route to triage.
- Apply claims and verify in-progress state through [Dispatch workers](../SKILL.md#dispatch-workers).

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
