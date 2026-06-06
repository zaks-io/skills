# Workflow Skills

Shared skills for running agent work the same way across repos.

The basic idea is simple: every repo gets a small workflow config at
`docs/agents/workflow/config.md`. The skills read that file before they touch
issues, branches, PRs, checks, previews, or deploys.

That gives agents the things they usually guess badly:

- which package manager and checks to run
- where tracked work lives
- which tracker IDs, names, and query fields actually return that work
- which labels mean implementation-ready and which statuses mean startable
- who can move tickets
- how remote issue-assigned workers are delegated
- what local, development, preview, and production mean for this repo
- when a human has to approve something

## Install

Install all skills globally:

```sh
npx skills add zaks-io/skills --all -g
```

List available skills:

```sh
npx skills add zaks-io/skills --list
```

Install one skill:

```sh
npx skills add zaks-io/skills --skill ziw-setup --agent '*' -g -y
```

## Claude Code Plugin

This repo also defines a Claude Code plugin manifest and root subagents:

```text
.claude-plugin/plugin.json
agents/*.md
```

When loaded as a Claude Code plugin, the workflow agents are available as
namespaced subagents:

```text
zaks-io-skills:ziw-triager
zaks-io-skills:ziw-implementer
zaks-io-skills:ziw-reviewer
```

Claude Code should keep the orchestrator in the main thread and delegate the
context-heavy pieces to these isolated subagents:

- `ziw-triager`: issue tracker inventory and metadata cleanup.
- `ziw-implementer`: one issue's implementation, checks, review, and PR
  handoff.
- `ziw-reviewer`: clean-context review of latest committed PRs, branches,
  ranges, main-drift findings, and orchestrator refactor candidates.

Setup, PR creation, and code review details remain workflow skills that these
subagents load only when needed.

Codex and other Agent Skills runtimes should use the same orchestration model
with native skill names:

```text
$ziw-orchestrate ZAK-123 ZAK-456
$ziw-orchestrate project "Payments" until clear
$ziw-orchestrate backlog until clear
```

When the runtime supports subagents, sessions, branches, or worktrees,
Orchestrator should keep the parent thread small and delegate context-heavy work
to `$ziw-triage`, `$ziw-implement`,
`$ziw-review`, and `$ziw-code-review`.

For local development, validate the plugin shape when Claude Code is available:

```sh
claude plugin validate .
```

For private cloud environments, grant the agent system access to this repository
through the provider's GitHub integration, or inject a read-only deploy key or
fine-grained token before running `skills add`.

## Quick Start

Set up a repo once, or rerun setup when you want to confirm the workflow config
is still current:

```text
$ziw-setup
```

That creates or refreshes:

```text
docs/agents/workflow/config.md
```

On refresh, setup reads the existing config first, checks what changed in the
repo, issue tracker, CI, worker delegation paths, and environment rules, then
patches stale or missing values.

Then run the normal flow:

```text
$ziw-to-issues <spec|prd|epic>
$ziw-triage
$ziw-orchestrate
```

Orchestrate a bounded scope:

```text
$ziw-orchestrate ZAK-123 ZAK-456
$ziw-orchestrate label:ready-for-agent one pass
$ziw-orchestrate project "Payments" until clear
$ziw-orchestrate backlog until clear
$ziw-remote-ticket zaks-io/agent-paste "update skills"
```

Readiness-label scopes such as `ready-for-agent` and `ready-for-human`
automatically exclude the configured `Done` state unless you explicitly ask to
audit Done cleanup.

To Issues turns a spec, PRD, or epic ticket into dependency-ordered one-PR
tickets. Triage gets the current set consistent. Orchestrator runs the loop:
dispatch, review, integrate, repeat.

Use direct skills when you want one specific action:

```text
$ziw-implement <issue>
$ziw-code-review <branch|pr|range>
$ziw-pr
$ziw-review <pr|range>
```

## The Operating Model

The issue tracker is the source of truth for issue state. In most repos that is
Linear. The tracker is dumb storage: it holds status, labels, and relationships
and verifies nothing. Labels are signals. Status is state. Skills define and
check what "ready" means; the tracker just stores the label. When a GitHub PR
and Linear ticket are linked, assume the integration sync is active: Linear may
advance ticket state from PR state. Repo config defines how labels and synced
state transitions are treated.

Draft PRs are pre-review. If a PR is ready-for-review, it must be non-draft in
the code host. Draft state is not a request for another code review; the
orchestrator should diagnose the draft blocker and unstick the PR when no blocker
remains.

`Code review passed` is a review-evidence label, not a ticket state. It means
the latest linked PR head SHA passed the configured code review gate. Agents
remove it when the PR head changes, blocking findings appear, the linked PR
changes, or evidence is stale.

By default, `ready-for-agent` means the ticket needs no further human refinement
before handoff to an implementation agent. Worker environment labels such as
`remote-cursor` mean the issue is approved for that configured environment. Those
labels are not dependency or scheduling gates. When a ticket moves to `Done`,
Orchestrator or verified stale-state triage removes `ready-for-agent`.
Readiness-label queries exclude `Done` by default so stale labels on terminal
tickets do not keep growing the active queue.

Kind is a separate, single-select axis: `kind-spec` and `kind-epic` are
containers that To Issues reads as input and are never dispatched; `kind-slice`
is a one-PR ticket and the only kind a worker runs. Multi-PR work should stay
under a container and be split into separate slices so a first linked PR cannot
falsely close the whole scope.

Agent suitability is based on work type and risk, not agent brand. Docs, tests,
build or CI updates, small refactors, scoped bugs, and isolated UI changes are
good default agent work. Auth, PII, secrets, payments, production, destructive
data, broad refactors, cross-repo changes, unclear domain behavior, and
performance work without benchmarks require human planning first.

Issue Triage defaults to current work: `Todo` tickets plus active or PR-linked
tickets whose tracker state may be stale. It makes Todo tickets ready for
agents, fixes metadata, and marks verified merged work done. It does not review
`Backlog` unless asked. Dependency blockers should be encoded separately, not
used to remove readiness. Agent Orchestrator owns active-work state moves except
for these narrow verified-state repairs. It reads the issue tracker, checks PR
and CI state, starts workers, asks for review, and moves tickets when the
external state says that is safe.

A one-off user request for a single ticket is still orchestration, just scoped to
that ticket. The agent should claim, implement, review, integrate when allowed,
refresh synced GitHub/Linear state, and mark that ticket complete when the normal
Done evidence exists. It should not fan out into the broader queue.

Review-created follow-up tickets are current-work intake when config defines a
review-debt route. Agent Review files real findings there; Triage normalizes
them into `kind-slice` work, To Issues input, or human-decision items; and
Orchestrator includes concrete ready slices in the normal queue. This keeps code
review debt visible without pretending every review finding is immediately
dispatchable.

Agent Orchestrator does whatever needs to happen to get tickets handled safely.
Its job is to find where tickets are stuck in the tracker-to-PR-to-merge
pipeline, determine why they are not advancing, and take the next safe action to
unblock them. It uses model judgment to synthesize tracker state, PR state,
checks, review evidence, worker signals, repo config, and risk into the next safe
action. The named actions are examples, not a complete menu; if a ticket is not
moving, Orchestrator should identify and take any safe workflow action needed to
move it forward. It can start local subagents in isolated branches or worktrees,
assign a tracker-exposed coding agent to a ticket, request another code review,
rerun checks, diagnose draft PRs that have stalled, move unblocked draft PRs to
ready-for-review, apply or remove
`Code review passed`, request CodeRabbit for risky or complex diffs, reply
directly to the original worker, mark tickets for human review or missing
information, or stop on a real blocker. The repo config records supported worker
delegation paths such as
`local-worktree`, `issue-assigned`, or both, plus only the project-specific
routing or direct-agent continuation details that are annoying to rediscover.

When you hand Orchestrator a large backlog that has already been triaged or
verified as ready to implement, it owns the delivery lane. Routine
misunderstandings about when to apply a label, move a status, attach review
evidence, set repo-route metadata, or mark a PR ready-for-review are
orchestration repairs. It should fix those from tracker, PR, check, and config
evidence and keep going instead of escalating them.

To Issues is the front door. It turns a spec, PRD, or epic ticket into
dependency-ordered `kind-slice` tickets, adopts any tickets you made by hand
instead of duplicating them, applies the body contract and labels, and emits a
dependency graph and predicted file footprint. Run it whenever you want the
tickets to match the plan; re-running converges.

Agent Orchestrator is the work loop. It is self-scheduling: it runs on the
runtime's own recurring mechanism (a schedule, `/loop`, or wake-up timer in
Claude Code; Codex automations, either cron automations or heartbeat
automations) and never needs a human to re-trigger a pass. Each tick it wakes
light, refreshes external state, reconciles its dispatch ledger, drains existing
open PRs and active previews first without closing draft or in-progress PRs just
to make room, dispatches startable `kind-slice` tickets only when the active
PR/preview cap has headroom (default 3), calls review and integrate as steps,
reasons over the available evidence, and logs where it struggled to a friction
ticket with compact event entries and run rollups. It can also nudge a worker,
repair workflow state, route feedback, mark tickets for human review when the
next action genuinely needs human input, or stop on a real blocker. It keeps only
a compact queue, ledger, capacity snapshot, and checkpoint between ticks and
delegates heavy reads to isolated workers, so a long-running loop stays as light
as a first run. Config records supported worker delegation paths such as
`local-worktree`, `issue-assigned`, or both.

If every scoped item is blocked and no orchestration action remains, the
orchestrator stops the recurring loop for that scope instead of waking forever.
The blocked report names each blocker, next owner, and what would make the scope
runnable again.

For issue-assigned remote workers such as Cursor, the orchestrator delegates by
setting the issue's agent delegate, requires the repo-route label (such as
`<org>/<repo>`) so the agent knows which repo to clone, and continues a session
by replying into its agent-session thread rather than a top-level comment.
Before re-delegating, it checks for duplicate sessions, branches, or PRs tied to
the same issue and resolves the duplicate from code-host evidence.

A delegated worker, local or remote Cursor, owns implementation: it writes code,
self-reviews with `ziw-code-review`, and opens its own PR with
`ziw-pr`. The orchestrator coordinates; it does not write code or
open PRs.

Agent Review and integrate are steps the orchestrator calls, not loops. Agent
Review fetches latest state, runs `ziw-code-review` from clean context against
current committed code, and returns freshness, refactor candidates, and a
verdict; integrate is the auto-merge gate that defines green, rebases on moved
main, merges with the configured method, and runs a post-merge check. Worker and
PR local gates must match configured CI scopes, thresholds, cache policy,
generated-artifact checks, and secret-scan range.

The research behind this operating model is captured in
[docs/agent-delivery-research.md](docs/agent-delivery-research.md). The short
version: keep one work loop, keep issues small and verifiable, measure outcomes,
and add agent or skill complexity only when it improves delivery.

## The Skills

- `ziw-setup`: create repo workflow config or refresh it against current
  repo and tracker state.
- `ziw-to-issues`: turn a spec, PRD, or epic ticket into dependency-ordered
  one-PR `kind-slice` tickets, adopt hand-created tickets, apply the body
  contract and labels, and emit a dependency graph and file footprint.
- `ziw-remote-ticket`: create or adopt one repo-scoped remote Cursor-ready
  Linear ticket for a concrete task such as updating workflow skills, then hand
  that ticket to triage and orchestration.
- `ziw-triage`: update current tracker labels, kinds, readiness, stale
  verified states, orphans, body shape, and dependencies so Todo tickets are
  clean and agent-ready. It follows the repo-configured label treatment policy,
  skips backlog unless asked, and asks or lists exact human next actions when
  something is unclear.
- `ziw-orchestrate`: run the work loop, dispatching startable
  `kind-slice` tickets and calling review and integrate as steps, without
  becoming the coder or reviewer.
- `ziw-implement`: take one startable issue through implementation,
  checks, review, and PR creation.
- `ziw-review`: independent latest-committed PR review and main-drift review from
  clean context.
- `ziw-code-review`: helper review gate for branches, PRs, explicit working
  trees, and main drift.
- `ziw-pr`: helper shipping gate that checks, reviews, commits,
  pushes, creates or updates the PR, and hands tracker state to Orchestrator.

## Recommended Flow

1. Run `ziw-setup` once per repo, and rerun it when the workflow config may
   be stale.
2. Run `ziw-to-issues` on a spec, PRD, or epic ticket to create the
   `kind-slice` tickets and dependency graph. Re-run it any time to reconcile the
   tickets with the plan.
3. Run `ziw-triage` before the first orchestration run and whenever
   Todo or active tracker state needs repair. Ask explicitly when you want
   backlog review or intake backfill.
4. Run `ziw-orchestrate` to run the loop: dispatch, review,
   integrate, repeat until the backlog is delivered or completely blocked. A
   completely blocked loop stops instead of rescheduling itself.
5. Use `ziw-remote-ticket` for a one-off remote Cursor maintenance task,
   such as updating a target repo with `npx skills add zaks-io/skills --all`.
6. Use `ziw-pr` directly only when you are already on a branch and
   want to ship it.

For the deeper agent contract, state model, handoff shape, and diagrams, see
[docs/agent-workflow.md](docs/agent-workflow.md).

## Done Means

A repo is ready when:

- `docs/agents/workflow/config.md` exists and has no critical unknowns
- every populated behavior-affecting config value has current evidence or is
  marked inferred
- issue tracker state, PR state, checks, previews, and deploy state all have
  named systems of record
- issue tracker location has verified IDs or query-safe names, not stale slugs
- Orchestrator mutation authority is explicit
- issue-assigned worker environment labels and no-mutation delegation probe
  policy are explicit
- local, development, preview, and production rules are explicit
- verification commands are recorded
- kind labels, CI-equivalent local gate policy, merge method, duplicate-dispatch
  policy, active PR/preview cap, capacity drain policy, PR closure guard,
  stuck-worker timeout, required-checks-for-merge, auto-merge risk tiers,
  friction-log ticket, and delivery metrics are set when running the autonomous
  loop
- `ziw-to-issues`, `ziw-orchestrate`, `ziw-implement`,
  `ziw-code-review`, and `ziw-pr` can run without guessing repo
  conventions

## Validate This Repo

```sh
pnpm ci:check
```
