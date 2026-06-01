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
npx skills add zaks-io/skills --skill workflow-setup --agent '*' -g -y
```

For private cloud environments, grant the agent system access to this repository
through the provider's GitHub integration, or inject a read-only deploy key or
fine-grained token before running `skills add`.

## Quick Start

Set up a repo once, or rerun setup when you want to confirm the workflow config
is still current:

```text
$workflow-setup
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
$workflow-decompose <spec|prd|epic>
$workflow-issue-triage
$workflow-agent-orchestrator
```

Decompose turns a spec, PRD, or epic ticket into dependency-ordered one-PR
tickets. Triage gets the current set consistent. Orchestrator runs the loop:
dispatch, review, integrate, repeat.

Use direct skills when you want one specific action:

```text
$workflow-agent-implement <issue>
$workflow-code-review <branch|pr|range>
$workflow-secret-redaction <path|stdin>
$workflow-create-pr
$workflow-agent-review <pr|range>
```

## The Operating Model

The issue tracker is the source of truth for issue state. In most repos that is
Linear. The tracker is dumb storage: it holds status, labels, and relationships
and verifies nothing. Labels are signals. Status is state. Skills define and
check what "ready" means; the tracker just stores the label. Repo config defines
how labels are treated.

By default, `ready-for-agent` means the ticket needs no further human refinement
before handoff to an implementation agent. Worker environment labels such as
`remote-cursor` mean the issue is approved for that configured environment. Those
labels are not dependency or scheduling gates.

Kind is a separate, single-select axis: `kind-spec` and `kind-epic` are
containers that decompose reads as input and are never dispatched; `kind-slice`
is a one-PR ticket and the only kind a worker runs.

Issue Triage defaults to current work: `Todo` tickets plus active or PR-linked
tickets whose tracker state may be stale. It makes Todo tickets ready for
agents, fixes metadata, and marks verified merged work done. It does not review
`Backlog` unless asked. Dependency blockers should be encoded separately, not
used to remove readiness. Agent Orchestrator owns active-work state moves except
for these narrow verified-state repairs. It reads the issue tracker, checks PR
and CI state, starts workers, asks for review, and moves tickets when the
external state says that is safe.

Decompose is the front door. It turns a spec, PRD, or epic ticket into
dependency-ordered `kind-slice` tickets, adopts any tickets you made by hand
instead of duplicating them, applies the body contract and labels, and emits a
dependency graph and predicted file footprint. Run it whenever you want the
tickets to match the plan; re-running converges.

Agent Orchestrator is the work loop. Each tick it refreshes external state,
reconciles its dispatch ledger, dispatches startable `kind-slice` tickets to
local or remote workers up to a concurrency cap, calls review and integrate as
steps, heals unambiguous tracker mistakes inline, and logs where it struggled to
a friction ticket. It can also nudge a worker, route feedback, mark tickets for
human review, or stop on a real blocker. Config records supported worker
delegation paths such as `local-worktree`, `issue-assigned`, or both.

A delegated worker, local or remote Cursor, owns implementation: it writes code,
self-reviews with `workflow-code-review`, and opens its own PR with
`workflow-create-pr`. The orchestrator coordinates; it does not write code or
open PRs.

Agent Review and integrate are steps the orchestrator calls, not loops. Agent
Review runs `workflow-code-review` from clean context and returns a verdict;
integrate is the auto-merge gate that defines green, rebases on moved main,
merges, and runs a post-merge check.

Spec-conformance is the second loop. On its own cadence it checks the spec set
against delivered work and files gap tickets for under-delivery or drift. It
never touches code or active work.

## The Skills

- `workflow-setup`: create repo workflow config or refresh it against current
  repo and tracker state.
- `workflow-decompose`: turn a spec, PRD, or epic ticket into dependency-ordered
  one-PR `kind-slice` tickets, adopt hand-created tickets, apply the body
  contract and labels, and emit a dependency graph and file footprint.
- `workflow-issue-triage`: update current tracker labels, kinds, readiness, stale
  verified states, orphans, body shape, and dependencies so Todo tickets are
  clean and agent-ready. It follows the repo-configured label treatment policy,
  skips backlog unless asked, and asks or lists exact human next actions when
  something is unclear.
- `workflow-agent-orchestrator`: run the work loop, dispatching startable
  `kind-slice` tickets and calling review and integrate as steps, without
  becoming the coder or reviewer.
- `workflow-agent-implement`: take one startable issue through implementation,
  checks, review, and PR creation.
- `workflow-code-review`: bug-focused review for branches, PRs, working trees,
  and main drift.
- `workflow-secret-redaction`: redact, diff, schema-check, and summarize `.env`,
  credential, token, and secret command output.
- `workflow-create-pr`: run checks, confirm review, commit, push, create or
  update the PR, and hand off tracker state to Orchestrator.
- `workflow-agent-review`: independent PR review and main-drift review from
  clean context.

## Recommended Flow

1. Run `workflow-setup` once per repo, and rerun it when the workflow config may
   be stale.
2. Run `workflow-decompose` on a spec, PRD, or epic ticket to create the
   `kind-slice` tickets and dependency graph. Re-run it any time to reconcile the
   tickets with the plan.
3. Run `workflow-issue-triage` before the first orchestration run and whenever
   Todo or active tracker state needs repair. Ask explicitly when you want
   backlog review or intake backfill.
4. Run `workflow-agent-orchestrator` to run the loop: dispatch, review,
   integrate, repeat until the backlog is delivered or blocked.
5. Use `workflow-create-pr` directly only when you are already on a branch and
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
- kind labels, the concurrency cap, stuck-worker timeout, required-checks-for-
  merge, auto-merge risk tiers, and friction-log ticket are set when running the
  autonomous loop
- `workflow-decompose`, `workflow-agent-orchestrator`, `workflow-agent-implement`,
  `workflow-code-review`, and `workflow-create-pr` can run without guessing repo
  conventions

## Validate This Repo

```sh
pnpm ci:check
```
