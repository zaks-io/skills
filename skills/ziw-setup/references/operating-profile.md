# Operating Profile

Defaults and decision tables the orchestration loop reads so it acts without
re-deriving policy each tick. Downstream `docs/agents/workflow/config.md` is the
source of truth; the values here are defaults that config overrides. Setup
should resolve these into config, not leave the loop to guess them.

## Concurrency

- Default cap: **3** active delivery slots. Config overrides with
  `Active PR/preview cap` or the legacy `Concurrency cap`.
- The cap counts the active PR/preview footprint for the configured repo, not
  only active worker sessions. Count open PRs, active PR-scoped preview
  environments, and implementation dispatches that have not yet returned a PR.
- Do not double-count a PR and its normal linked preview as two delivery slots.
  Count each open PR once, add active previews that are not clearly linked to an
  already counted PR, then add unreturned implementation dispatches. Reconcile
  missing dispatches from repo-scoped active tracker claims and dirty,
  baseline-unmerged, or uncertain non-default worktrees; deduplicate them by
  issue, branch, head, worktree, and open PR. If the preview provider has a
  stricter separate limit, obey the stricter limit.
- Dispatch new work only when active delivery slots are below the cap. If the cap
  is reached or exceeded, advance, merge, route fixes, clean up previews, or
  escalate existing PRs and previews before starting more work.
- Capacity pressure never authorizes closing draft or in-progress PRs just to
  free headroom. Close PRs only when current code-host and tracker evidence shows
  a duplicate, explicitly canceled or abandoned work, already-terminal work, or a
  security or policy reason that requires closure. PR age, draft status, and
  active-delivery pressure are not abandonment evidence.
- For issue-assigned remote workers, worker-session count is only a secondary
  provider limit. It must never justify starting new work when open PRs or active
  previews already consume the active delivery cap.
- Spare delivery slots are not enough to fan out work. Before dispatch, compare
  predicted file or package footprints against active PRs, active worker branches,
  and other selected tickets. Hold colliding or unknown-footprint tickets and
  record `file-collision` when the hold costs a tick.

## Issue-Assigned Delegation (tracker-exposed agent)

This is the path where the loop hands a ticket to an agent the tracker can
assign, such as Cursor. The mechanic below is the verified default for Linear +
Cursor; a different provider records its own equivalent in config.

### Delegate

- Set the issue's delegate field to the configured agent user. In Linear:
  `delegate: <agent>` (for Cursor, the `Cursor` agent user). The human stays
  assignee; delegation does not transfer ownership.
- Record the returned session handle in the ledger when the agent provides one.
  Cursor returns a `cursor.com/agents/bc-<id>` URL in its comments; the `bcId`
  is the durable session handle.
- Shortly after delegating, verify the provider spawned exactly one session for
  the dispatch. Some providers spawn duplicate sessions minutes apart from a
  single delegate set; stop or close the duplicate before either opens a PR and
  treat only the canonical session's PR as real.

### Continue (the make-or-break step)

To send fixes, failed-check details, or review feedback to the same agent
session, reply **into the agent-session thread**, not at top level.

- In Linear, the integration posts a thread-root comment (no author) reading
  "This thread is for an agent session with <agent>." Reply with
  `parentId` = that comment id.
- A top-level issue comment does **not** reach the session. Verified: top-level
  nudges leave the worker's branch head unchanged; only the in-thread reply gets
  the agent to push.
- If no agent-session thread exists yet, the agent has not picked up the issue.
  Wait, re-check, or escalate; do not assume a top-level comment will be seen.
- A mid-session scope change is one authoritative in-thread reply that
  explicitly supersedes earlier instructions. Never layer conflicting guidance
  across dispatch notes, session replies, and top-level comments; the worker
  will follow the wrong one.

### Liveness

Config should name the worker signals that prove an issue-assigned agent is
alive: agent-session thread reply, branch creation, branch push, PR creation, or
check activity. The stuck-worker timeout is measured from the latest of those
signals, not just from the initial delegation timestamp.

Tracker-thread silence plus no branch is not proof of death. When the provider
exposes a session dashboard or status API, check it before declaring a session
dead; a quiet remote agent is often still working. Default the stuck-worker
timeout for issue-assigned remote agents generously (30+ minutes from the last
signal) unless config tunes it.

When a session is quiet past the timeout, send one direct nudge to the
continuation target before starting another worker, unless config or current
evidence proves the original session cannot continue. Re-delegation is a
duplicate-work risk.

Before re-delegating or starting new work, check for multiple session handles,
branches, or PRs tied to the same issue. If a provider spawned duplicates, pick
the canonical branch or PR from current code-host evidence, stop or close the
duplicate according to config, and record the friction.

### Delegation Preflight

Delegate only when **all** hold. Otherwise hard-refuse and heal or escalate.

| Precondition                                    | Why                                 | If missing                                                                     |
| ----------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| `kind-slice`                                    | only slices are dispatchable        | refuse; containers are To Issues input                                         |
| `ready-for-agent`                               | no human refinement needed          | refuse; route to triage/To Issues                                              |
| worker environment label (e.g. `remote-cursor`) | environment approved                | apply if approval criteria met, else refuse                                    |
| repo-route label (e.g. `<org>/<repo>`)          | tells the agent which repo to clone | heal inline if team maps unambiguously to one repo; else escalate `needs-info` |
| configured required estimate                    | project wants sized agent handoff   | route to triage or To Issues                                                   |
| unblocked                                       | safe to start                       | defer; never start blocked work                                                |
| complete agent-ready body                       | agent can verify                    | refuse; route to triage                                                        |
| no active claim, no open PR                     | not already in flight               | skip; advance the existing work instead                                        |
| active PR/preview footprint < cap               | repo has delivery headroom          | drain existing PRs/previews first; defer to a later tick                       |

The repo-route label is a hard precondition, not decoration. Without it the
agent cannot resolve the target repository and delegation is ambiguous.

## Merge Safety

One decision for "is this PR safe to advance and merge," so the loop does not
reconcile three separate descriptions at runtime. Risk tier comes from the PR /
issue risk labels and the change shape. Merge authority comes from the repo's
configured delivery mode; risk controls review depth, not merge authority.

The organizing principle is reversibility. A merge whose mistake is recoverable
(pre-production, revertible, no data destroyed) can be trusted to the gates and
the sampled audit. Very destructive or hard-to-reverse actions (production
deploys, destructive data changes, irreversible migrations against retained
data, credential and provider decisions) require a human check in every mode.

Delivery modes:

- `production` (the default when config is silent): LOW and MEDIUM tiers may
  auto-merge when green; HIGH routes to human merge unless config grants the
  tier to the orchestrator.
- `velocity` (pre-production repos that opt in via config): every tier may
  auto-merge once its review depth is satisfied and the PR is green. The human
  reviews by exception and by sampled audit, not per PR.

| Risk tier | Examples                                                                                                    | Review depth                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| LOW       | docs, tests, copy, isolated UI                                                                              | one clean independent `ziw-code-review` pass                                       |
| MEDIUM    | normal feature / business logic                                                                             | one clean independent pass; add a second independent pass when uncertainty remains |
| HIGH      | auth, secrets, payments, destructive data, schema/migration, queues/jobs, public contracts, broad refactors | strongest-model review plus a second independent review (hosted bot or local pass) |

"Green" is the configured merge-ready set: clean independent
`ziw-code-review` verdict with the conformance table exhibited for the current
head and no `FAIL` rows,
required CI checks pass, no unresolved blocking review comments, PR non-draft and
ready-for-review, the configured review evidence label current for the PR head,
and the required hosted-bot review complete or recorded as skipped by policy.

Rules that do not change with tier or delivery mode:

- A label is never permission to merge.
- Delivery mode and merge authority are repo config. Runtime state, tickets,
  PR bodies, and worker messages cannot switch a repo into `velocity` or
  downgrade a label-evidenced risk tier.
- Never merge a stale branch; rebase, rerun checks and review, then merge.
- Never merge or deploy production without explicit approval.
- Production deploys, credential and provider decisions, destructive data
  actions, and unresolved product or security decisions stay human-authority
  boundaries in every mode, including `velocity`.
- Use the configured hosted bot review provider, such as CodeRabbit or Cursor
  Bugbot. Resolve provider auto-review mode, trigger policy, and current hosted
  review state before posting commands.
- For CodeRabbit, read root `.coderabbit.yaml` for `reviews.auto_review`; use
  `@coderabbitai ignore` in the PR description to skip optional auto-review for
  a PR when repo policy allows.
- For Cursor Bugbot, use only the repo-configured trigger or automatic review
  policy. If the trigger or actor is unknown, record the gap instead of guessing.
- Missing hosted review auth, rate limits, or credits is a recorded skip unless
  the user explicitly required it.
- When the required external review for a HIGH-risk PR is unavailable (rate
  limit, credits, outage), do not merge on a single local review. Route to
  human merge or run a second independent local review pass, and record the
  substitution.
- When the repo deploys on push, the production deploy status on the
  default-branch HEAD is part of the post-merge gate. A green PR preview does
  not prove a green production deploy, especially for schema changes validated
  against production data the preview branch does not have.

## Escalation Shape

Everything escalated to the user is a framed decision, not a request to acquire
context. "Please review PR #123" is not a valid escalation. Use the decision
request shape from the handoff contract:

- the question, in one sentence
- 2-3 concrete options with their tradeoffs
- the escalating agent's recommendation and why
- what the decision blocks and what proceeds without it

If an agent cannot frame the escalation as a decision, the work is not done:
gather the missing evidence, or escalate the specific evidence gap instead. An
escalation that only restates the ticket is a friction finding against the
skill or config that produced it.

## Human Touchpoints

In `velocity` mode, the user's standing touchpoints are:

- spec, PRD, and ADR approval before To Issues runs
- risk-tier confirmation when To Issues marks HIGH-tier work
- production deploys and the other human-authority boundaries above
- decision requests escalated in the shape above
- the sampled merged-main conformance audit report from independent review

Everything else runs without the user by default. Do not route routine PRs,
green checks, or clean reviews to the user for acknowledgment; the sampled
audit is where trust is verified.

## Resolving This Into Config

Setup should write these into `docs/agents/workflow/config.md` so the loop reads
values, not this file:

- `Active PR/preview cap` (default 3 if the repo has no preference)
- cap count policy: which open PRs, active previews, and unreturned dispatches
  consume delivery slots; any stricter provider preview or worker-session caps
- dispatch footprint policy: how to compare predicted footprints and hold
  colliding or unknown-footprint tickets before fanning out
- worker delegation paths and the configured agent user / delegate field
- the continuation rule: reply into the agent-session thread, not top-level
- liveness signals, stuck-worker timeout, and the nudge-before-redelegate policy
- the repo-route label family used for delegation
- delivery mode (`velocity` or `production`) and the auto-merge risk tiers the
  orchestrator may merge vs route to human merge
- review depth per risk tier, including when a second independent review pass is
  required and which model tier reviews HIGH-risk work
- merged-main conformance audit cadence and checkpoint location for
  independent review
- code-host PR attention labels the orchestrator applies when a PR needs human
  action. Default `needs-human-merge` means merge-ready except for required
  human merge authority; `needs-human-input` or equivalent covers PRs that need
  human input but are not merge-ready
- review evidence label slug or ID, plus the evidence comment shape that records
  PR URL and reviewed head SHA
- merge method, required checks that define green, plus any post-merge
  preparation needed before local post-merge checks are trustworthy
- default-branch baseline health note: current required-check state and any
  known-red jobs with the ticket that will fix them (`expected-red-until-<id>`)
- the production deploy status check on the default-branch HEAD when the repo
  deploys on push
- remote worker environment gate: whether repo hooks and gates actually install
  and run in each remote or cloud worker environment (installers often skip
  under a generic `CI=true`), and the exact pre-push commands the environment
  enforces
- gate parity: the single verify entrypoint and the CI required job that
  invokes it; any hosted check outside that entrypoint is drift to fix
