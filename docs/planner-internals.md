# Planner internals

Maintainer notes for the published planner scripts. Runtime callers use
`skills/ziw-orchestrate/references/planner-input.md`; these implementation details
do not add caller obligations or authority.

## Coverage and review evidence

`diffCoverage` in `skills/ziw-orchestrate/scripts/workflow-contract.mjs` compares
fingerprints only within the same format, such as `patch-id:` or `sha256:`.
Different or missing formats fall back to the exact reviewed head. Without
comparable fingerprints or both heads, it returns `null`.

`evidenceForPr`, `reviewCoversPr`, and `reviewRequestForPr` in `tick-plan.mjs`
apply that rule to local evidence, provider reviews, and pending requests.
Reviewed heads come from `reviewedHeadSha`, `hostedReviewHeadSha`, request
`headSha`/`reviewHeadSha`, or a provider review's commit. When coverage cannot
be compared, completed first-party evidence also requires the caller's explicit
`reviewEvidenceCurrent` boolean. Fingerprint equality alone creates neither a
verdict nor an independent review. `hasCompletedIndependentReview` requires a
clean verdict and positive count or list; callers must filter and attribute
that list because the planner cannot verify it independently.

`livePrFacts` overlays current head, state, draft flag, labels, check result,
threads, review decision, truncation, and fingerprint onto saved evidence.
Known labels also replace saved label-presence flags. `reviewContextForPr`
applies this overlay to hosted and local records, preventing old evidence from
vouching for newer checks or diffs.

`prDisposition` orders empty-diff, thread, conflict, base-drift, and check gates
before independent review. Known scope mismatch routes fixes before review or
readiness. Missing review emits `request-review`; a matching pending request
emits `REVIEW_IN_FLIGHT`. Clean current review on a draft emits `mark-ready`
with `REVIEW_CLEAN`. Drafts never merge or receive the human-merge label.
Hosted review and merge routing follow readiness. A non-draft PR with prior
clean local review and incomplete required hosted review lets the hosted
reviewer cover follow-up changes.

Requests use the current fingerprint as their idempotency key, falling back to
the head. `previousReviewHeadForPr` supplies `deltaFrom` when prior clean or
blocking evidence covers a different diff. `currentReviewStatus` and
`mergeEligibilityDecision` apply local verdict blockers only when their evidence
covers the current diff. A current-head conformance `FAIL` still blocks.
Truncated review threads hold merge and the human-merge label.

## Collector fingerprints

`tick-snapshot.mjs` pins GitHub's `<base>...<headSha>` compare diff to the observed
head before `patchIdForEndpoint` runs `git patch-id --verbatim`. This emits
`patch-id:<hex>` and prevents a concurrent push from attaching a newer diff's
fingerprint to older reviews. Base merges preserving hunks and context preserve
the fingerprint.

When that diff is unavailable, `reviewDiffFingerprint` hashes sorted file
records and the head SHA as `sha256:<hex>`. The head prevents incomplete file
records from reusing evidence across commits. `pullRequestFiles` verifies the
reported file count; footprints include old filenames for renames.

`latestReviewByAuthor` emits `authorType` only for `User` and `Bot`. It ignores
human comments as verdicts and keeps each bot's latest review of any state.
Historical human approvals and configured hosted bots use the same
base-to-reviewed-commit lookup. Failed historical lookups omit the fingerprint.
Repeatable `--hosted-review-bot` flags configure those bot lookups.

## Hosted bot matching

In `tick-plan.mjs`, `hostedReviewBots` defaults to `["coderabbitai"]` when
`hostedReviewProvider` normalizes to CodeRabbit. Matching ignores case and a
trailing `[bot]`. `hostedReviewForPr` derives completion only for a configured
login with `authorType: "Bot"`, state `COMMENTED` or `APPROVED`, and current diff
coverage. Dismissed, pending, and other states do not complete review. Explicit
`state.hostedReviewByPr` fields override derived completion, including `skipped`.

`evidenceForPr` derives independent evidence from current human approvals only
with `authorType: "User"`; configured bot logins, other bots, and unknown
authorship do not count as human approvals. `hostedReviewCountsAsEvidence` adds
one independent review for complete, unskipped, current hosted review.

`hostedReviewRequirement` requires review if any hosted/evidence record requires
it or the merged risk tier is configured. Tier rules default to `["high"]`;
an empty list disables only that tier rule. Risk uses the same merged PR,
hosted, and local state as merge readiness.

## Identity collection and lifecycle

`normalizePlannerModel` builds one tracker-backed issue catalog before delivery,
scope, dependency, risk, and action matching. Tracker records and dependencies
establish aliases; worker/PR assertions cannot manufacture them. Conflicts fail
with source paths. A known key and UUID resolve together; an unaliased UUID
remains exact rather than guessing a key.

`selectUnroutedIssueIds` in `linear-snapshot.mjs` reports missing route labels in
requested states, or provider `unstarted` work when states are unspecified.
Default warnings exclude intake and parked work. Metadata supplements identity
and risk without creating worker reservations.

`loadLinearSnapshot({ issueRefs })` bounds unknown-reference reads to 50.
`tick-snapshot.mjs` gathers receipt, scope, dependency, and PR references from
the shared state; terminal receipt history does not trigger lookups. A confirmed
`issue: null` preserves the snapshot with `REFERENCED_ISSUE_NOT_FOUND`. Transport,
GraphQL, or malformed-response failures abort with the referring source path.
Provider error text is omitted to avoid sensitive values.

`reconcileActiveDelivery` in `active-dispatches.mjs` separates delivery
reservations from live-session capacity. A terminal receipt for a confirmed
session can retire a sticky tracker-only slot without removing its reservation.
Current live observations still count; receipt-only history cannot retire a
tracker claim. `isLiveWorker` in `worker-lifecycle.mjs` recognizes explicit
terminal states; canonical running records cannot also assert return or stop.
The caller's slot, ledger, and manual-selection rules live in `dispatch-policy.md`.

## Input envelope and precedence

`tick-plan` accepts the snapshot directly or as
`{ "snapshot": {...}, "config": {...}, "state": {...} }`. Direct snapshot
fields may accompany inline config and state, but not a nested snapshot.

- `--config` overrides inline config; `--state` overrides inline state, which
  overrides legacy `queue`. Merges are shallow; supplied maps replace earlier maps.
- Each file must be a JSON object. Validation precedes merging, so overrides
  cannot hide invalid earlier inputs.
- `snapshot.repo` or `state.repo` must identify `owner/repo`; both must match when present.
- `-` reads stdin for one file.
- Unknown envelope, config, state, and review-evidence fields are errors.
  Provider records may retain extra metadata; only documented fields affect decisions.

## Record identity

Collectors and handoffs emit snapshot `v: 3` with array queue collections.

| Record                     | Identity                         | Associations                                                |
| -------------------------- | -------------------------------- | ----------------------------------------------------------- |
| Issue, metadata, startable | `issueKey`, `issueUuid`, or both | Confirmed claim `sessionId`/`receiptId` when known          |
| Worker receipt             | `receiptId` and/or `sessionId`   | Issue fields, `prNumber`, branch/path, footprint, lifecycle |
| PR                         | Positive integer `number`        | Issue fields or typed `linkedIssues`                        |
| Worktree                   | `path`                           | Branch, head, dirty/merged state, footprint                 |
| Preview                    | `previewId`                      | Optional `prNumber`, URL/path, lifecycle                    |

- Session, receipt, and preview IDs are opaque nonblank strings. A UUID-shaped
  session ID remains a session; the planner never infers issue identity from it.
- The validator rejects retired v3 issue fields `id`, `identifier`, `issueId`,
  `ticket`, and `key`. `issueRef` is resolved output, not producer input.
- `candidateIssues` selects candidates; `blockedBy` records dependencies, with
  optional provider `stateType` for satisfied blockers. Blockers outside
  candidate scope never become extra candidates. Metadata supplies aliases,
  labels, and risk without reserving workers.
- `candidateScope` retains route and requested states for rechecking combined
  evidence. `state.scopeIssues` narrows starts, PR actions, and review-label
  actions; other PRs keep collision reservations. Empty candidate or
  requested-scope arrays authorize no starts.
- The collector extracts exact Linear issue URLs from PR bodies into
  `linkedIssues`. Branch/path, title, and coincidental-number hints cannot
  grant PR authority.
- PR `footprint` lists changed paths plus previous filenames for renames;
  `changedFiles` is a count.
- PR evidence and request maps use positive PR-number keys, never heads,
  branches, URLs, or issue keys. `reviewEvidenceChecks` needs `prNumber` or a
  typed issue reference for its label target.
- The current diff is `reviewDiffFingerprint`, with alias
  `reviewRelevantDiffFingerprint`. Reviewed identity is `reviewedDiffFingerprint`,
  with alias `reviewedReviewDiffFingerprint`, plus `reviewedHeadSha`.
- Startable records name eligible workers in `eligibleWorkers`, with aliases
  `workerPaths`, `allowedWorkers`, or `workers`.

## Worker counting and selection

`reconcileActiveDelivery` in `active-dispatches.mjs` and
`dispatchSelectionDecision` in `workflow-contract.mjs` apply these rules, so callers follow the plan instead
of recounting:

- Workers group by confirmed session, receipt, or worker reference. Issue,
  branch, worktree, PR, and shared-commit matches never merge two workers.
  Receipts may be reused.
- Active tracker claims with a session or receipt occupy a slot. Started tracker
  work without one reserves delivery and files without inventing a session.
- Dirty, baseline-unmerged, or uncertain non-default worktrees become file
  reservations without inventing issue claims. Merged or PR-completed clean
  worktrees and the baseline branch are skipped.
- A PR matched only by branch/path or leading-title hints, or covering several
  issues, reserves possible delivery at least at `medium` risk.
- Selection orders candidates by unlock count, then priority. It defers
  candidates without headroom, without a footprint while active work or an
  earlier selection exists, or with an overlapping footprint.
- Routing resolves each candidate's eligible workers, falling back to
  `defaultWorkerPath`. Remote-eligible work routes remote. Local work defers at
  the soft or hard budget stop and past `localStartsBelowSoftLimit`. With budget
  limits configured, unknown worker kinds defer; without them, an unknown
  default path stays usable.
- Each deferral carries its reason, keeping startability, worker eligibility,
  and capacity or collision selection separately visible.

## Legacy v2 adapter

`adaptLegacyPlannerInput` in `legacy-planner-input.mjs` translates v2 and
unversioned identity, scope, dependencies, and receipts before consumers run.
`adaptExternalPlannerState` lets a separate legacy `--state` accompany a v3
snapshot; collector and planner adapt that same file at their boundaries.
Inline v3 state remains canonical and rejects retired fields. Canonical external
workers retain v3 lifecycle behavior even beside legacy records/maps.

`convertLegacyRecord` treats generic worker `id` as a receipt, never an issue
alias. Only this adapter treats `hasPr: true` as return evidence, and only
without explicit `running`, `active`, or `started` state.

Keep legacy parsing out of individual consumers. Remove the adapter only after
supported producers and downstream consumers use v3 and compatibility evaluation
proves no supported input depends on it. Remove its schema and migration tests
in the same change. New producers and handoffs always use v3.

## macOS credential storage

In `linear-graphql.mjs`, `setup` checks macOS support before reading credentials
or changing files. `readHiddenLine` suppresses terminal and readline echo;
failure to disable echo aborts before the prompt. EOF, interruption, or attempted
suspension cancels input and restores the terminal. Piped stdin is also accepted.

`replaceLinearApiKeyStore` encrypts a staged file, stores its decrypt key under a
unique Keychain account, then atomically replaces the credential file. Previous
accounts stay valid for rollback and readers holding an older snapshot.
`readStoredLinearApiKey` uses the account recorded in the file and still reads
unversioned stores. Non-macOS callers use project-provided `LINEAR_API_KEY`, a
`LINEAR_API_URL` proxy, or configured tracker tools.

## Maintaining the contract

Edit schema source in `scripts/planner-schema/`, then run:

```bash
pnpm generate:planner-contract
pnpm check
```

`pnpm check` rejects stale published schema and validator artifacts. Ajv
standalone generation lets installed skills validate without runtime Ajv or
code generation. Tests cover malformed inputs and copied-skill CLI use.
