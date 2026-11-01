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

Keep ten publishable skills. Debug and Architecture have distinct direct
callers and outcomes: investigate an unexplained failure, or assess structure
before a design decision exists. Grill owns clarification and ready specs;
Implement owns tracked delivery. Codebase design remains an Architecture
reference rather than an eleventh skill. Measure real use before further splits.

| Skill              | Decision              | Why                                                                                                                                                                                      |
| ------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ziw-setup`        | Keep                  | Owns Repo Config creation and refresh. Other roles should not rediscover commands, tracker IDs, environment rules, or agent access.                                                      |
| `ziw-debug`        | Keep, measure use     | Owns reproduction, cause investigation, and authorized narrow repair. It supports direct requests without requiring a ticket or starting PR delivery.                                    |
| `ziw-architecture` | Keep, measure use     | Owns evidence-backed architecture assessment and module proposals. It can finish with recommendations before a Grill decision exists.                                                    |
| `ziw-grill`        | Keep                  | Owns planning clarification in independent question rounds and the Draft-to-ready spec handoff. This prevents To Issues from inventing product decisions or slicing contradictory plans. |
| `ziw-to-issues`    | Keep                  | Owns spec or epic conversion into dependency-ordered Slice Tickets. This is separate from tracker cleanup and implementation.                                                            |
| `ziw-triage`       | Keep, watch size      | Makes tickets ready or routes each to one next owner before Orchestrate runs. Merging it into Orchestrate would make the loop heavier.                                                   |
| `ziw-orchestrate`  | Keep, script hot path | Owns the work loop. The planner scripts decide; the skill maps each planner action to what the agent does.                                                                               |
| `ziw-implement`    | Keep                  | Delivers one ticket as a draft PR, using Create PR.                                                                                                                                      |
| `ziw-code-review`  | Keep                  | Shared review gate: optional author QA, and the fresh-context independent review a merge needs.                                                                                          |
| `ziw-pr`           | Keep, measure overlap | Shared shipping step for branch-to-PR work, with bounded fix rounds. Merge into Implement later only if standalone PR use is rare and Orchestrator does not need a separate gate.        |

## Removed Or Demoted

| Skill or workflow   | Decision                       | Why                                                                                                                                                      |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ziw-remote-ticket` | Demoted from publishable skill | Remote Cursor ticket handling is provider-specific delegation glue. It now lives in `.agents/remote-cursor-ticket.md` instead of public skill discovery. |
| `ziw-review`        | Merged into `ziw-code-review`  | It was a thin scheduler around the same review. Two review skills confused callers; one skill with author QA and independent modes replaced them.        |
| Coverage audit loop | Not present                    | Public research favors one active loop. Add a separate loop only if measured evidence shows the Orchestrator plus Agent Review cannot cover the need.    |

## Measurement Before Trimming

The dated [instruction budget](skill-instruction-budget.md) measures entrypoints
and representative reference paths. It is a tokenizer estimate, not runtime
token usage or proof of skill quality.

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
