# Skill Portfolio

This repo should publish the smallest set of Workflow Skills that still gives
agents clear roles, clean review context, and testable handoffs. Skill count is
not a quality signal. Keep, merge, or demote skills based on measured workflow
value.

## Trim Criteria

Keep a publishable skill only when it satisfies all of these:

- It has one job with a clear caller.
- Its interface hides enough workflow complexity to earn the token cost.
- Removing it would scatter behavior across other skills or agents.
- Its behavior can be checked by docs, tests, or workflow evidence.
- It is portable across downstream repos instead of provider-specific glue.

Demote or delete a skill when it is mostly a pass-through, provider-specific,
stale, not invoked in real runs, or duplicating another role's authority.

## Current Decision

Keep the seven current publishable skills for now. Do not add another
publishable skill until telemetry proves the current surface is insufficient.

| Skill             | Decision              | Why                                                                                                                                                                     |
| ----------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ziw-setup`       | Keep                  | Owns Repo Config creation and refresh. Other roles should not rediscover commands, tracker IDs, environment rules, or agent access.                                     |
| `ziw-to-issues`   | Keep                  | Owns spec or epic conversion into dependency-ordered Slice Tickets. This is separate from tracker cleanup and implementation.                                           |
| `ziw-triage`      | Keep, watch size      | Owns Issue Tracker cleanup for current work, stale state, readiness, dependency, and review-debt intake. Merging it into Orchestrator would make the work loop heavier. |
| `ziw-orchestrate` | Keep, script hot path | Owns the single active work loop. Keep the hot skill short; detailed gates live in lazy references, `workflow-contract`, and tick snapshot/planner scripts.             |
| `ziw-implement`   | Keep                  | Owns one Slice Ticket through code, checks, Code Review, Create PR, and handoff.                                                                                        |
| `ziw-code-review` | Keep                  | Shared bug-focused review gate with an independent/checkpoint mode for latest-committed PR review, main-drift review, and review-debt issue filing from Clean Context.  |
| `ziw-pr`          | Keep, measure overlap | Shared shipping gate for branch-to-PR work. Merge into Implement later only if standalone PR use is rare and Orchestrator does not need a separate gate.                |

## Removed Or Demoted

| Skill or workflow   | Decision                       | Why                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ziw-remote-ticket` | Demoted from publishable skill | Remote Cursor ticket handling is provider-specific delegation glue. It now lives in `.agents/remote-cursor-ticket.md` instead of public skill discovery.                                                                                       |
| `ziw-review`        | Merged into `ziw-code-review`  | It was a thin scheduler around the same review: fetch state, checkpoint, delegate to `ziw-code-review`, file issues. Two review skills confused callers; the checkpoint and issue-filing rules now live in `ziw-code-review` independent mode. |
| Coverage audit loop | Not present                    | Public research favors one active loop. Add a separate loop only if measured evidence shows the Orchestrator plus Agent Review cannot cover the need.                                                                                          |

## Measurement Before Trimming

Collect these before deleting or merging a current skill:

- invocation count by skill and caller
- average token or runtime cost when available
- blocked or failed runs by skill
- review rework caught by `ziw-code-review`
- PRs created directly through `ziw-pr` versus through `ziw-implement`
- stale tracker repairs handled by `ziw-triage` versus Orchestrator
- provider-specific instructions that should move under `.agents/`

## Done

A skill trim is done when the publishable skill list, Claude plugin agents,
Codex adapters, README, setup references, checks, and tests all agree on the new
surface.
