# Issue Tracker Contract

Use when configuring `docs/agents/workflow/config.md` or shaping tracker issues.
Any repo-configured provider is supported. Ready slices must satisfy the body,
metadata, and suitability rules below.

## Default States

`Triage`, `Backlog`, `Todo`, `In Progress`, `Blocked`, `In Review`,
`Changes Requested`, `Ready to Merge`, `Done`, `Canceled`, `Duplicate`.

## Default Labels

Kind is separate from type. Set exactly one kind, clearing other `kind-*`
values even when the tracker permits several:

- `kind-spec`: spec or PRD prose; To Issues input.
- `kind-epic`: parent or workstream container.
- `kind-slice`: one-PR implementation ticket; the only executable kind.

Specs and epics must never be dispatched or marked `ready-for-agent`.

Other defaults:

- Readiness: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
- Risk: `risk-normal`, `risk-security-sensitive`, `risk-schema`, `risk-cross-cutting`.
- Type: `Bug`, `Feature`, `Improvement`, `Tech Debt`, `Spike`, `Hotfix`.
- Review evidence: exact configured slug or ID, such as `code-review-passed`.

## Agent-Ready Issue Body

`ready-for-agent` means no further human refinement is needed. Before applying
it, verify:

- One PR and one primary outcome, including needed code, tests, docs, config, fixtures, generated artifacts, and migration.
- A `kind-slice`, not a duplicate, container, or fragment defined below.
- Configured project, parent, or route; one kind; required type and risk labels.
- Estimate when required by config, using [Estimate Rules](#estimate-rules).
- Concrete boundaries and every required body field below.
- Enough evidence for Orchestrator to decide startability and dispatch.

Required body fields:

- Outcome.
- Context docs/tracker links, with spec citations for spec-derived work.
- Likely files, packages, or artifacts, normally under `## Likely files, packages, or artifacts`, one backticked path per bullet.
- In scope.
- Out of scope.
- Acceptance criteria.
- Required checks.
- Security, privacy, data, and operational invariants.
- Dependencies or blockers.
- Estimate when config stores it in the body.

Use a different footprint shape only when config names one.

### Boundaries and evidence

- `In scope` names only behavior, files, docs, tests, and workflow state the PR may change.
- `Out of scope` names adjacent outcomes, sibling IDs, optional polish, broad refactors, production actions, and follow-up behavior excluded from delivery.
- Vague or empty boundaries prevent readiness. Keep multi-PR work in a container or send it to [To Issues](../../ziw-to-issues/SKILL.md#plan-slices).
- Cite exact implemented spec, PRD, or ADR sections with resolvable anchors, such as `docs/specs/<file>.md#<section-anchor>`.
- Verify anchors resolve; missing or broken spec citations prevent readiness.
- Trace acceptance criteria to cited sections. Workers and reviewers read those sections, not the whole spec corpus.
- For unknowable required fields or boundaries, add the heading and exact question, apply `needs-info`, and keep non-ready.
- Exception: an unknowable required estimate gets `ready-for-human`.
- Map acceptance criteria one-for-one to evidence. Structural requirements name exact behavior and a regression test.
- Examples include "derive, do not copy", "fail closed", "no production-path assertion", "real driver path", and "env var reaches the test process".
- Put deploy prerequisites, runtime secrets, hosted gates, generated updates, and CI environment passthrough in criteria or required checks, not background notes.
- Record exact external literals or their config lookup in the body, not just comments.
- These include config values, resource IDs, provider names, label slugs, secret names, and environment values; never record secret values.

### Domain checks

- Auth, bootstrap, claim, invitation, one-use grant, custody, and ownership work needs authenticated actor binding and tenant/resource scope.
- State replay behavior, atomic consume/claim semantics, and concurrency checks before readiness.
- Custody, persistence, driver, and provider criteria must execute the real boundary; prose-only assertions or only a seam mock are insufficient.
- Use applicable multi-instance readback, concurrent first use, real driver queries, environment passthrough, or provider-shape checks.
- Dropping or narrowing schema on retained data requires explicit deploy order.
- When the platform validates existing rows, land pre-deploy cleanup first.
- Bulk migrations require a resumable batched runner, never one transaction.
- Name the production deploy status proving cleanup landed; a green preview is insufficient.

### Fragments

A fragment has no consumer or observable behavior in its PR: scaffold, a single
layer, verification step, or tests/docs for an unmerged sibling's behavior.

- It is not a fragment when its body records a split reason separating it from the sibling it serves.
- A dependency alone does not make a fragment when it has its own behavior.
- Work for already-shipped behavior stands alone.
- Route fragments to To Issues as merge candidates; only `ziw-to-issues` folds tickets using its [split reasons and merge test](../../ziw-to-issues/SKILL.md#split-reasons).
- Exception: a fragment left `needs-info` behind a partner that is claimed, active, or linked to an open PR waits on the human answer.
- Once the partner is Done, send it to To Issues to close as covered or reshape.

## Estimate Rules

- Config decides whether estimates exist, their field/label/body location, scale, requiredness, and agent authority.
- Create or repair estimates only within that authority; To Issues and Triage estimate slices, never infer an unconfigured scale or policy.
- Omit estimates when config defines none.
- A missing estimate blocks readiness only when config requires it for handoff.
- Exceeding the configured maximum requires splitting or human planning, never a larger invented value.
- Preserve human estimates unless config permits repair and scope evidence proves them stale or outside the scale.
- Estimate effort/size, never priority, risk, deadlines, or merge authority.

## Label Treatment Rules

Repo config owns readiness and worker environment policy. Use these defaults
only without a different verified mapping:

- Only To Issues intake or Triage applying the same contract may set readiness; other filing flows leave readiness labels off.
- Ready slices belong in the configured ready state, usually `Todo`, even when dependency-blocked.
- Blockers never remove readiness, ready state, or approved worker environment labels. Encode scheduling constraints separately.
- Linear `Backlog` is outside the agent queue for uncommitted, parked, or insufficiently shaped work.
- Triage scope, intake promotion, explicit Backlog review, and location-only repair follow [Issue Triage](../../ziw-triage/SKILL.md#build-and-freeze-the-issue-set).
- Startable work must be ready, unblocked, and satisfy the full body contract.
- Clear readiness on Done; exclude Done from readiness-attention queries unless explicitly auditing Done cleanup.

Worker routing:

- Issue-assigned work needs the configured worker environment label/field and repo-route label.
- A missing repo-route blocks delegation. Heal it only when tracker team maps unambiguously to one repo; otherwise use `needs-info`.
- For an explicitly chosen issue-assigned path, Orchestrator or Triage may apply environment metadata after verifying identity, repo route, and environment approval criteria.
- Worker environment labels convey routing/approval, not refinement, unblocked state, or permission to start.
- Record extra labels such as `remote-worker` or `remote-cursor` in config; they are not shared defaults.

State and review:

- Tracker state is authoritative; Triage owns configured intake promotion and evidenced stale-state repair. Orchestrator owns active workflow state unless the user says otherwise.
- For connected Linear/GitHub with both linked records, trust synced state; refresh both before manual repair, using approved scripts in Triage.
- Verify full issue scope before retaining integration-assigned Done. Reopen or narrow partial delivery per config.
- Apply review-evidence and human-merge labels only under [integrate-checklist.md](../../ziw-orchestrate/references/integrate-checklist.md#labels); use exact configured slugs/IDs.
- Human setup, credentials, product judgment, provider approval, customer input, and ADR decisions need `ready-for-human` or `needs-info`.
- Human-attention states mean only the named human action remains; fix agent-resolvable review findings before escalating.
- Encode the smallest direct dependency graph using tracker relationships when supported. By default, A needing B is blocked by B; B blocks A.

## Agent Suitability

Use task type and risk to judge implementation-agent suitability. Suitability
changes readiness, not slice boundaries; [To Issues](../../ziw-to-issues/SKILL.md#split-reasons)
owns slicing.

Good default agent work:

- Docs, tests, build/CI/lint updates.
- Small refactors with clear local checks.
- Scoped bugs with reproducers or acceptance checks.
- Isolated UI changes with screenshots, target states, or exact copy.

Default human-planning work:

- Auth, authorization, PII, secrets, payments, or destructive data.
- Production incidents or deploy decisions.
- Broad refactors or cross-repo changes.
- Deep domain behavior without clear acceptance.
- Performance work without a benchmark.
- Tasks centered on learning, design judgment, or product ambiguity.

External APIs, credentials, production access, or unclear domain behavior need
`needs-info` or `ready-for-human` unless verification is explicit enough for a worker.
Route unsettled security, product, data, or architecture decisions to human planning.

## Tracker Metadata Verification

Setup records query-safe metadata for the configured scope:

- Exact provider IDs, keys, or accepted display names.
- Tool status fields, such as `status`, `state`, or `statusType`.
- Blocker/dependency fields and routing/readiness labels.
- A read-only verification query returning the expected issue set.

Verify the provider ID or query-safe name before treating an empty response as
no work. Query the tracker directly rather than parsing local tool-result caches.
Test delegation fields, agents, and integrations through read-only metadata,
verified config, provider docs, or a user-approved test issue. Never mutate a
real implementation issue to probe support.

## Orphan Rules

Orphans belong in the workflow but lack project, team, parent, route, status,
body, or dependency metadata.

- Route only from direct issue, linked-doc, PR, branch, or configured repo evidence, within the acting role's evidence boundary.
- Leave ambiguous orphans in triage with `needs-info` or `ready-for-human`.
- Require correct routing, body, and labels before readiness; encode blockers separately.
- Never close or cancel merely for age.

## Creating Tracked Work From Docs

Use [To Issues](../../ziw-to-issues/SKILL.md) to extract explicit capabilities,
decisions, constraints, deferred work, and dependencies. It owns slicing and
consolidation. Group tickets by configured tracker location, milestone, and
parent/workstream; apply configured route, type, risk, area, and readiness labels.

Never invent product scope, risk levels, or label taxonomies. Never put secrets,
customer data, signed URLs, credentials, or private logs in tracker text.
