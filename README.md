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
- whether tickets should carry estimates, and which field or scale to use
- who can move tickets
- how remote issue-assigned workers are delegated
- what local, development, preview, and production mean for this repo
- when a human has to approve something

## Install

Prerequisites:

- Node 24 and `pnpm@10.19.0`
- `gitleaks` for `pnpm security:secrets` and `pnpm ci:check`
- `gh` for downstream fanout PR creation with `--pr`

Install all skills into the current project for all supported agents:

```sh
npx skills add zaks-io/skills --all -y
```

This is the default mode for repos whose remote or cloud workers must get the
workflow skills from a fresh clone. Commit the generated project skill
directories and `skills-lock.json` as a mechanical dependency update.

Refresh project-installed skills:

```sh
npx skills update -p -y
```

From this source repo, discover downstream consumers before updating them:

```sh
pnpm skills:downstream
```

Open mechanical project-skill refresh PRs across downstream repos:

```sh
pnpm skills:downstream:update
```

The update command creates a temporary `git worktree` for each target, commits
generated changes on a deterministic daily update branch, pushes the branch, and
opens or reuses the GitHub PR. The PR body includes `@coderabbitai ignore` so
CodeRabbit does not spend review quota on the mechanical refresh.

Worktrees branch from `main` by default, with `origin/main` as a fallback, so a
dirty source checkout does not block the safe worktree flow and is not used as
the update base. Changed apply-only worktrees are kept for inspection;
committed, pushed, PR-created, and unchanged worktrees are removed unless
`--keep-worktree` is passed. Use `--base-ref <ref>` to choose another base and
`--worktree-root <path>` to choose the scratch location. Use `--in-place` only
when you intentionally want to mutate the target checkout directly.

Create local update commits after checks:

```sh
node scripts/update-downstream-skills.mjs --apply --check --trust-check-commands --commit
```

`--check` runs the target repo's configured full local gate from
`docs/agents/workflow/config.md` with shell behavior. Use it only for downstream
repos whose workflow config you trust, and pass `--trust-check-commands` to make
that explicit.

Push branches and open PRs when you want the full fanout:

```sh
pnpm skills:downstream:update --check --trust-check-commands
```

Install all skills globally for one local user:

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

## Distribution

Use the narrowest distribution mode that still reaches the agents that work the
repo:

- Project skills: commit `.agents/skills`, `.claude/skills`, `.codex/skills`, or
  the target agent's project skill path when repo or cloud workers need the
  skills from a fresh clone. Treat these as vendored generated dependencies from
  `zaks-io/skills`; update them through `npx skills update -p -y` and commit the
  lockfile and generated diff.
- Plugins or marketplaces: prefer these for clients that support versioned
  cross-project distribution, especially Claude Code plugin users. This repo
  already includes `.claude-plugin/plugin.json` for that path.
- Global/user installs: use for personal local convenience only. They do not
  configure remote workers or teammates who clone a downstream repo.

Do not hand-edit downstream generated `ziw-*` skill copies. Change the source in
this repo, run the configured updater in each target repo, and keep the update PR
mechanical.

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
  ranges, main-drift findings, and orchestrator refactor candidates. An explicit
  PR `--submit` mode publishes the local verdict and inline findings to GitHub.

Setup, PR creation, and code review details remain workflow skills that these
subagents load only when needed.

Codex and other Agent Skills runtimes should use the same orchestration model
with native skill names:

```text
$ziw-orchestrate ZAK-123 ZAK-456
$ziw-orchestrate project "Payments" until clear
$ziw-orchestrate Linear Backlog until clear
```

`Linear Backlog until clear` first triages the Linear `Backlog` state. It only
implements tickets promoted into the ready queue; uncommitted, parked, or badly
shaped Linear Backlog tickets stay out of the delivery scope with a clear next
owner.

When the runtime supports subagents, sessions, branches, or worktrees,
Orchestrator should keep the parent thread small and delegate context-heavy work
to `$ziw-triage`, `$ziw-implement`,
and `$ziw-code-review`.

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
$ziw-orchestrate Linear Backlog until clear
```

Linear `Backlog` is not the agent work queue. The Linear Backlog form means
"triage this parked tracker state, promote only correct ready work, and leave the
rest with a truthful parked, human, To Issues, duplicate, or out-of-scope
outcome." The set Orchestrator is trying to implement is the delivery scope.

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

The configured review evidence label, such as `code-review-passed`, is not a
ticket state. It means the latest linked PR head SHA passed the configured code
review gate. Agents resolve it by exact configured slug or ID and remove it when
the PR head changes, blocking findings appear, the linked PR changes, or evidence
is stale.

The configured code-host human-merge PR label, such as `needs-human-merge`,
means the PR is ready to merge except for required human merge authority. Agents
apply it only after current clean code review evidence, passing required checks,
a non-draft PR, complete or policy-skipped hosted review, matching issue scope,
and no unresolved blocking review thread; they clear it when any of those facts
changes.

By default, `ready-for-agent` means the ticket needs no further human refinement
before handoff to an implementation agent. Worker environment labels such as
`remote-cursor` mean the issue is approved for that configured environment. Those
labels are not dependency or scheduling gates. When a ticket moves to `Done`,
Orchestrator or verified stale-state triage removes `ready-for-agent`.
Readiness-label queries exclude `Done` by default so stale labels on terminal
tickets do not keep growing the active queue.

Friction intake is separate from delivery work. Repo config says whether agents
write friction as comments on a parked ticket, as ticket-per-finding intake in a
private tracker team or project, or nowhere. Agent-created friction tickets
start outside the work queue, usually in `Inbox` or `Triage`, and a configured
review loop such as a daily automation dedupes them, closes noise, and opens PRs
for concrete skill or config improvements.

Kind is a separate, single-select axis: `kind-spec` and `kind-epic` are
containers that To Issues reads as input and are never dispatched; `kind-slice`
is a one-PR ticket and the only kind a worker runs. Multi-PR work should stay
under a container and be split into separate slices so a first linked PR cannot
falsely close the whole scope.

Every ready `kind-slice` needs a hard boundary: one primary outcome, concrete
`in scope`, and concrete `out of scope`. The out-of-scope field should name
adjacent tickets, optional polish, broad refactors, production actions, and
follow-up behavior the worker must not deliver. If that boundary is unclear,
the ticket is not ready for agent handoff.

Agent suitability is based on work type and risk, not agent brand. Docs, tests,
build or CI updates, small refactors, scoped bugs, and isolated UI changes are
good default agent work. Auth, PII, secrets, payments, production, destructive
data, broad refactors, cross-repo changes, unclear domain behavior, and
performance work without benchmarks require human planning first.

Issue Triage grooms the configured ready state, usually `Todo`, plus configured
intake, usually `Triage`, into a clean handoff queue for Orchestrator. The
snapshot also includes direct blockers of those tickets so the dependency graph
stays correct without reading unrelated parked work. It runs the configured
workflow scripts, inspects their output, and fixes tickets: labels, kind,
readiness, body shape, estimates when configured, dependency relationships,
stale readiness, and exact next owners. It does not review unrelated Linear
`Backlog` or Duplicate tickets unless asked. Linear `Backlog` means work you do
not want agents working yet: uncommitted ideas, intentionally parked scope, or
tickets that are not shaped correctly. Dependency blockers should be encoded
separately, not used to remove readiness or park ready work in Linear Backlog.

Triage is not exploration. It should not manually inspect code, GitHub, CI,
deploys, logs, alerts, or repo health outside the approved workflow scripts.
Tracker/MCP tools are for specific ticket reads and mutations, not for
rediscovering queue state. Agent Orchestrator owns active delivery, PR/check
state, worker starts, reviews, integration, and completion.

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
ready-for-review, apply or remove the configured review evidence label, request
configured hosted bot review such as CodeRabbit or Cursor Bugbot for risky or
complex diffs, reply directly to the original worker, mark tickets for human
review or missing information, or stop on a real blocker. The repo config
records supported worker delegation paths such as `local-worktree`,
`issue-assigned`, or both, plus only the project-specific routing or
direct-agent continuation details that are annoying to rediscover. For hosted
bot review, the repo config records the provider, auto-review state, trigger
policy, and exact command policy. CodeRabbit can use root `.coderabbit.yaml` and
`@coderabbitai ignore`; Cursor Bugbot is an alternative provider and must use
the repo-configured trigger or automatic review policy.

When you hand Orchestrator a large ticket set that has already been triaged or
verified as ready to implement, that set is the delivery scope. Routine
misunderstandings about when to apply a label, move a status, attach review
evidence, set repo-route metadata, or mark a PR ready-for-review are
orchestration repairs. It should fix those from tracker, PR, check, and config
evidence and keep going instead of escalating them.

To Issues is the front door. It turns a spec, PRD, or epic ticket into
dependency-ordered `kind-slice` tickets, adopts any tickets you made by hand
instead of duplicating them, applies the body contract, labels, and configured
estimates, and emits a dependency graph and predicted file footprint. Run it
whenever you want the tickets to match the plan; re-running converges.

Agent Orchestrator is the work loop. It is self-scheduling: it runs on the
runtime's own recurring mechanism (a schedule, `/loop`, or wake-up timer in
Claude Code; Codex automations, either cron automations or heartbeat
automations) and never needs a human to re-trigger a pass. Each tick it wakes
light, refreshes external state, reconciles its dispatch ledger, drains existing
open PRs and active previews first without closing draft or in-progress PRs just
to make room, dispatches startable `kind-slice` tickets only when the active
PR/preview cap has headroom (default 3), calls review and integrate as steps,
reasons over the available evidence, and logs where it struggled to a friction
intake sink with compact event entries and run rollups. It can also nudge a worker,
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
verdict; integrate is the auto-merge gate that defines green, updates moved
GitHub PR branches with `gh pr update-branch <pr>`, delegates only merge
conflicts, merges with the configured method, and runs a post-merge check.
Worker and PR local gates must match configured CI scopes, thresholds, cache
policy, generated-artifact checks, and secret-scan range.

The research behind this operating model is captured in
[docs/agent-delivery-research.md](docs/agent-delivery-research.md). The short
version: keep one work loop, keep issues small and verifiable, measure outcomes,
and add agent or skill complexity only when it improves delivery.

## The Skills

The public skill surface and trim rationale are tracked in
[docs/skill-portfolio.md](docs/skill-portfolio.md). Provider-specific workflow
glue should stay under `.agents/` unless it proves portable.

- `ziw-setup`: create repo workflow config or refresh it against current
  repo and tracker state.
- `ziw-to-issues`: turn a spec, PRD, or epic ticket into dependency-ordered
  one-PR `kind-slice` tickets, adopt hand-created tickets, apply the body
  contract with explicit non-goals, labels, and configured estimates, and emit a
  dependency graph and file footprint.
- `ziw-triage`: update current tracker labels, kinds, readiness, stale
  verified states, orphans, body shape, estimates when configured, and
  dependencies so Todo tickets are clean and agent-ready. It follows the
  repo-configured label treatment policy, skips Linear Backlog unless asked, and
  asks or lists exact human next actions when something is unclear.
- `ziw-orchestrate`: run the script-backed work loop, dispatching startable
  `kind-slice` tickets and calling review and integrate as steps, without
  becoming the coder or reviewer.
- `ziw-implement`: take one startable issue through implementation,
  checks, review, and PR creation.
- `ziw-code-review`: shared review gate for branches, PRs, and explicit
  working trees, plus independent latest-committed PR review, checkpointed
  main-drift review, review-debt issue filing, and explicit current-head GitHub
  review submission from clean context.
- `ziw-pr`: helper shipping gate that checks, reviews, commits,
  pushes, creates or updates the PR, and hands tracker state to Orchestrator.

## Recommended Flow

Review a PR entirely locally and publish the result as a GitHub review:

```text
$ziw-code-review https://github.com/owner/repo/pull/123 --submit
```

Without `--submit`, PR review remains read-only.

1. Run `ziw-setup` once per repo, and rerun it when the workflow config may
   be stale.
2. Run `ziw-to-issues` on a spec, PRD, or epic ticket to create the
   `kind-slice` tickets and dependency graph. Re-run it any time to reconcile the
   tickets with the plan.
3. Run `ziw-triage` before the first orchestration run and whenever
   Todo or active tracker state needs repair. Ask explicitly when you want Linear
   Linear Backlog review or intake backfill.
4. Run `ziw-orchestrate` to run the loop: dispatch, review,
   integrate, repeat until the delivery scope is delivered or completely
   blocked. A completely blocked loop stops instead of rescheduling itself.
5. Use `ziw-pr` directly only when you are already on a branch and
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
  friction intake, and delivery metrics are set when running the autonomous loop
- `ziw-to-issues`, `ziw-orchestrate`, `ziw-implement`,
  `ziw-code-review`, and `ziw-pr` can run without guessing repo
  conventions

## Validate This Repo

```sh
pnpm ci:check
```
