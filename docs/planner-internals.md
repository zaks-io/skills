# Planner internals

Maintainer notes for the published planner scripts. Agents follow
`skills/ziw-orchestrate/SKILL.md`, which shows the few input fields they write;
the full input schema is `skills/ziw-orchestrate/references/planner-input.schema.json`.
These implementation details add no caller obligations or authority.

## Saved observations

`planner-state.mjs` initializes or updates local state through `state-observations.mjs`.
It validates v3 records and binds the file to one repository. Worker observations
match explicit session or receipt IDs, retain known footprints, and reject
conflicting identities or runs. Review results match the saved request's identity,
head, and fingerprint; recording the result completes the request in the same
write. The recorder retains superseded worker runs and review identities.
Old state files cross the explicit migration boundary described below.

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
`headSha`, or a provider review's commit. When coverage cannot
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
covers the current diff. Migrated conformance failures become blocking local review verdicts.
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

## Migration

State files use `v: 3`. Snapshots regenerate each tick and never migrate. Run the
`planner-state.mjs migrate` command printed by a retired-format error once.
Migration classifies top-level fields and individual worker records against the
frozen `beb146d` canonical schema before translating their fields. Canonical
records use consumer semantics; legacy records use adapter semantics. Conflicting
aliases stop conversion with their JSON paths. Run and review history survives.

Saved PR records, hosted records, and evidence for one PR combine into one review
state (`tick-plan.mjs:275`), where `beb146d` read each alias only after its
canonical field from any layer. An alias therefore converts only when every
layer that sets that field agrees; otherwise migration refuses. Live collection
supplies none of these fields. False `codeRabbit*` aliases drop instead, because
`beb146d` only ORed them into the hosted flags. A hosted or evidence
`hostedReviewedDiffFingerprint` without the canonical field refuses: `beb146d`
spread a live hosted bot review's fingerprint before those records
(`tick-plan.mjs:211`), so the alias applied only without one, and v3 has no
slot below live facts. On a saved PR record the hosted layer still outranks it,
so it converts. An unrecognized or null verdict in the highest layer that sets
one refuses when a lower layer holds a real verdict: `beb146d` let it hide that
verdict, and v3 drops unrecognized verdicts, which would expose it.

The table cites `beb146d` lines, not moving line numbers. Paths below are relative
to `skills/ziw-orchestrate/scripts/`, except schema paths under `scripts/`.
"Caller" means handwritten state, imported evidence, or an observation supplied
by an agent. The recorder only produces the documented canonical observation
fields; accepting a field in the old schema did not mean the recorder wrote it.

| Field or shape                                                                                                                                 | Location and producer                                                                        | Consumer and baseline meaning                                                                                                                  | v3 disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Snapshot `v: 1`, `v: 2`, missing `v`                                                                                                           | Snapshot/envelope; old collectors and callers                                                | `planner-model.mjs:51` selects the legacy adapter                                                                                              | Reject; regenerate snapshot. Never migrate snapshots.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Unversioned state, `v: 1/2` state envelope                                                                                                     | State file; callers, old recorder                                                            | `planner-state.mjs:63`, `planner-input.mjs:65`, `tick-snapshot.mjs:66` adapt external state                                                    | Convert once; add `v: 3`; reject newer versions with refresh instructions.                                                                                                                                                                                                                                                                                                                                                                                               |
| Legacy schema branch and noncanonical definitions                                                                                              | `scripts/planner-schema/input.mjs:243`, `records.mjs:95`; schema generator                   | Input validator, collector, recorder, planner                                                                                                  | Remove from consumer schema; frozen schemas serve migration classification only.                                                                                                                                                                                                                                                                                                                                                                                         |
| `scopeIssueIds`                                                                                                                                | State; caller                                                                                | `legacy-planner-input.mjs:198` parses issue references                                                                                         | Convert to typed `scopeIssues`; conflicts refuse.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `id`, `identifier`, `issueId`, `ticket`, `key`, issue URL                                                                                      | Tracker/state issue; provider/caller                                                         | `legacy-planner-input.mjs:46` recognizes key/UUID/Linear URL; `planner-model.mjs:70` builds tracker aliases                                    | Legacy: convert to `issueKey`/`issueUuid`; conflicts refuse. Old canonical schema rejects these identity aliases, selecting legacy classification; no guessing from worker IDs.                                                                                                                                                                                                                                                                                          |
| Worker `id`                                                                                                                                    | State worker; legacy caller                                                                  | `legacy-planner-input.mjs:124` treats it as receipt, never issue                                                                               | Legacy: `receiptId`, with conflict check. Canonical `id` is rejected by old canonical schema.                                                                                                                                                                                                                                                                                                                                                                            |
| `session`, `workerSession`, `agentSession`                                                                                                     | Worker/issue state; caller                                                                   | `legacy-planner-input.mjs:108,125` selects session; canonical `planner-model.mjs:123` reads only `sessionId`                                   | Legacy: `sessionId`; canonical unknown session aliases drop. Conflicting legacy identities refuse.                                                                                                                                                                                                                                                                                                                                                                       |
| `prId`, `prNumber`, PR `id`, URL, numeric string                                                                                               | PR, worker, preview, evidence checks; caller/provider                                        | `legacy-planner-input.mjs:33,128,131,156,203` resolves numeric PR identity                                                                     | Convert to PR `number`, worker/preview/check `prNumber`; remove temporary PR receipt/session fields. Conflicting references refuse.                                                                                                                                                                                                                                                                                                                                      |
| `legacyPrAliases`, PR-map keys using SHA/branch/URL                                                                                            | PR and state maps; adapter synthesizes aliases at `legacy-planner-input.mjs:140`; caller     | `review-observations.mjs:18` maps aliases against saved PRs                                                                                    | Resolve to numeric map keys, then drop temporary aliases; unknown/ambiguous aliases refuse. The old canonical PR schema forbids `legacyPrAliases`; legacy conversion replaces caller-supplied aliases with its synthesized `id` alias (`legacy-planner-input.mjs:140`). Preserve only that effective alias until resolving map keys.                                                                                                                                     |
| `fileFootprint`, `files`, `paths`, `packages`                                                                                                  | Issue/worker/PR/worktree; caller                                                             | `planner-model.mjs:8`, `linear-dag-start.mjs:69`, `workflow-contract.mjs:794` union paths; adapter `legacy-planner-input.mjs:72` does the same | Merge into `footprint` in both classes; contradictory alias/canonical values refuse. Keep legitimate provider file records only inside collection.                                                                                                                                                                                                                                                                                                                       |
| `blockers`, `dependsOn`, `dependencies`, scalar/wrapped `blockedBy`                                                                            | Legacy tracker/state issue; caller/provider                                                  | `legacy-planner-input.mjs:86` unions and types dependencies                                                                                    | Convert to typed `blockedBy`; preserve dependency state type. Canonical issues already forbid these aliases.                                                                                                                                                                                                                                                                                                                                                             |
| `claimed`, `delegated`                                                                                                                         | Issue; caller                                                                                | `planner-model.mjs:90` ORs them into `activeClaim` for both classes; legacy adapter also reads `assignedWorker` and session aliases at `:101`  | Merge into `activeClaim`; canonical `assignedWorker`/session aliases have no effect and drop. Contradictory explicit flags refuse.                                                                                                                                                                                                                                                                                                                                       |
| `hasPr`                                                                                                                                        | Worker; caller                                                                               | Legacy adapter `legacy-planner-input.mjs:118` means returned unless explicitly live; canonical `worker-lifecycle.mjs:16` ignores it            | Legacy: materialize return evidence; canonical: drop without changing lifecycle.                                                                                                                                                                                                                                                                                                                                                                                         |
| `ledgerDispatches`, `workers`, `activeWork`                                                                                                    | State lists; caller, legacy imports                                                          | `active-dispatches.mjs:116` combines in order dispatches, ledgerDispatches, workers, activeWork                                                | Merge into `dispatches` in that order; preserve explicit source or materialize `ledger`, `worker-observation`, `local-active-work`.                                                                                                                                                                                                                                                                                                                                      |
| `reviewEvidence`, `reviewRequestByPr`                                                                                                          | State; caller/imports                                                                        | `tick-plan.mjs:130,305` canonical-first map fallback; recorder `review-observations.mjs:68` merges aliases and refuses conflicts               | Rename to `reviewEvidenceByPr`, `reviewRequestsByPr`; caller-dependent mixed maps refuse instead of selecting one.                                                                                                                                                                                                                                                                                                                                                       |
| `reviewedReviewDiffFingerprint`                                                                                                                | Evidence; caller and synthesized GitHub approval at `tick-plan.mjs:158`                      | `tick-plan.mjs:133`, `workflow-contract.mjs:69` fallback for reviewed fingerprint                                                              | Rename `reviewedDiffFingerprint`; fix synthesized producer simultaneously. Request copies drop because request coverage (`tick-plan.mjs:307`) never read them.                                                                                                                                                                                                                                                                                                           |
| `currentReviewDiffFingerprint`, `reviewRelevantDiffFingerprint`                                                                                | Evidence/PR/request; caller and `tick-plan.mjs:265` live overlay                             | `workflow-contract.mjs:62`, `tick-plan.mjs:194,307` current/request fingerprint fallbacks                                                      | Evidence-check current aliases become `reviewDiffFingerprint`; a PR's `reviewRelevantDiffFingerprint` moves to `reviewDiffByPr`, which v3 reads after live and saved PR fingerprints, as `beb146d` read the fallback, and later duplicate PR records overwrite it, null included; saved local/hosted current aliases drop because the live overlay replaces them. Request current aliases are unused and drop. Conflicts refuse; producer emits one current fingerprint. |
| Request `reviewedDiffFingerprint`, `reviewHeadSha`                                                                                             | Saved request; caller                                                                        | `tick-plan.mjs:307` falls back to these for pending coverage                                                                                   | Rename to `reviewDiffFingerprint`, `headSha`; conflicts refuse.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `codeReviewVerdict`                                                                                                                            | Evidence/PR/check; caller                                                                    | `workflow-contract.mjs:340,366,545` reads it for local review; `reviewEvidenceDecision` at `:275` does not                                     | Local evidence/PR: `reviewVerdict`. Evidence-check-only alias has no effect and drops; ambiguous mixed usage refuses.                                                                                                                                                                                                                                                                                                                                                    |
| Local verdict spellings `approved`, `ready for pr`, `ready to merge`, `ready_to_merge`, `do not merge`                                         | Evidence/PR/check; caller; GitHub synthesis emits `Ready to Merge` at `tick-plan.mjs:159`    | `workflow-contract.mjs:20,21,545` classifies clean/revision                                                                                    | Convert to `APPROVE`/`NEEDS REVISION`; unknown verdicts have no effect in `beb146d` and drop, unless one hid a lower layer's verdict, which refuses; producer uses `APPROVE`.                                                                                                                                                                                                                                                                                            |
| `hostedReviewedDiffFingerprint`                                                                                                                | Hosted/local evidence; caller                                                                | `workflow-contract.mjs:93` hosted coverage fallback                                                                                            | On saved PRs, rename `hostedReviewDiffFingerprint`. On hosted/evidence records without the canonical field, refuse: a live bot review outranked it. Conflicts refuse.                                                                                                                                                                                                                                                                                                    |
| `independentReviews` count/list/bool                                                                                                           | Evidence; caller                                                                             | `workflow-contract.mjs:358,368,564` counts entries, numeric value, or boolean                                                                  | Convert to integer `independentReviewCount`; conflicting counts refuse.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `codeRabbitRequired`, `codeRabbitComplete`, `codeRabbitSkipped`                                                                                | Hosted/local evidence; caller                                                                | `workflow-contract.mjs:415` ORs with hosted flags; `tick-plan.mjs:237` collects requirements                                                   | Rename hosted flags; false aliases drop. Conflicts and disagreeing layers refuse. Keep provider identity `CodeRabbit`.                                                                                                                                                                                                                                                                                                                                                   |
| `autoReview`, `reviewProvider`, `provider`                                                                                                     | Hosted evidence; caller                                                                      | `workflow-contract.mjs:1055,1070` provider/mode fallbacks                                                                                      | Rename `autoReviewMode`, `hostedReviewProvider`; conflicts refuse.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `requiredChecksGreen`, `checksPassing`, `checksGreen`, `ciGreen`                                                                               | Evidence/PR; caller                                                                          | `workflow-contract.mjs:379` checks fallback; `tick-plan.mjs:260` overlays live result                                                          | Rename `requiredChecksPassed` in evidence checks; drop saved PR/local copies overridden by live checks.                                                                                                                                                                                                                                                                                                                                                                  |
| `tier`, `diffMatchesScope`                                                                                                                     | Evidence/PR; caller                                                                          | `workflow-contract.mjs:513,439` risk and scope fallback                                                                                        | Rename `riskTier`, `scopeMatches`; conflicts and disagreeing layers refuse.                                                                                                                                                                                                                                                                                                                                                                                              |
| `humanReviewPrLabel`, label-presence flag aliases, `pullRequestLabels`, evidence-label aliases                                                 | Evidence/PR/check; caller and live overlay                                                   | `workflow-contract.mjs:275,344,447` label fallback/union; `tick-plan.mjs:240` replaces saved live labels                                       | Rename human-merge labels/flags and `pullRequestLabels`. Only evidence checks consume `evidenceLabel`; local/hosted label-evidence aliases are overridden by `evidenceForPr` (`tick-plan.mjs:164`) and drop. Conflicting aliases refuse. Config policy aliases remain separate.                                                                                                                                                                                          |
| `unlockCount` / `downstreamCount`, `priority` / `objectiveRank`                                                                                | Startable tickets; caller; `tick-plan.mjs:624` synthesizes `unlockCount`                     | `workflow-contract.mjs:864,870` dispatch ordering fallback                                                                                     | Keep `unlockCount`, `priority`; convert consumer-only aliases and refuse conflicts.                                                                                                                                                                                                                                                                                                                                                                                      |
| `headRefOid`, `currentPrHeadSha`, `draft`, `draftState`, worktree `worktree`                                                                   | PR/worktree; provider/caller and adapter                                                     | `planner-model.mjs:154` overlays PR head/draft/open; `legacy-planner-input.mjs:149` resolves worktree path                                     | Normalize saved head aliases, draft booleans, and worktree paths to headSha/isDraft/path. Keep draftState as provider state and retain branch/base fields. Conflicts refuse.                                                                                                                                                                                                                                                                                             |
| `conformance`, `conformanceVerdict`, `conformanceHeadSha`                                                                                      | Evidence/PR; caller                                                                          | `workflow-contract.mjs:589,652` blocks/holds; skill formerly deleted fields                                                                    | PASS: drop. FAIL/FAILED/UNVERIFIABLE: blocking `NEEDS REVISION` at conformanceHeadSha or reviewedHeadSha; missing head refuses. Consolidate blocking evidence in `reviewEvidenceByPr` so PR/hosted/local overlays cannot erase it; contradictory blocking heads refuse. Review verdict now carries conformance.                                                                                                                                                          |
| `requireConformanceEvidence`, `verify-conformance`                                                                                             | Config/caller; planner action at `tick-plan.mjs:524`                                         | `workflow-contract.mjs:652`; old skill action                                                                                                  | Retire with explicit config error; remove action. This is the intentional policy change.                                                                                                                                                                                                                                                                                                                                                                                 |
| GitHub `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, `DISMISSED`, authorType, commitSha; unresolvedThreads, checks, reviewDecision             | Snapshot/provider collection; `tick-snapshot.mjs:209,363`                                    | `tick-plan.mjs:112,143,213,240,372` reads live provider facts                                                                                  | Keep legitimate provider output; do not apply local verdict normalization to provider review states.                                                                                                                                                                                                                                                                                                                                                                     |
| Canonical `sessionId`, `receiptId`, `runId`, `previousRunIds`, `previousRequests`                                                              | State/observation; recorder `state-observations.mjs:46`, `review-observations.mjs:96,151`    | Recorder rejects superseded/conflicting identities; planner uses session/receipt                                                               | Keep exactly; no invented identities and no history loss. Observation patches validate separately from state-file envelope.                                                                                                                                                                                                                                                                                                                                              |
| Anonymous live legacy workers                                                                                                                  | State worker with neither session nor receipt; manual legacy caller (not the typed recorder) | `planner-model.mjs:128` synthesizes observation identity; `active-dispatches.mjs:141` consumes capacity                                        | **Refused**; preserving would require invented identity or change capacity/wait target. `test/state-migration.test.mjs` covers aggregate refusal and unchanged bytes.                                                                                                                                                                                                                                                                                                    |
| Branch-only worktree without a path                                                                                                            | State/caller; the collector always supplies `path`                                           | `legacy-planner-input.mjs:149` accepts a branch; `active-dispatches.mjs:206` keeps its file reservation                                        | **Refused**; no faithful path can be invented or reservation dropped. `unrepresentable worktree and preview entries refuse together with their context` in `test/state-migration.test.mjs` covers every path and unchanged bytes.                                                                                                                                                                                                                                        |
| Legacy worktree with an issue reference                                                                                                        | State worktree carrying `issueId`/`identifier`/`issueKey` or a UUID                          | `legacy-planner-input.mjs:149` resolves the reference; `active-dispatches.mjs:189` reserves that ticket                                        | **Refused**; v3 worktrees link tickets only by branch name, so dropping the reference would free the ticket. Session and receipt IDs on worktrees are dropped because `beb146d` reset them on reservations. `a legacy worktree that reserves a ticket by issue reference is refused, not freed` in `test/state-migration.test.mjs`.                                                                                                                                      |
| Preview without `previewId`, `id`, URL, or path                                                                                                | State/caller                                                                                 | `legacy-planner-input.mjs:153` cannot establish preview identity; preview capacity is computed in `workflow-contract.mjs:703`                  | **Refused**; no invented preview identity or dropped capacity. The same aggregate worktree/preview test covers refusal.                                                                                                                                                                                                                                                                                                                                                  |
| Other unrepresentable legacy records, including identity-only PR references without a resolvable number or blocking conformance without a head | State/caller                                                                                 | Legacy adapter/consumer can reserve work or gate review without enough canonical identity                                                      | **Refused** with every offending path and issue/branch/footprint metadata. Recover runtime identity and add it, or confirm work/review ended and delete the entry. `test/state-migration.test.mjs` covers refusal; no state/backup is written.                                                                                                                                                                                                                           |

Migration never edits or deletes a refused entry. The original bytes and backup
remain untouched. Operators recover the runtime identity and add it, or confirm
the work/review ended and delete the entry themselves. These edge cases are not
normal recorder output: `state-observations.mjs:51` requires runtime identity.

Only refused classes are exempt from decision parity. The baseline oracle is
26 captured outputs from the real `beb146d` scripts, with original fixture inputs
committed in `test/fixtures/planner-parity`. To recapture, create a detached
clean `beb146d` review worktree, run `node scripts/capture-planner-parity.mjs <worktree>`
and `pnpm format`, then remove the worktree. A recapture should change no fixture content. The ordinary suite needs no old checkout or network. `node scripts/verify-planner-live.mjs` checks, against this repo's live GitHub and Linear data, that `tick.mjs` matches the separate snapshot and plan commands. New planner actions, waits, and holds must match after
migration, apart from the deliberate conformance policy and action enrichment.

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
