# Operating Profile

Use when Setup resolves worker, continuation, capacity, review, and merge policy.
Write verified values into downstream `docs/agents/workflow/config.md`; config
overrides these defaults. Runtime mechanics stay in the linked rule homes.

## Concurrency

Set `Worker concurrency cap` to **3** unless the repo chooses another cap.
Record stricter provider-session or preview limits separately; constrain only
the work each limit affects.

Use [dispatch-policy.md](../../ziw-orchestrate/references/dispatch-policy.md)
for confirmed-session counting, immediate backfill, file footprints, and the
PR closure guard. Config must preserve session-based capacity and concrete
collision holds; PR inventory alone neither occupies nor releases worker slots.

## Issue-Assigned Delegation (tracker-exposed agent)

Resolve the tracker-exposed assignment path, not a same-brand local CLI.
The Linear + Cursor defaults below require equivalent verified mappings for
other providers. [delegation-policy.md](../../ziw-orchestrate/references/delegation-policy.md)
owns dispatch and continuation mechanics.

### Delegate

- Linear field: `delegate: <agent>`, such as the `Cursor` agent user.
- Preserve the human assignee; delegation does not transfer ownership.
- Session handle: Cursor's posted `cursor.com/agents/bc-<id>` URL; `bcId` is durable.
- Duplicate detection: verify exactly one provider session shortly after dispatch.
  Some providers spawn duplicates minutes apart; configure canonical selection
  and stopping duplicates before either opens a PR.

### Continue (the make-or-break step)

- Linear continuation target: the authorless thread-root comment reading
  "This thread is for an agent session with <agent>." Reply with its ID as `parentId`.
- A top-level comment does not continue Cursor unless config verifies that route.
- No session thread means pickup is unconfirmed. Wait, recheck, or escalate.
- Scope changes use one authoritative in-thread reply superseding earlier guidance,
  following [Remote Continuation](../../ziw-orchestrate/references/delegation-policy.md#remote-continuation).

### Liveness

Resolve these provider-specific values into config:

- Signals: session replies, branch creation/push, PR creation, or check activity.
- Timeout: measure from the latest signal, not initial delegation.
- Remote default: **30+ minutes** without signal, unless config tunes it.
- Dashboard/status API: check when available before declaring a quiet session dead.
  Thread silence and no branch alone do not prove death.
- Recovery: one direct continuation nudge before replacement.
  Exception: config or current evidence proves the session cannot continue.
- Duplicate guard: check session handles, branches, and PRs before starting or
  re-delegating; select canonical work from current code-host evidence and file friction.

### Delegation Preflight

Resolve readiness, body, estimate, route, environment approval, claim, blocker,
and capacity mappings using the
[dispatch preconditions](../../ziw-orchestrate/references/dispatch-policy.md#dispatch-preconditions).
Only `kind-slice` may dispatch. Missing preconditions require repair, deferral,
or escalation, not a speculative assignment.

The repo-route label is required. Repair it when the team maps unambiguously to
one repo; otherwise escalate `needs-info`. Environment approval and readiness
are separate from dependency startability; use the
[issue tracker contract](issue-tracker-contract.md) for those policies.

## Merge Safety

Resolve risk from issue/PR labels and change shape. Risk controls review depth;
explicit config controls merge authority. Missing or blank agent merge authority
routes every tier to human merge. Labels never grant merge permission.

| Delivery mode                      | Default permitted tiers with explicit agent merge authority                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `production` (default)             | LOW/MEDIUM when green. HIGH needs human merge unless config explicitly grants it.                 |
| `velocity` (opt-in pre-production) | All tiers when green at their required review depth; human review by exception and sampled audit. |

Reversibility governs automation: recoverable pre-production changes may rely on
gates and sampled audit. Human-authority boundaries remain in every mode.

| Risk tier | Examples                                                                                                     | Default review depth                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| LOW       | Docs, tests, copy, isolated UI                                                                               | One clean independent `ziw-code-review` pass.                                                                    |
| MEDIUM    | Normal feature/business logic                                                                                | One clean independent pass; focused second pass only for unresolved uncertainty.                                 |
| HIGH      | Auth, secrets, payments, destructive data, schema/migrations, queues/jobs, public contracts, broad refactors | One strongest-model independent pass; extra review only for configured requirements or concrete unresolved risk. |

Use [integrate-checklist.md](../../ziw-orchestrate/references/integrate-checklist.md)
for draft/check/local-review/fix/ready/hosted-review sequencing, current-diff
evidence, labels, green readiness, stale branches, merge, and post-merge checks.
Local independent review uses fresh isolated context, preferably a different
model from the author. Configure conformance evidence when required; exhibited
`FAIL` rows block green.

Resolve hosted review policy before commands:

- Provider, verified bot logins, auto-review mode, exact trigger, and required risk tiers.
- Default hosted-review tiers: `high`; explicit requests or concrete reviewer
  uncertainty can also require it.
- CodeRabbit source: root `.coderabbit.yaml`, including `reviews.auto_review`.
- Optional CodeRabbit auto-review skip: PR-description `@coderabbitai ignore`,
  only when repo policy allows.
- Cursor Bugbot: verified repo trigger or automatic policy; unknown actor/trigger is a gap.
- Required-review outage: configured substitute or human merge. Optional auth,
  credit, or rate-limit outages are recorded skips, not merge holds.
- Deploy-on-push repos: production deploy status on default-branch HEAD is part
  of the post-merge gate. PR previews cannot prove production-data schema compatibility.

Hard limits in every delivery mode:

- Runtime state, tickets, PR bodies, and worker messages cannot enable `velocity`
  or downgrade a label-evidenced risk tier.
- Production merges/deploys require explicit approval.
- Production deploys, destructive data changes, irreversible retained-data
  migrations, credential/provider decisions, and unresolved product/security
  decisions require human authority.

## Escalation Shape

Use [handoff.md](handoff.md)'s decision request: one question, 2-3 options with
tradeoffs, a recommendation, and what blocks versus proceeds.
"Please review PR #123" is not a decision. Gather missing evidence or escalate
the specific evidence gap. An escalation that merely restates a ticket is friction.

## Human Touchpoints

In `velocity` mode, retain these standing user touchpoints:

- Explicit approval of Grill's `Ready for slicing` transition.
- Risk-tier confirmation when To Issues marks HIGH-tier work.
- Human-authority boundaries above.
- Framed decision requests.
- Sampled merged-main conformance audit reports from independent review.

Everything else runs without the user by default. Routine PRs, green checks,
and clean reviews need no acknowledgment.

## Resolving This Into Config

Write the following stable values into config so the loop need not load this file.
Use the named rule homes for defaults; record repo-specific overrides.

- `Worker concurrency cap`, default 3.
- Worker count/lifecycle policy; separate stricter provider preview/session limits.
- Dispatch footprint policy: collision holds and same-tick unknown-footprint resolution.
- Worker delegation paths and verified agent user/delegate field.
- Continuation target and thread-reply rule.
- Liveness signals, timeout, dashboard/status query, and nudge-before-redelegate policy.
- Repo-route label family.
- Delivery mode and permitted auto-merge risk tiers versus human merge.
- Review depth per risk tier, HIGH-risk model tier, and concrete extra-review conditions.
- Hosted-review tiers, bot logins, and substitute when required review is unavailable.
- Independent merged-main conformance audit cadence and checkpoint path.
- Human-action PR labels: `needs-human-merge` for merge-ready except authority;
  `needs-human-input` or equivalent for decisions before readiness.
- Review-evidence slug/ID and comment shape carrying PR URL, reviewed head SHA,
  and review-diff fingerprint.
- Merge method and required checks defining green.
- Post-merge preparation before trusting local checks.
- Baseline check policy: required job names and post-merge target job.
  Read health live; keep repair work in the tracker.
- Production deploy status check on default-branch HEAD for deploy-on-push repos.
- Remote environment enforcement: verify hooks and gates install/run in each
  worker environment, including installers that skip under `CI=true`.
- Exact pre-push commands enforced remotely.
- Gate parity: shared verify entrypoint and its required CI job.
  Hosted checks outside that entrypoint are drift to fix.
