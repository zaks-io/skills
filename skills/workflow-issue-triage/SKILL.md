---
name: workflow-issue-triage
description: Use for issue tracker triage when cleaning up tracker projects and issues by finding orphans, applying workflow labels, prioritizing, setting dependencies, normalizing issue bodies, and preparing agent-ready implementation tickets.
argument-hint: "[project-url|team|repo|filter]"
disable-model-invocation: true
---

# Issue Triage

Maintain issue tracker projects and issues so Agent Orchestrator can delegate
implementation work without re-triaging every ticket. This is tracker metadata
cleanup, not implementation or active-work state management.

The point of this skill is to get tickets into shape. Apply safe tracker updates
directly. When something is unclear, ask the user if they are available;
otherwise mark the issue with the configured human-input state or label and
return the exact questions or next actions needed.

## Inputs

- Issue tracker project, team, repo, board, roadmap, query, or backlog scope.
- Repo path and `docs/agents/workflow/config.md`.
- Existing tracker teams, projects, statuses, labels, priorities, dependencies,
  parent or child relationships, PR links, and issue comments.
- Optional user instructions for first-run backfill, dry run, priority policy,
  or orphan routing.

## Context

Read `docs/agents/workflow/config.md` first. If it is missing, run or request
`workflow-setup` before broad cleanup.

Confirm these config values before mutating the issue tracker:

- provider location, project, team, roadmap, and routing label
- status names and mappings
- readiness, risk, type, area, ownership, and worker environment labels
- readiness label policy, worker environment label policy, and startable work
  criteria
- priority policy, dependency policy, and orphan policy
- agent-ready issue body contract
- workflow status transition owner

If tracker metadata disagrees with config, update only exact label gaps that are
safe to create. Do not create or rename workflows, statuses, teams, projects,
boards, or roadmaps without explicit approval.

## Inventory

Build a triage set before making changes:

1. Issues in the requested project, board, repo, team, or filter.
2. Issues with the repo routing label but no project.
3. Issues in `Triage`, `Backlog`, or equivalent intake states for the relevant
   teams.
4. Active issues linked to PRs, branches, docs, parent issues, blockers, or
   project milestones.
5. Recently created or updated issues that match repo, package, feature, or
   customer terms from the project.

Classify each issue as one of:

- implementation-ready slice
- blocked implementation slice
- needs human product, security, credential, customer, or ADR decision
- duplicate or likely duplicate
- parent, epic, project note, or workstream container
- orphan needing project, parent, routing label, owner, or status
- stale active work needing review

## Cleanup

Apply obvious mechanical updates in batches:

- route orphan issues into the configured project, team, or parent when evidence
  is direct; recommend intake state changes for Agent Orchestrator
- add missing routing, type, risk, area, and readiness labels from config
- remove conflicting workflow labels only after the correct replacement is clear
- mark implementation-ready slices with `ready-for-agent` when the repo-configured
  readiness policy says no further human refinement is needed, even if dependency
  blockers remain
- apply configured worker environment labels or fields when the repo-configured
  environment policy says that issue may run there; dependency state is not a
  reason to refuse the environment label
- remove `ready-for-agent` from vague, duplicate, parent, human-owned, or
  body-incomplete issues
- encode blockers and recommend the configured blocked state for Agent Orchestrator
- recommend the configured review state for issues with active open PRs
- mark duplicates only when the duplicate relationship is clear and preserve the
  canonical issue

Do not close, cancel, reprioritize across projects, or rewrite scope because an
issue looks stale. Leave a concise comment and use `needs-info` or
`ready-for-human` when judgment is required.

Do not stop at a vague recommendation. For each issue that cannot be made
implementation-ready, either ask the user a specific question or leave a
concrete next action such as "confirm acceptance criteria", "choose canonical
duplicate", "approve security scope", or "provide credential owner".

## Issue Body

Normalize implementation issues to the repo's agent-ready body contract. Preserve
useful existing text and add missing headings without inventing facts.

An issue can receive `ready-for-agent` only when it is:

- scoped to one PR
- assigned to the configured project or route
- labeled with one clear type and risk
- complete enough for Agent Implement to verify

By default, `ready-for-agent` means the ticket needs no further human refinement
before handoff to an implementation agent. Use the repo config if it defines a
different readiness policy. `ready-for-agent` does not mean dependencies are
clear, and it is not removed only because the issue is blocked by another issue.

Required body content:

- outcome
- context docs
- in scope
- out of scope
- acceptance criteria
- required checks
- security, privacy, data, and operational invariants
- dependencies or blockers

If any required field is unknowable, add the missing heading, ask the specific
question when the user is available, label the issue `needs-info` or
`ready-for-human`, and do not mark it ready.

## Human Clarification

Ask the user when direct tracker evidence is not enough to safely update scope,
priority, blockers, security posture, ownership, or acceptance criteria. Keep
questions short and tied to a concrete issue.

If the user is not available or the run is non-interactive:

- mark the issue with the configured human-input label or state
- add one concise tracker comment only when it helps the human answer
- include the exact question or next action in the final report
- leave the issue out of `ready-for-agent`

## Dependencies

Encode dependencies only from evidence:

- explicit blocker text in the issue
- tracker parent, child, related, blocker, or duplicate relationships
- accepted project sequencing from milestones, specs, or roadmap docs
- PR, migration, API, schema, infra, or release ordering that is directly
  implied by the work

Detect cycles, blockers that are done or canceled, parent issues marked ready,
and issues blocked by vague placeholder work. Fix obvious completed blockers.
Escalate ambiguous ordering instead of guessing.

Do not use dependencies as a reason to withhold or remove `ready-for-agent` or a
configured worker environment label. Encode dependency order with tracker
relationships, blocker fields, body text, or workflow state so Agent
Orchestrator can avoid starting blocked work.

## Priority

Use the configured priority policy. Good signals are:

- user-provided priority
- project priority, milestone order, due date, or initiative priority
- security, data loss, production breakage, or customer-blocking impact
- dependencies that unlock multiple ready issues
- failed PRs or active work that needs repair

Do not turn personal preference into priority. When priority is unclear, leave it
neutral and mark the issue for human triage.

## First Run

For first-run backfill:

1. Snapshot current project counts by status, label, priority, dependency state,
   and readiness.
2. Create missing workflow labels only when names are exact and config-approved.
3. Normalize orphan routing and body headings before setting priorities.
4. Make readiness the final step after labels and body contracts are correct.
   Encode blockers separately; blocker state does not decide whether
   `ready-for-agent` applies.
5. Report the before and after counts.

## Guardrails

- Keep comments metadata-only. Do not paste secrets, customer data, logs,
  signed URLs, or credentials into the tracker.
- Do not implement code, create PRs, merge, deploy, or mutate production.
- Do not move active issues between workflow states unless config or the user
  explicitly delegates that authority to Issue Triage.
- Do not create noisy comments for every small label edit. Prefer one summary
  comment when an issue needs explanation.
- Do not create new label taxonomies unless config or the user explicitly names
  them.
- Stop before destructive bulk changes if more than a small number of issues
  would be canceled, closed, moved across projects, or reprioritized.

## Done

Report:

- issue tracker scope reviewed
- issues changed, unchanged, and needing human decision
- orphans routed or left with reasons
- labels, priorities, body contracts, dependencies, and status recommendations
  updated
- issues newly implementation-ready, newly startable, and removed from readiness
- duplicates, dependency cycles, stale active work, and config gaps found
- user questions asked or exact human next actions left
- actual next items to do before the remaining issues can become
  implementation-ready or startable
- whether the run was dry-run, partial, or applied
