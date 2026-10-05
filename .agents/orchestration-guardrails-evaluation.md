# Orchestration guardrails evaluation

Date: 2026-10-05. Baseline: `34b002f90f9422600bece68e1c121c21775a82da`.
This is historical verification evidence, not project state or a workflow rule.

## Scope

Reproduced all ten defects from the external feedback against the shared source:
review fingerprint reuse without a completed review, cross-repository dispatch,
lost PR file paths, duplicate ticket delivery, lost started-work reservations,
echoed credential input, default-route budget bypass, shared-base worker
coalescing, unsupported-platform credential setup, and scalar/list PR evidence.
The defects predated the Debug and Architecture additions.

The source corrections preserve rename paths, repository and ticket-set scope,
live delivery identity, conservative review evidence, started-work reservations,
worker session identity, and default-route limits. Unsupported platforms fail
before credential mutations. Hidden input cancels safely, and failed credential
replacement preserves the previous file and Keychain pair. Old Keychain accounts
are retained for rollback and racing readers.

## Validation

- Node 24.21.0 and pnpm 10.19.0: full `pnpm ci:check` passed, including 319 tests,
  formatting, structural/schema checks, skill discovery, and the secret scan.
- Claude plugin validation passed with its existing warning that root
  `CLAUDE.md` does not ship as plugin context.
- Fake-provider snapshot-to-planner tests exercise changed paths, rename paths,
  routing, PR risk metadata, and file collisions. Terminal fixtures exercise
  hidden input, EOF, interruption, echo failure, atomic replacement failure,
  platform rejection, and directory permissions without real credentials.
- Entrypoints remain 24,167 estimated tokens across ten skills. Counts use
  tiktoken 0.14.0 with o200k_base; the instruction budget records reference costs.

## Review

Opus 5.5 high reviewed the uncommitted candidate in read-only Claude session
`3dc0094a-157b-4df8-82ef-1e0092bb6db9`. The first pass found route compatibility,
PR collection identity, reservation completion, risk metadata, unrouted queue,
and stale review/count gaps. These findings received corrections and regressions.
The same persistent session is used for the focused delta recheck.
Artifacts are task-local under `/tmp/skills-fix-bf237882-review/`; this is author
QA evidence, not a claim of a required PR-head review.

## Limits

No live Linear, complaint, or credential writes were used in fixtures. macOS
Keychain behavior was tested with a fake executable on Linux; actual macOS
Keychain integration still requires verification on a Mac. Prior credentials
were not deleted or revoked. The downstream refresh is generated from the
published source and stays in an open PR because downstream main triggers deploys.

## Done

The ten source defects have regression coverage and the full local gate passes.
Final review and independent delta evaluation outcomes are recorded below.

Independent GPT-6.1 Sol evaluation `/root/delta_behavior_eval` exercised three
raw offline fixtures without intended answers: a single-ticket PR handoff, an
idle tick with human-owned started work, and stale review evidence with an
explicit current boolean. All three produced safe scoped outcomes. The evaluator
loaded the entrypoint and the planner, dispatch, and integrate references.
Artifacts are in `/tmp/orchestrate-behavior-eval-3svcqY`.

The focused Opus recheck confirmed the prior corrections and identified two
fail-safe follow-ups: stale stored fingerprints hid a fresh current-head GitHub
approval, and default unrouted warnings included intake and parked work. Both
received narrow corrections and regressions, including preserved blocking flags
and explicit Backlog query behavior. The final full gate passed 319 tests.

The final narrow Opus pass resolved both follow-ups without new regressions. It
also identified an existing approval-path gap: a fresh GitHub approval could
overwrite a current internal revision verdict. The planner now preserves that
negative evidence, with regression cases for both published revision verdicts.
This final small addition received local review and affected planner tests.

## Identity follow-up

The updated external report reproduced two additional identity defects against
`ecbe488`: a `phase-2` branch prefix hid an existing `ZAK-12` PR, and review or
installation worktree names invented ticket IDs and duplicate reservations.
Both reproduced locally through the planner CLI before correction.

Canonical issue identity now comes from explicit fields, Linear issue links,
or a leading title key verified against known tracker or worker evidence.
Branch and path tokens match queried identities anywhere without inventing
identifiers. Identical paths deduplicate an unidentified worktree against its
ledger receipt; confirmed issue and session conflicts remain separate.
Unidentified work remains a worktree reservation with a truthful hold target.
Ambiguous branches retain a medium risk floor and high-risk labels still win.

The independent GPT-6.1 Sol evaluator `/root/identity_behavior_eval` received
only raw fixtures and the realistic queue/headroom requests. All three original
follow-up fixtures produced safe delivery and capacity outcomes. Artifacts and
loaded references are recorded at `/tmp/orchestrate-identity-eval-OfeCoA`.

Opus 5.5 high reviewed the focused identity delta in the existing persistent
session. It found unverified title tokens and ambiguous low-risk metadata could
cause related failures. Added regressions cover SHA-256, UTF-8, HTTP-2, PHASE-2,
returned-worker absorption, risk metadata, requested-ticket consistency,
low-only merge policy, and branch-only reservation targets. The focused recheck
is recorded in `/tmp/skills-fix-bf237882-review/identity-delta-result.json`.

The full local gate passes 337 tests. Entry point token counts are unchanged;
the dispatch reference count is refreshed with the original tokenizer.
These runs remain offline and make no live tracker, credential, or deploy writes.

The final Opus delta pass resolved the identity, ambiguous-risk, and hold-target
findings. It noted an additional conservative capacity regression for UUID-based
worker receipts. The final local correction preserves an original UUID when no
canonical key can be resolved; a capacity regression protects duplicate receipts.
The final full local gate passes 338 tests.

## UUID delivery follow-up

Baseline: `0153786588d1267fe283ab10150412fce446a4a1`. The external report's
UUID-linked worker fixture dispatched ZAK-12 despite a running receipt, and an
equivalent UUID-linked PR also allowed a duplicate. The earlier UUID regression
protected capacity only and missed delivery startability.

A dedicated identity helper now resolves UUID aliases from tracker records
before matching workers, PRs, risk metadata, and reservations. The Linear query,
normalization, and compact metadata preserve issue UUIDs. Unresolved dedicated
issue fields retain exact UUID identity; generic receipt IDs can identify sessions
and do not establish issue aliases. Explicit ticket and session conflicts remain
separate, while aliases of one issue coalesce and retain their footprints.

The full local gate passes 362 tests. New CLI coverage protects every supported
explicit UUID field for worker and PR duplicate guards, fresh-snapshot behavior,
returned-worker absorption, narrow PR scope, metadata risk, conflicts, generic
session IDs, and receipt reuse. Instruction entrypoints are unchanged; the
planner and dispatch reference token estimates use the original tokenizer.

The independent GPT-6.1 Sol evaluator `/root/uuid_behavior_eval` received only
raw worker/PR fixtures and a realistic queue request. Both held existing delivery
and proposed continuing the worker or existing draft PR. Four compact/debug runs
passed. Artifacts and loaded references are in the persistent project directory
`/home/p-skills/task-artifacts/skills-bf237882/uuid-behavior-eval`.

Opus 5.5 high reviewed this narrow delta in the existing persistent session
`3dc0094a-157b-4df8-82ef-1e0092bb6db9`. Its first pass caught generic receipt UUIDs
being mistaken for issue UUIDs and stale receipts causing alias contradictions.
Both received corrections and CLI regressions. Review artifacts and the focused
recheck are stored in `/home/p-skills/task-artifacts/skills-bf237882/`.

The final Opus recheck approved both review corrections, confirmed the 362-test
and secret-scan gate, and found no remaining failures within the focused scope.
These are offline source and fixture checks, not live tracker or provider writes.

## Mixed UUID and ticket-key follow-up

Baseline: `b6e82dea01178ddde07de1a545ff0e2d2868f120`. Both new external
fixtures reproduced duplicate starts through the actual planner CLI: a tracker
record omitted UUID `id`, while its worker or scoped PR supplied an unresolved
`issueId` UUID before an explicit `identifier` ticket key. The PR also vanished
from the requested action scope. Distinct file footprints exposed the identity
failure without collision protection masking it.

The helper now selects the first dedicated ticket key or tracker-resolved UUID
before falling back to an unresolved dedicated UUID. Generic receipt `id` stays
the final fallback. Tracker alias authority and precedence among resolved
explicit identities remain unchanged. New CLI regressions cover both delivery
sources and all later dedicated key fields; helper tests cover field order,
later resolved UUIDs, and conflicting known identities. These regressions
failed before the correction.

The full local gate passes 374 tests, formatting, structure/schema checks,
discovery, and Gitleaks. Claude plugin validation passes with its existing
root-context warning. Entrypoints are unchanged. The dispatch reference adds
15 estimated tokens using tiktoken 0.14.0 and o200k_base.

Independent GPT-6.1 Sol evaluator `/root/mixed_uuid_behavior_eval` received only
the raw fixtures and a realistic request to continue ZAK-12. Four compact/debug
CLI runs preserved both delivery holds, worker capacity, and the scoped draft
PR action. It proposed waiting for the existing worker or diagnosing the existing
draft. Its report records the pre-existing debug `nextAction` inconsistency;
the compact wake and concrete actions correctly continue draft repair.
Artifacts are in `/home/p-skills/task-artifacts/skills-bf237882/mixed-uuid/`.
All fixtures stayed offline without tracker, PR, credential, or deploy writes.

Fresh Opus 5.5 high session `e029a9f0-fd07-4ed0-9b3d-fcdbed99740d` reviewed
the focused working-tree delta. Its first pass found that promoting a generic
ticket-shaped receipt ID such as `dispatch-1` could hide an unresolved explicit
issue UUID. Generic IDs now remain the final fallback, with helper and worker/PR
CLI regressions that failed before this correction and pass afterward. Review
artifacts are in the same persistent `mixed-uuid` directory.

The focused Opus recheck approved the correction with no remaining behavioral
findings. Its documentation note about the test count is corrected above.

The same independent evaluator rechecked both generic-ID fixtures in compact
and debug modes and both original fixtures in compact mode after the correction.
All six runs preserved delivery holds, capacity, and scoped PR repair. The
recheck report is `mixed-uuid/behavior-recheck.md` in the artifact directory.
