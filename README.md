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

## Claude Code Plugin

This repo also defines a Claude Code plugin manifest and root subagents:

```text
.claude-plugin/plugin.json
agents/*.md
```

When loaded as a Claude Code plugin, the workflow agents are available as
namespaced subagents:

```text
zaks-io-skills:workflow-triage
zaks-io-skills:workflow-implementer
zaks-io-skills:workflow-reviewer
```

Claude Code should keep the orchestrator in the main thread and delegate the
context-heavy pieces to these isolated subagents:

- `workflow-triage`: issue tracker inventory and metadata cleanup.
- `workflow-implementer`: one issue's implementation, checks, review, and PR
  handoff.
- `workflow-reviewer`: clean-context review of PRs, branches, ranges, and
  main-drift findings.

Setup, PR creation, code review details, and secret redaction remain workflow
skills that these subagents load only when needed.

Codex and other Agent Skills runtimes should use the same orchestration model
with native skill names:

```text
$workflow-agent-orchestrator ZAK-123 ZAK-456
$workflow-agent-orchestrator project "Payments" until clear
$workflow-agent-orchestrator backlog until clear
```

When the runtime supports subagents, sessions, branches, or worktrees,
Orchestrator should keep the parent thread small and delegate context-heavy work
to `$workflow-issue-triage`, `$workflow-agent-implement`,
`$workflow-agent-review`, and `$workflow-code-review`.

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

Orchestrate a bounded scope:

```text
$workflow-agent-orchestrator ZAK-123 ZAK-456
$workflow-agent-orchestrator label:ready-for-agent one pass
$workflow-agent-orchestrator project "Payments" until clear
$workflow-agent-orchestrator backlog until clear
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

Draft PRs are pre-review. If a PR is ready-for-review, it must be non-draft in
the code host.

`Code review passed` is a review-evidence label, not a ticket state. It means
the latest linked PR head SHA passed the configured code review gate. Agents
remove it when the PR head changes, blocking findings appear, the linked PR
changes, or evidence is stale.

By default, `ready-for-agent` means the ticket needs no further human refinement
before handoff to an implementation agent. Worker environment labels such as
`remote-cursor` mean the issue is approved for that configured environment. Those
labels are not dependency or scheduling gates.

Kind is a separate, single-select axis: `kind-spec` and `kind-epic` are
containers that decompose reads as input and are never dispatched; `kind-slice`
is a one-PR ticket and the only kind a worker runs.

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

Agent Orchestrator does whatever needs to happen to get tickets handled safely.
It can start local subagents in isolated branches or worktrees, assign a
tracker-exposed coding agent to a ticket, request another code review, rerun
checks, move clean draft PRs to ready-for-review, apply or remove
`Code review passed`, request CodeRabbit for risky or complex diffs, reply
directly to the original worker, mark tickets for human review or missing
information, or stop on a real blocker. The repo config records supported worker
delegation paths such as
`local-worktree`, `issue-assigned`, or both, plus only the project-specific
routing or direct-agent continuation details that are annoying to rediscover.

Decompose is the front door. It turns a spec, PRD, or epic ticket into
dependency-ordered `kind-slice` tickets, adopts any tickets you made by hand
instead of duplicating them, applies the body contract and labels, and emits a
dependency graph and predicted file footprint. Run it whenever you want the
tickets to match the plan; re-running converges.

Agent Orchestrator is the work loop. Each tick it refreshes external state,
reconciles its dispatch ledger, dispatches startable `kind-slice` tickets to
local or remote workers up to a concurrency cap, calls review and integrate as
steps, heals unambiguous tracker mistakes inline, and logs where it struggled to
a friction ticket with compact event entries and run rollups. It can also nudge
a worker, route feedback, mark tickets for human review, or stop on a real
blocker. Config records supported worker delegation paths such as
`local-worktree`, `issue-assigned`, or both.

A delegated worker, local or remote Cursor, owns implementation: it writes code,
self-reviews with `workflow-code-review`, and opens its own PR with
`workflow-create-pr`. The orchestrator coordinates; it does not write code or
open PRs.

Agent Review and integrate are steps the orchestrator calls, not loops. Agent
Review runs `workflow-code-review` from clean context and returns a verdict;
integrate is the auto-merge gate that defines green, rebases on moved main,
merges, and runs a post-merge check.

The research behind this operating model is captured in
[docs/agent-delivery-research.md](docs/agent-delivery-research.md). The short
version: keep one work loop, keep issues small and verifiable, measure outcomes,
and add agent or skill complexity only when it improves delivery.

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
- `workflow-agent-review`: independent PR review and main-drift review from
  clean context.
- `workflow-code-review`: helper review gate for branches, PRs, working trees,
  and main drift.
- `workflow-create-pr`: helper shipping gate that checks, reviews, commits,
  pushes, creates or updates the PR, and hands tracker state to Orchestrator.
- `workflow-secret-redaction`: helper for redacting, diffing, schema-checking,
  and summarizing `.env`, credential, token, and secret command output.

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
  merge, auto-merge risk tiers, friction-log ticket, and delivery metrics are
  set when running the autonomous loop
- `workflow-decompose`, `workflow-agent-orchestrator`, `workflow-agent-implement`,
  `workflow-code-review`, and `workflow-create-pr` can run without guessing repo
  conventions

## Validate This Repo

```sh
pnpm ci:check
```
