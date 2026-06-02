---
name: ziw-orchestrate
description: Use to orchestrate a specific ticket set, filter, project, or backlog-until-clear run by selecting startable issues, delegating to local or remote workers, calling review and integrate as steps, recording a friction log, updating the tracker, and stopping when human input or a completely blocked queue leaves no safe action.
argument-hint: "[ticket-ids|filter|project|until-clear]"
disable-model-invocation: true
---

# Orchestrate

Orchestrate tracked work. Own the authority to mutate workflow status in the
configured issue tracker. Coordinate; do not implement, review, or merge by hand.
Implementation, review, and merge are delegated work or called steps, never
inlined.

Use the model's judgment to move work forward. The orchestrator's job is to find
where tickets are stuck in the tracker-to-PR-to-merge pipeline, determine why
they are not advancing, and take the next safe action to unblock them. It is not
a passive rules engine or a checklist executor: synthesize issue state, PR state,
checks, review evidence, worker signals, repo config, and risk into the next safe
action. The actions named in this skill are examples and guardrails, not a
complete menu. If a ticket is not moving and the needed workflow action is not
listed, use model judgment to identify and take the safe action anyway. Prefer
acting, delegating, nudging, rerunning, or repairing when the action is
reversible, bounded to workflow state, and supported by evidence. Escalate only
when the next safe action truly needs missing authority, credentials,
provider/customer input, production approval, or product/security/ADR judgment.

For a backlog that has already been triaged or verified as ready to implement,
Orchestrator owns the whole delivery lane until each scoped ticket is done or has
a real external blocker. Simple label, status, readiness, route, or handoff
misunderstandings are Orchestrator repair work. Do not stop or ask the user just
because a ticket is missing the expected label, sitting in the wrong workflow
status, or waiting for a routine handoff state; diagnose the mismatch from
tracker, PR, check, and config evidence, fix the metadata, and keep the ticket
moving.

## Inputs

- Repo path and configured issue tracker location.
- Optional explicit ticket IDs or URLs.
- Optional loop budget, project, milestone, label, status, backlog, or issue
  filter.
- Optional completion target such as `until clear`, `until backlog clear`,
  `until no startable work remains`, or `one pass`.
- Current tracker and PR state for the configured workflow.

## Invocation Modes

Resolve the user's requested scope before taking action. If the scope is
ambiguous and a safe read-only query can disambiguate it, run that query and
continue. Ask only when multiple real scopes remain plausible.

- Explicit tickets: work exactly the listed issue IDs or URLs. Include linked
  blockers, PRs, and child issues only when they affect whether those tickets
  can move.
- Filtered queue: work the configured tracker query, project, milestone, label,
  status, assignee, or roadmap the user named.
- Current-work loop: when no scope is named, work configured ready and active
  issues only.
- Backlog or intake clear: when the user explicitly says backlog, intake, or
  "until backlog is clear", first run triage with backlog or intake scope
  included, then orchestrate all newly ready or active work in that scope.
- Verified-ready backlog: when the user gives a large set of tickets that have
  already been reviewed for implementation readiness, treat the set as a delivery
  lane. Do not send routine label/status mismatches back to the user. Repair
  readiness labels, workflow status, repo-route metadata, environment metadata,
  review evidence labels, and handoff state when current evidence and config make
  the intended state clear.
- Until clear: continue passes until every issue in the requested scope is done,
  delegated and waiting, blocked, waiting on human input, ready for merge but
  lacking merge authority, or otherwise has no safe next action.
- One pass or budgeted loop: stop after the requested pass count, worker count,
  ticket count, time budget, or first meaningful state change.

Do not interpret "clear the backlog" as permission to implement vague future
work. Clear means every issue in scope has a truthful next state and owner:
implemented, delegated, ready for review, ready to merge, blocked, needs-info,
ready-for-human, or explicitly out of scope.

## Loop Entry Point

The orchestrator is meant to run as a self-driving recurring loop, not a manual
one-shot. Use the runtime's own recurring mechanism (a schedule, a `/loop`, or a
wake-up timer in Claude Code; a scheduled task or automation in Codex) so it
wakes itself. Never require a human to re-trigger each pass. If the runtime has no
recurring primitive, run one pass and report the exact command to schedule.

Each wake-up is one tick: wake light, rebuild the queue from systems of record,
act on a bounded slice of work, persist only the ledger and checkpoint, then sleep
only when future external signal can still arrive. If the scoped queue is
completely blocked, stop the recurring loop for that scope instead. A long-running
loop must stay as light as a first run; do not loop in-context until the backlog
empties. See
[references/loop-contract.md](references/loop-contract.md) for the tick contract,
light-context budget, and cadence.

## Lightweight Control Loop

Keep the orchestrator's own context small. Load enough state to choose and track
the next action, then delegate context-heavy work.

In the main orchestration context, keep only:

- repo config path and relevant verified config values
- scope query, pass budget, and completion target
- compact issue queue with ID, title, state, readiness, blockers, PR, owner, and
  next action
- compact worker ledger with issue, branch or PR, agent path, started time,
  latest status, and next check
- blocker and human-question list

Do not load full issue histories, long logs, full diffs, full PR reviews, or
test output into the main context unless they are needed to choose the next
orchestration action.

For runtimes with subagents or worker threads, delegate these context-heavy
pieces to the runtime's isolated-worker equivalent:

- Triage worker for tracker inventory, backlog or intake cleanup, readiness
  repair, dependency cleanup, and stale-state reconciliation
- Implementation worker for one issue's implementation, verification, review
  feedback, and PR handoff
- Review worker for PR review, branch or range review, and main-drift review

Use runtime-native names when they exist:

- Claude Code plugin: `zaks-io-skills:ziw-triager`,
  `zaks-io-skills:ziw-implementer`, and
  `zaks-io-skills:ziw-reviewer`
- Codex or Agent Skills runtimes: `$ziw-triage`,
  `$ziw-implement`, `$ziw-review`, and
  `$ziw-code-review`, preferably in isolated subagents, sessions, branches,
  or worktrees when available

Worker prompts should include only repo path, scope or issue ID, branch or PR,
acceptance criteria, required checks, hard constraints, and expected output.
After each worker returns, reduce its result into the compact queue and worker
ledger before continuing.

## Context

Read first:

- `docs/agents/workflow/config.md`
- `AGENTS.md`
- project status, roadmap, specs, ADRs, and workflow docs referenced by config
- active tracker issues and linked PRs

If config is missing, run or request `ziw-setup` before starting new work.

## Role Boundary

Orchestrator is the only work loop. It decides the next action and delegates the
heavy work. It keeps its own context thin: it reads tracker and PR metadata, not
diffs or source.

- Implementation is delegated to a worker (`local-worktree` subagent or
  `issue-assigned` remote agent such as Cursor). The worker writes code,
  self-reviews with `ziw-code-review`, and opens its own PR with
  `ziw-pr`.
- Review is a called step: `ziw-review` in a clean subagent or
  worktree. Orchestrator never reads the diff to review it itself.
- Merge is a called step: the integrate gate below. It is the only action that
  writes to the default branch.

## State Authority

Do not treat local orchestrator files, logs, or checkpoints as authoritative.
Refresh the systems of record before acting:

- issue workflow state from the configured issue tracker
- claim records from configured issue tracker fields, assignments, labels, and
  comments
- branch and PR state from the configured code host
- check and preview state from CI, preview, or hosted check providers
- deploy state from the deployment provider
- local Git refs, worktrees, HEAD, and `git status --short --branch` from the
  repo when a local checkout is in play

Orchestrator may keep local scratch state only for polling, checkpoints, or
duplicate suppression. The next action must be valid against the refreshed
external state. Local Git is an observation, not the authority, but stale local
refs are not enough to dispatch, review, integrate, or reason about file
contention. Update local Git state as the tick advances, especially after worker,
PR, or default-branch changes.

## Dispatch Ledger

The tracker is the durable source of truth. The ledger is an ephemeral, local,
non-authoritative cache of in-flight dispatches so a tick can detect stuck
workers, suppress duplicate delegation, and time out dead runs. It may be empty
on any tick (fresh process, remote environment) and the tick must still work by
rebuilding from tracker and PR state.

Per in-flight dispatch, record only:

- issue ID
- worker path (`local-worktree` or `issue-assigned`) and target (agent or branch)
- dispatch idempotency key (issue ID + claim marker), to avoid double dispatch
- first-dispatch tick or timestamp, for stuck detection
- last observed external signal (branch created, PR opened, review verdict)

On every tick, reconcile the ledger against refreshed tracker and PR state.
Trust external state over the ledger. Drop ledger entries that external state has
moved past. Never act on a ledger entry without confirming it against the
tracker or code host first.

## Tracker Tooling

Use the configured tracker tool or MCP directly when it is available. Do not
inspect local tool-result caches, CLI transcript files, or generated logs to
understand tracker state while the tracker tool can answer the question.

Before broad queries or mutations, confirm the exact configured tracker
location from `docs/agents/workflow/config.md`:

- provider IDs for team, project, board, repo, milestone, or roadmap
- query-safe names when the provider requires names instead of IDs
- status field names and relationship fields used by the current tool
- configured routing, readiness, and worker environment labels
- readiness label policy, worker environment label policy, and startable work
  criteria
- read-only query shape that verified the metadata

If config uses a slug or display name that returns empty results but a verified
ID is available, use the ID and patch the config after the orchestration repair.
If neither the configured name nor an ID resolves, stop for `ziw-setup`
refresh instead of guessing.

The tracker verifies nothing. Readiness, environment approval, and blocked state
are claims written as labels and status by upstream skills. Orchestrator trusts
the label only after re-checking the gating facts in the preflight below.

Only `kind-slice` tickets are dispatchable. A `kind-spec` or `kind-epic`
container reaching dispatch is a hard refuse: never delegate it, even if it
carries `ready-for-agent`. Treat a dispatchable container as a To Issues miss,
heal it inline when the correct kind is unambiguous (see Self-Healing below), and
log a `config-gap` friction entry.

When a ticket does not add up, use model judgment over refreshed evidence to
choose the next safe action. Repair stale or inconsistent workflow state when
the evidence is enough, escalate missing intent or authority, never skip a
ticket silently, and record every fix. For the orchestrator specifically:

- Heal or repair inline when evidence supports a safe action, for example two
  `kind-*` labels, a typo'd label that resolves to a verified ID, a status
  contradicted by a merged PR, a stalled draft PR with no remaining draft
  blocker, or a worker session that needs a direct nudge.
- Escalate intent-level gaps with `needs-info` or `ready-for-human`; do not guess
  scope, priority, or security posture.
- Never leave a ticket in a silent dead end. Every ticket produces a heal, an
  escalation, or a friction entry.
- Log a `config-gap` friction entry for every inline heal, so repeated mistakes
  become a list of what to fix upstream.

## Orchestration

Orchestrator chooses the next action needed to get tickets handled safely by
reasoning over tracker state, PR state, checks, review evidence, worker signals,
repo config, and risk. The examples below are not exhaustive. Depending on the
evidence, it can assign implementation work, nudge an existing worker, call
review, call integrate, route review feedback, mark a ticket for human review or
missing information, repair tracker metadata, move workflow state, or stop on a
real blocker.

When a previously verified-ready ticket is not moving through the expected
workflow state, first ask "what fact would make this ticket eligible for the next
pipeline step?" Then verify that fact against systems of record and repair the
workflow metadata when evidence is clear. Examples: add or restore
`ready-for-agent`, move a ready ticket back to the configured ready status, set a
missing repo-route or worker environment value, clear stale review evidence,
change a draft PR to ready-for-review, move a reviewed PR to `Ready to Merge`, or
move merged work to `Done` and clear readiness. Escalate only when the missing
fact is product intent, authority, credentials, provider/customer input,
production approval, or a judgment the orchestrator cannot safely make.

Use the worker delegation paths supported by `docs/agents/workflow/config.md`:

- `local-worktree`: Orchestrator starts local subagents, gives each
  implementation worker an isolated worktree or branch, and manages issue state,
  PR state, and review handoff through the tracker.
- `issue-assigned`: Orchestrator delegates the ticket to a tracker-exposed
  coding agent. In Linear this means using the verified delegation field or agent
  account exposed by the integration. The assigned agent works in its configured
  environment and returns a PR.

Orchestrator may use both paths when config allows it, choosing the safest path
for the issue. Orchestrator does not become the implementer or reviewer.

## Scope Clearing

At the start of each pass, classify every issue in scope:

- `needs-triage`: missing body contract, labels, route, dependencies, or stale
  state repair
- `startable`: ready for agent, unblocked, complete enough to verify, and not
  already claimed
- `active`: delegated, in progress, in review, changes requested, ready to
  merge, or linked to an open PR
- `blocked`: blocked by tracker relationship, body blocker, credentials,
  provider, product, security, ADR, customer input, or production approval
- `human`: model judgment cannot safely resolve the next step from evidence, or
  Orchestrator lacks authority for the next state
- `done`: verified merged, closed, canceled, or otherwise terminal according to
  config

For an `until clear` run, continue until no issue remains in `needs-triage`,
`startable`, or active states that have a safe next action. If new issues enter
scope during the run through triage repair, include them unless the user set a
fixed ticket list or fixed count.

For explicit ticket sets, do not silently expand to unrelated backlog work. For
backlog clear runs, do not skip the triage pass; otherwise the orchestrator will
start from stale or vague issue state.

## Loop

Each tick is stateless against external state. On each pass:

1. Refresh code host and issue tracker state for the configured locations using
   the configured tracker tool/MCP and verified IDs. Refresh local Git refs and
   status for the repo, including relevant branches and worktrees, then note the
   current default branch HEAD.
2. Reconcile the dispatch ledger against refreshed state. For each in-flight
   dispatch with no branch, PR, or worker signal past the configured stuck
   timeout, treat the worker as stuck: reply directly to the assigned agent's
   continuation target or escalate, and record a `stuck-worker` friction entry.
3. Find active work: `In Progress`, `Blocked`, `In Review`,
   `Changes Requested`, and `Ready to Merge`. Prefer advancing active work over
   starting new work.
4. Advance returned PRs, including draft PRs with no clear next action, through
   the PR Review And Integrate process below.
5. Reconcile the configured review-debt intake route. Send broad or incomplete
   findings to triage or To Issues, and include concrete review-created
   `kind-slice` issues in the startable frontier once their body, labels,
   dependencies, and route are complete.
6. Find startable work: `kind-slice` plus `Todo` plus `ready-for-agent`,
   unblocked, with a complete agent-ready body. `ready-for-agent` means no
   further human refinement is needed before agent handoff; it can be present on
   blocked issues. Never treat a `kind-spec` or `kind-epic` container as
   startable. Check provider blocker relationships and explicit body blockers
   before starting or delegating work. Treat labels as signals and statuses as
   the workflow state. For verified-ready backlog work, if the only gap is a
   routine label or status mismatch and the correct state is clear from evidence,
   repair it and continue instead of skipping the ticket.
7. Select new work by dependency order, milestone/project priority, risk, and
   file/package contention. Do not dispatch a ticket whose predicted files
   collide with an in-flight dispatch; defer it and record a `file-collision`
   friction entry.
8. Respect the configured concurrency cap. Default to 3 concurrent in-flight
   workers when config names no cap. Dispatch new work only up to
   `cap - in-flight`. If the cap is reached, advance existing work only.
9. Choose the next orchestration action. The following actions are examples, not
   limits; use model judgment to handle any other evidence-backed workflow action
   needed to keep the ticket moving:
   - isolated implementation worker, such as Claude Code
     `ziw-implementer`, Codex `$ziw-implement`, or local
     worktree for `local-worktree`
   - tracker-exposed assigned agent for `issue-assigned`
   - isolated review worker, such as Claude Code `ziw-reviewer` or Codex
     `$ziw-review`, for independent PR review and main-branch drift
     review
   - isolated triage worker, such as Claude Code `ziw-triager` or Codex
     `$ziw-triage`, for issue metadata cleanup
   - draft-state repair, additional code review, CodeRabbit escalation, or check
     rerun when the PR state needs evidence
   - integrate for a reviewed, green PR
   - direct worker nudge or feedback reply when the original worker can continue
   - human-review marker only when model judgment cannot safely resolve the next
     step from evidence and config
   - local Codex for orchestration repair, metadata updates, and small
     coordination fixes
   - planning agent for ambiguous product, security, or architecture
10. Build the worker prompt, assignment comment, or tracker handoff from config,
    issue body, linked docs, required checks, branch/worktree, and
    `ziw-implement`. Record the dispatch in the ledger and tracker with
    an idempotency key.
11. Append friction entries for this tick (see Friction Log). Continue only while
    safe actions remain and the user-specified loop budget allows it. If no safe
    action remains because the scoped queue is completely blocked, stop the
    recurring loop for that scope.

## Worker Prompts

Build short, self-contained prompts. The worker should fetch details itself from
the repo, tracker, branch, or PR.

Implementation worker prompt:

```text
Use the isolated implementation worker for this runtime.
Claude Code: zaks-io-skills:ziw-implementer.
Codex or Agent Skills: $ziw-implement.
Repo: <path>
Issue: <id-or-url>
Branch/worktree: <branch-or-create-policy>
Scope: <one sentence from issue>
Required checks: <commands or config reference>
Constraints: preserve unrelated changes; no production deploy; no secrets.
Return the workflow handoff only.
```

Review worker prompt:

```text
Use the isolated review worker for this runtime.
Claude Code: zaks-io-skills:ziw-reviewer.
Codex or Agent Skills: $ziw-review or $ziw-code-review.
Repo: <path>
PR/branch/range: <target>
Base: <base branch or range>
Intent source: <issue or PR URL>
Required checks: <commands or config reference>
Return the review report and no code changes.
```

Triage worker prompt:

```text
Use the isolated triage worker for this runtime.
Claude Code: zaks-io-skills:ziw-triager.
Codex or Agent Skills: $ziw-triage.
Repo: <path>
Scope: <ticket list, query, project, backlog, or intake scope>
Goal: <make ready/current work truthful/until backlog clear>
Authority: <config mutation authority summary>
Return changed issues, newly startable issues, blockers, and questions.
```

## Issue-Assigned Agents

Use issue-assigned agents only when the issue tracker currently exposes an
assignable agent for the ticket. The agent might be Cursor, Codex, or another
configured worker. This is issue-tracker assignment, not a local CLI invocation.
Use config only for project-specific routing, direct-agent reply targets, or
continuation comment details that are not obvious from the tracker.

Before starting issue-assigned work, run a read-only preflight:

- resolve the issue by configured tracker ID, not only by a human-friendly team
  or project name
- verify status, readiness labels, routing labels, priority, and issue body
- verify the configured repo-route label (such as `<org>/<repo>`) is present.
  The assigned agent needs it to resolve which repository to clone, so it is a
  hard precondition for delegation, not optional metadata. If the route is
  missing but the tracker team maps unambiguously to one repo, heal it inline and
  log a `config-gap`; if the target repo is ambiguous, escalate `needs-info` and
  do not delegate.
- verify blockers and dependencies from provider relationships and body text
- verify the requested agent is exposed by the tracker or the config has a
  previously verified delegation tool, field, or agent ID
- verify the issue is not already claimed, delegated, linked to an open PR, or
  waiting on review feedback

See [../../ziw-setup/references/operating-profile.md](../../ziw-setup/references/operating-profile.md)
for the full delegation preflight table, the agent-session continuation
mechanic, the concurrency default, and the merge-safety decision table.

Configured worker environment labels or fields, such as `remote-cursor`, are
environment approval metadata. Apply or preserve them when the issue identity,
repo route, and repo-configured environment approval criteria are verified. Do
not require dependencies to be clear just to apply the environment label.

Do not mutate a real issue to discover whether an agent name or delegation field
works. Use read-only metadata, a documented config value, or stop with the exact
missing config item. If the user explicitly approves a probe, use only a
dedicated test issue and restore it afterward.

To start issue-assigned work:

- verify the issue is implementation-ready, unblocked, and has the configured
  repo routing label, worker environment label, field, or metadata the
  integration needs, when config names one
- if the user explicitly requested issue-assigned agents and an
  implementation-ready issue is missing only the configured worker environment
  label or field, repair that environment metadata and continue; do not ask again
- assign the selected agent to the issue through the configured issue tracker
- record the delegation in the issue tracker and ledger, including expected PR
  and check requirements

The assigned agent owns the configured environment, implementation run, code
review, and PR return path. If Orchestrator needs to reach that same session,
reply directly to the assigned agent's continuation target, such as the latest
agent comment thread or the config-named reply location. For remote Cursor
agents, do not post a top-level issue comment unless config verifies that
top-level comments continue the assigned-agent session. If no direct reply target
can be found, stop with the missing continuation path instead of assuming the
agent will see it. Do not start a new assignment for PR fixes while the original
session can continue.

For Linear issue-assigned agents, delegate by setting the issue `delegate` field
to the configured agent user (for Cursor, the `Cursor` agent user); the human
stays assignee. Do not confuse a human assignee with an issue-assigned coding
agent. Continue an existing session by replying into the agent-session thread
(the integration's thread-root comment) using its `parentId`; a top-level issue
comment does not reach the session. Record the returned session handle, such as
the `cursor.com/agents/bc-<id>` URL, in the ledger. See the operating profile
referenced above for the verified mechanic.

## PR Review And Integrate

For each returned PR, Orchestrator owns the state machine. Review and integrate
are called steps, not inlined work:

1. Refresh PR draft status, branch head, required checks, review comments, and
   linked issue state from the code host and tracker.
2. If the PR is draft, diagnose draft state before asking for review: inspect
   repo draft policy, PR body, check state, unresolved review comments, linked
   issue state, handoff notes, `Code review passed` evidence, and the original
   worker session. A draft-only stall is an orchestration repair, not a code
   review request.
3. For a draft PR, identify the exact blocker. If checks are still running or
   failing, rerun or route the check failure. If author fixes, missing metadata,
   or human prep are required, reply to the original worker's continuation target
   or mark the ticket for human attention. If no explicit draft blocker remains,
   mark the PR ready-for-review and verify it is non-draft.
4. Confirm code review happened when feasible and covers the current PR head
   before applying `Code review passed`, moving to `Ready to Merge`, or calling
   integrate. Request Agent Review only when review evidence is the actual
   blocker, not merely because the PR is draft.
5. When the next action requires review evidence, ask Agent Review to run
   `ziw-code-review` in a subagent or disposable worktree.
6. If Agent Review ran, read the review verdict and CodeRabbit recommendation
   from the review artifact.
7. If the PR head changed since `Code review passed` was applied, or the label
   lacks reviewed head SHA evidence, remove the label before continuing.
8. If the latest review has blocking findings, remove `Code review passed` and
   post actionable findings as PR review comments when configured.
9. Move the issue to `Changes Requested` when author fixes are needed.
10. Send feedback as a direct reply to Agent Implement or the original worker's
    continuation target when available. Do not use a top-level issue comment for a
    remote Cursor agent unless config verifies that route. Record a `review-thrash`
    friction entry when a ticket returns to review more than the configured number
    of times.
11. Keep fixes on the same branch and PR.
12. After fixes, ask Agent Review to rerun review and required checks.
13. When Agent Review is clean for the current PR head, apply
    `Code review passed` to the issue and record the PR URL, reviewed head SHA,
    review artifact, and reviewer path in a tracker comment or configured
    evidence field.
14. Before changing draft state, refresh code-host PR state and the current PR
    head. Before applying `Code review passed`, moving tracker state to
    `Ready to Merge`, or calling integrate, refresh local Git refs and code-host
    PR state. Verify the local branch or worktree HEAD, PR head SHA, and default
    branch HEAD still match the review and check evidence. If they do not match,
    rerun review and checks for the current head instead of approving or merging
    from stale local state.
15. If review is clean, required checks pass or are not required, and the PR is
    still draft, move the PR to ready-for-review unless the user or repo config
    explicitly says to keep it draft. Then refresh the code-host PR state and
    verify it is non-draft. This is a code-host PR state change, separate from
    tracker status. A kept-draft PR is pre-review; do not call it
    ready-for-review.
16. If CodeRabbit is recommended for the current diff, request the configured
    CodeRabbit path after local review is clean. Treat missing auth, rate
    limits, or credits as a recorded skip unless the user explicitly required
    CodeRabbit.
17. Act only on high-priority CodeRabbit findings: P0/P1, security, data loss,
    correctness regression, production blocker, or a user-requested finding.
18. Move to `Ready to Merge` only when Agent Review is clean, required checks
    pass, the PR is non-draft and ready-for-review, `Code review passed` is
    current for the PR head, and required CodeRabbit escalation is complete or
    recorded as skipped by policy.
19. Call integrate when the auto-merge gate is satisfied.

Do not leave a PR in draft just because the implementation worker opened it as
draft or because no one asked Orchestrator to unstick it. Orchestrator owns
finding the draft blocker, taking the safe next action, and moving the PR to
ready-for-review when no blocker remains. If Orchestrator lacks permission to
mark it ready-for-review, stop with the exact required code-host action.
Ready-for-review means non-draft.

### Integrate Gate

Integrate is the only step that writes to the default branch. Run it only when
the configured merge authority grants Orchestrator merge rights. Otherwise stop
with the PR ready for human merge and mark it for the human-attention queue.

"Green" is defined by config, not assumed. Default gate, all required:

- `ziw-review` verdict is clean (`Ready to Merge`)
- configured required CI checks pass
- no unresolved blocking review comments
- the PR is not in the configured high-risk set requiring human merge, unless
  config grants Orchestrator authority for that risk tier

When the gate passes:

1. Refresh local Git refs and code-host PR state immediately before merging.
   Verify the local observation of the PR head, default branch HEAD, merge base,
   required checks, review verdict, and draft state matches the code host. If
   any value is stale or missing, update the local checkout and rerun the
   affected gate instead of merging.
2. If the default branch moved since the PR branch last updated, rebase or update
   the branch, then rerun required checks and `ziw-review`. Do not
   merge a stale branch on the assumption it still applies. Record a
   `merge-conflict` friction entry if the rebase needed manual resolution and
   escalate instead of guessing on a real conflict.
3. Merge through the configured mechanism.
4. Refresh local Git refs and update the local default branch to the merged head
   before any post-merge check, next PR decision, or issue `Done` transition.
5. Run a post-merge check on the default branch when config names one. Mergeable
   does not prove correct after merge. Record a `post-merge-break` friction entry
   and escalate if the post-merge check fails.
6. Move the issue to `Done` only after the merge and post-merge check succeed.
   In the same tracker update, remove `ready-for-agent` or the repo-configured
   readiness label from the done ticket. Done work is no longer waiting for agent
   handoff.

Never merge or deploy production without explicit approval. A label alone is
never permission to merge.

## Friction Log

Maintain a running, write-only log of where the loop struggled, so the system can
be improved later. This is the one orchestrator artifact that is retrospective,
not state. Orchestrator writes it and never reads it back to make decisions.

Sink: post each entry as a comment on the configured friction-log ticket, a
dedicated tracker ticket parked in a non-workflow state so it never enters the
work queue. Append only; do not read the whole thread. If config names no
friction-log ticket, create one once in the configured location, parked out of
the work queue, and record its ID in config during the next setup refresh.

Write entries at the loop's existing give-up, retry, and stop points: every
escalation, every re-dispatch, every deferral for contention, and every ticket
that bounces review. At the end of a bounded run, post one compact rollup with
counts by category. Do not post a rollup every tick unless the run is explicitly
unattended and config asks for that visibility.

When review-created tickets repeatedly enter the queue with missing kind, route,
readiness, dependency, or file-footprint data, log `review-debt-intake` friction
instead of letting them quietly become generic Tech Debt. That signal points
upstream to Agent Review, To Issues, triage, or setup depending on the missing
field.

Each entry is one compact comment, metadata only:

```text
tick: <id or timestamp>
ticket: <ISSUE-ID or "loop">
category: ambiguous-ticket | dependency-wrong | file-collision | stuck-worker | review-thrash | review-debt-intake | merge-conflict | post-merge-break | config-gap | escalation
what: <one line>
cost: <ticks, retries, or wall-clock burned>
signal: <what would have prevented it, and which upstream skill it points at>
```

Rollup comments use the same metadata style:

```text
run: <id or timestamp>
scope: <ticket IDs, query, project, or filter>
started: <count>
merged: <count>
waiting: <count>
blocked: <count>
first-pass-checks: <passed/total or "unknown">
review-rework: <tickets returned for fixes>
friction: <category=count, category=count>
agent-cost: <tokens, credits, or "unknown">
```

Categories map to the upstream skill to fix: `ambiguous-ticket` and
`dependency-wrong` point at To Issues and triage; `file-collision` points at
To Issues footprint prediction; `stuck-worker` points at liveness timeout tuning;
`review-thrash` points at slice size; `review-debt-intake` points at Agent
Review, To Issues, triage, or setup; `merge-conflict` and `post-merge-break`
point at slicing or serialization; `config-gap` points at setup.

The friction log never replaces escalation. Items needing the user now still get
`ready-for-human` or the configured human-attention state plus notification. The
log is the slow retrospective channel; escalation is the fast one.

Never paste secrets, diffs, customer data, signed URLs, or private logs into the
friction log. One line of metadata, IDs, and counts only.

## Stop Conditions

Stop and report when:

- no startable work exists and no active work can be advanced
- all active work is waiting on humans, credentials, providers, production
  access, customer input, or merge authority after every evidence-backed unblock
  path has been tried
- the next action needs a product, security, ADR, or scope decision
- issue tracker, code host, or required worker tooling is unavailable
- checks fail for a reason the orchestrator cannot safely fix
- the configured loop budget is exhausted
- a thrash circuit breaker trips, such as one ticket exceeding the configured
  attempt cap across implement and review

Completely blocked means the refreshed scope has no startable tickets, returned
PRs to advance, stuck workers to nudge, failed checks to rerun or route, stale
metadata to repair, or in-flight work that can still produce signal. Every
non-terminal ticket is waiting on an explicit external blocker, missing authority,
human/provider/customer input, credentials, merge authority, or a decision the
orchestrator cannot safely make. When the queue is completely blocked, stop the
recurring loop or schedule for that scope; do not keep sleeping and waking to
rediscover the same blocked state. Report the blocker list, next owner, and exact
condition that would make the scope runnable again.

When all in-flight work is done, the ready frontier is empty, and no scoped
ticket remains blocked or waiting on outside input, report the backlog as
delivered with a summary. Otherwise report the scope as blocked and stop the
loop.

## Guardrails

- Never implement, review diffs, or merge by hand when a delegated worker,
  `ziw-review`, or the integrate gate is the right owner.
- Never assign blocked work to a worker.
- Never use a real implementation issue as a capability probe.
- Never add `ready-for-agent` unless the issue satisfies the body contract.
- Never withhold or remove `ready-for-agent` or configured worker environment
  metadata only because dependency blockers remain.
- Never act on a ledger entry without confirming it against refreshed external
  state.
- Mark issues `ready-for-human`, `needs-info`, `Blocked`, or the configured
  equivalent when human review, approval, credentials, product input, or security
  judgment is the next owner after evidence-backed workflow actions have been
  tried.
- Never start a new worker for review fixes when the original worker can
  continue.
- Never merge a stale branch without rerunning checks and review after updating
  it.
- Never merge or deploy production without explicit approval.
- Never treat a label alone as permission to change state, merge, deploy, or use
  hosted resources.
- Keep tracker comments and friction entries metadata-only. Do not paste secrets
  or private logs.

## Done

Report:

- issues started, nudged, reviewed, integrated, blocked, or moved
- PRs checked, reviewed, merged, and their state
- draft PRs diagnosed, marked ready-for-review, or left draft/pre-review with
  exact reason
- `Code review passed` labels applied, preserved, or removed with reviewed head
  SHA evidence
- `ready-for-agent` or repo-configured readiness labels removed from tickets
  moved to `Done`
- CodeRabbit escalations requested, completed, skipped, or still required
- workers launched or messaged, direct reply targets used, and any stuck workers
  re-dispatched or escalated
- issue updates made
- whether the recurring loop continues or stopped because the scoped queue is
  completely blocked
- friction entries and delivery metrics logged this run, grouped by category
- remaining blockers and next safe action, or a delivered-backlog summary
