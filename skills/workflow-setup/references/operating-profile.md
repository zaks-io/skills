# Operating Profile

Defaults and decision tables the orchestration loop reads so it acts without
re-deriving policy each tick. Downstream `docs/agents/workflow/config.md` is the
source of truth; the values here are defaults that config overrides. Setup
should resolve these into config, not leave the loop to guess them.

## Concurrency

- Default cap: **3** concurrent in-flight implementation workers. Config
  overrides with `Concurrency cap`.
- The cap counts active worker sessions, not tickets in the queue. Dispatch new
  work only up to `cap - in-flight`.
- For issue-assigned remote workers, the cap is the number of remote agent
  sessions running at once. Keep headroom under any provider limit so the loop
  does not starve other work sharing the same agent pool.

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

### Delegation Preflight

Delegate only when **all** hold. Otherwise hard-refuse and heal or escalate.

| Precondition                                    | Why                                 | If missing                                                                     |
| ----------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| `kind-slice`                                    | only slices are dispatchable        | refuse; containers are decompose input                                         |
| `ready-for-agent`                               | no human refinement needed          | refuse; route to triage/decompose                                              |
| worker environment label (e.g. `remote-cursor`) | environment approved                | apply if approval criteria met, else refuse                                    |
| repo-route label (e.g. `<org>/<repo>`)          | tells the agent which repo to clone | heal inline if team maps unambiguously to one repo; else escalate `needs-info` |
| unblocked                                       | safe to start                       | defer; never start blocked work                                                |
| complete agent-ready body                       | agent can verify                    | refuse; route to triage                                                        |
| no active claim, no open PR                     | not already in flight               | skip; advance the existing work instead                                        |
| in-flight workers < cap                         | concurrency                         | defer to a later tick                                                          |

The repo-route label is a hard precondition, not decoration. Without it the
agent cannot resolve the target repository and delegation is ambiguous.

## Merge Safety

One decision for "is this PR safe to advance and merge," so the loop does not
reconcile three separate descriptions at runtime. Risk tier comes from the PR /
issue risk labels and the change shape.

| Risk tier | Examples                                                                                                    | CodeRabbit                                | Merge authority                                               |
| --------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| LOW       | docs, tests, copy, isolated UI                                                                              | skip                                      | orchestrator may auto-merge when green                        |
| MEDIUM    | normal feature / business logic                                                                             | skip unless review is uncertain           | orchestrator may auto-merge when green                        |
| HIGH      | auth, secrets, payments, destructive data, schema/migration, queues/jobs, public contracts, broad refactors | required: run after local review is clean | human merge unless config grants the tier to the orchestrator |

"Green" is the configured merge-ready set: clean `workflow-agent-review` verdict,
required CI checks pass, no unresolved blocking review comments, PR non-draft and
ready-for-review, `Code review passed` current for the PR head, and required
CodeRabbit escalation complete or recorded as skipped by policy.

Rules that do not change with tier:

- A label is never permission to merge.
- Never merge a stale branch; rebase, rerun checks and review, then merge.
- Never merge or deploy production without explicit approval.
- Missing CodeRabbit auth, rate limits, or credits is a recorded skip unless the
  user explicitly required it.

## Resolving This Into Config

Setup should write these into `docs/agents/workflow/config.md` so the loop reads
values, not this file:

- `Concurrency cap` (default 3 if the repo has no preference)
- worker delegation paths and the configured agent user / delegate field
- the continuation rule: reply into the agent-session thread, not top-level
- the repo-route label family used for delegation
- auto-merge risk tiers the orchestrator may merge vs route to human merge
- required checks that define green
