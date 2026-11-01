# Planner internals

Maintainer notes for the published planner scripts. Agents follow
`skills/ziw-orchestrate/SKILL.md`, which shows the few input fields they write;
the full input schema is `skills/ziw-orchestrate/references/planner-input.schema.json`.
These implementation details add no caller obligations or authority.

## Saved observations

`planner-state.mjs` initializes or updates local state through `state-observations.mjs`.
It validates canonical records, uses the existing legacy adapter when needed,
and binds the file to one repository. Worker observations match explicit session
or receipt IDs, retain known footprints, and reject conflicting identities or runs.
Review results must match the saved request's session, head, and fingerprint;
recording the result completes that request in the same write.
The recorder retains superseded worker runs and review identities to reject
old launch receipts as well as old results. It merges supported review-map
aliases before updating entries and stops on conflicts. Older pending reviews
can acquire a recovered session and head without launching a second review.
Before persisting legacy PR records, the adapter resolves evidence-map aliases
to PR numbers and removes temporary PR identity fields. Unknown, ambiguous, or
conflicting references stop the write.

Updates use an exclusive sibling lock and a flushed temporary file followed by
rename. Failed validation does not replace the previous file. Concurrent writers
fail rather than overwrite each other's records. A crash may leave a lock;
the operator must establish that its writer has ended before removing it.
Observations must come from current runtime evidence. The helper validates their
consistency, not their provenance. The worked caller contract is
[state-observations.md](../skills/ziw-orchestrate/references/state-observations.md).

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
