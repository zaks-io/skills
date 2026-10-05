# Planner input contract

Read this when assembling JSON for `scripts/tick-plan.mjs`. The complete field
and type contract is [planner-input.schema.json](planner-input.schema.json).
The planner validates every input before computing actions. Invalid input exits
with status 1, writes the field path and error to stderr, and emits no plan.

## Input files and precedence

Pass the output of `tick-snapshot.mjs` directly, or wrap it in an envelope:

```json
{
  "snapshot": {
    "v": 3,
    "repo": "owner/repo",
    "prs": [],
    "linear": { "issues": [] }
  },
  "config": {
    "workerConcurrencyCap": 3,
    "readyState": "Todo",
    "mergeAuthority": "human",
    "requireConformanceEvidence": true
  },
  "state": {}
}
```

The empty collections above are illustrative. Populate them from current
provider evidence; never replace an unavailable query with an empty collection.

```bash
node <skill-dir>/scripts/tick-snapshot.mjs --repo <owner/repo> \
  --linear-team <KEY|UUID|NAME> --state <state.json> > <snapshot.json>
node <skill-dir>/scripts/tick-plan.mjs <snapshot.json> \
  --config <config.json> --state <state.json>
```

- `--config` overrides matching inline `config` fields.
- `--state` overrides matching inline `state` fields. The legacy `queue`
  object has lower precedence than both.
- Merges are shallow. A supplied map replaces the earlier map in full.
- Direct snapshot fields may accompany inline config/state. Do not also supply
  a nested `snapshot`; that would make the evidence source ambiguous.
- `snapshot.repo` or `state.repo` must identify `owner/repo`. When both exist,
  they must match.
- `-` reads stdin for one file. `--pretty` formats the plan; `--debug` includes
  full decision evidence. Missing option values and unknown flags are errors.

Each file must contain a JSON object. Validation runs before merging, so an
override cannot hide invalid earlier input. Empty files, `null`, and arrays at
the document root are errors.

## Policy and evidence

Derive config values from verified `docs/agents/workflow/config.md` settings.
The Markdown file is not a JSON input. Include only keys the planner consumes;
the schema lists those keys and their supported aliases. Unknown config,
envelope, state, and review-evidence fields are errors. Provider records such as
PRs, issues, and worktrees may retain additional metadata; only their documented
fields affect decisions.

| Repo setting                 | JSON field                                                 | Accepted value                                              |
| ---------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| Worker concurrency cap       | `workerConcurrencyCap`                                     | Integer at least 0                                          |
| Ready state                  | `readyState`                                               | Tracker state name                                          |
| Merge authority              | `mergeAuthority`                                           | Configured authority, such as `human` or `agent`            |
| Delivery mode                | `deliveryMode`                                             | `production` or `velocity`                                  |
| Auto-merge risk tiers        | `autoMergeRiskTiers`                                       | Tier or array of `low`, `medium`, `high`                    |
| Required independent reviews | `requiredIndependentReviews`                               | Positive integer or object keyed by risk tier               |
| Require conformance evidence | `requireConformanceEvidence`                               | Boolean                                                     |
| Local budget stops           | `localBudgetSoftStopPercent`, `localBudgetHardStopPercent` | Both supplied, between 0 and 100, soft no greater than hard |

Omitted optional policy fields retain the workflow helpers' existing defaults,
except merge authority: an omitted or blank `mergeAuthority` routes every
merge-ready PR to human merge. Always pass it from config.
Validation never inserts defaults, removes fields, or converts types. Write
`false`, not `"false"`, and `3`, not `"3"`. Empty label strings remain supported
where the workflow uses them to disable a label. Policy enums use lowercase.

## Role-specific identity

New producers emit `v: 3` on the snapshot. Queue collections are arrays.
Identity fields describe one record type; their spelling never determines a
different type of identity.

| Record                    | Identity                         | Associations and evidence                                                                        |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| Tracker issue or metadata | `issueKey`, `issueUuid`, or both | Tracker aliases plus optional confirmed claim `sessionId`/`receiptId`                            |
| Explicit startable ticket | `issueKey`, `issueUuid`, or both | Dispatch footprint and worker eligibility; caller verifies readiness                             |
| Worker receipt            | `receiptId` and/or `sessionId`   | Optional `issueKey`/`issueUuid`, `prNumber`, branch/worktree, footprint, and lifecycle           |
| PR                        | Positive integer `number`        | Optional direct issue fields and `linkedIssues` typed references; current head and changed paths |
| Worktree                  | `path`                           | Branch, head, dirty/merged observations, and footprint; no issue identity inferred from text     |
| Preview                   | `previewId`                      | Optional `prNumber`, URL/path, and lifecycle                                                     |

`issueKey` is a tracker key such as `SKI-12`; `issueUuid` is a UUID. Receipt,
session, and preview IDs are opaque nonblank strings. A UUID-shaped `sessionId`
remains a session. Never put an issue reference in generic `id`, `identifier`,
`issueId`, `ticket`, or `key` fields in v3. Those retired fields are rejected.
The internal resolved `issueRef` is planner output, not a producer input field.

Dependencies and scopes use typed references:

```json
{
  "snapshot": {
    "v": 3,
    "repo": "owner/repo",
    "prs": [{ "number": 12, "linkedIssues": [{ "issueKey": "SKI-12" }] }],
    "linear": {
      "issues": [
        {
          "issueKey": "SKI-12",
          "issueUuid": "11111111-2222-4333-8444-555555555555",
          "blockedBy": [{ "issueKey": "SKI-11", "stateType": "completed" }]
        }
      ],
      "candidateIssues": [{ "issueKey": "SKI-12" }]
    }
  },
  "state": { "scopeIssues": [{ "issueKey": "SKI-12" }] }
}
```

`candidateIssues` separates candidates from blocker records. `candidateScope`
retains the route label and requested states; the planner rechecks these after
combining evidence. `state.scopeIssues` further narrows explicitly requested
tickets, startable tickets, PR actions, and review-evidence label actions.
Other PRs retain collision reservations. An empty candidate or requested-scope
array authorizes no starts. Omit requested scope only when the user requested a
queue. Keep request state in transient input, never Repo Config.

`blockedBy` is an array of typed references with optional provider `stateType`
for satisfied blockers. A blocker outside candidate scope remains a dependency,
not another dispatch candidate. Metadata retains issue keys, UUIDs, and labels
for matching and risk without creating worker reservations. `unroutedIssueIds`
reports missing route labels in requested states, or provider `unstarted` work
when no states were requested. Default warnings exclude intake and parked work.

The planner constructs one issue catalog before matching delivery, scope,
dependencies, risk, and action targets. Tracker records and their dependency
references establish aliases; worker or PR assertions do not manufacture them.
Explicit conflicts fail at the source path before any plan is emitted. A known
key and its tracker UUID resolve to the same issue. A UUID without a known alias
stays an exact UUID identity rather than guessing a key.

Branch/path tokens and leading ticket titles can reserve possible delivery and
raise risk. They do not grant scoped PR-action authority. Use explicit issue
fields or `linkedIssues` for that authority. `tick-snapshot.mjs` extracts exact
Linear issue URLs from PR bodies into `linkedIssues` and omits full bodies from
compact output. A coincidental number in text does not identify an issue.

## Worker lifecycle and unresolved references

Delivery protection and capacity are separate. Either session covering an issue
prevents a new delivery; two distinct live sessions still occupy two slots.
Deduplicate receipts for the same confirmed session, or the same receipt when
no session is available. Issue, branch, path, shared commit, or associated PR
cannot establish that two workers are one session.

A live worker needs `sessionId` or `receiptId`. Its `prNumber` associates work
with a PR and does not end the session. Record returned/stopped/failed lifecycle
from the worker provider. In v3, `hasPr: true` is association evidence and does
not free a slot. An actively repairing worker keeps its slot even when that PR
is open. `returned` or `stopped` contradicting an explicit running state is an
input error. Only the legacy adapter treats `hasPr` as return evidence, and
only when the record has no explicit live status. PR `footprint`
includes actual changed paths and previous filenames for renames;
`changedFiles` remains a count. Started tracker work reserves files without
inventing a session.

A terminal provider receipt for the same explicit session retires a sticky
tracker-only claim's slot while preserving its delivery and footprint
reservation. A current live runtime observation keeps the session counted;
historical terminal receipts cannot override it without freshness evidence.
Receipt-only terminal history cannot retire a tracker claim because receipts
may be reused.

Inspect planner diagnostics before dispatching. `ISSUE_ALIAS_REQUIRED` asks for
tracker alias evidence, `REQUESTED_ISSUE_UNKNOWN` asks for the requested tracker
record, and `WORKER_ISSUE_UNRESOLVED` identifies an unassociated live worker.
`snapshot.linear.identityDiagnostics` preserves a missing lookup as
`REFERENCED_ISSUE_NOT_FOUND`, with its typed issue reference and referring state
or PR path. These are incomplete evidence, not an empty or completed queue.

Resolve missing references with one bounded read-only lookup and one replan
for the current evidence. `loadLinearSnapshot({ issueRefs })` accepts typed
references, looks up at most 50 unknown references, and adds their identity/risk
metadata without expanding candidates. Supply the same transient `--state`
file to snapshot collection and planning, using either `--state <file>` or
`--state=<file>`. The collector automatically resolves
references from live worker receipts, requested scope, dependencies, and PR links;
terminal receipt history does not trigger lookups. Agents do not enumerate those
IDs again. Repeatable `--linear-issue-key` and
`--linear-issue-uuid` flags add optional references when needed. If a reference
is missing or contradictory after that lookup, retain the diagnostic
and request the concrete missing evidence. Do not spin on alternate ID fields
or cache lookup outcomes in Repo Config. A confirmed missing record, returned as
`issue: null`, preserves the snapshot with a blocking diagnostic. Transport,
GraphQL, or malformed-response failures abort collection with the referring
source path; they never masquerade as missing records. Provider error text is
omitted because it may contain sensitive values.

## Review evidence and legacy boundary

V3 PR evidence/request maps use positive PR-number keys. Head SHA, branch, URL,
and issue key are evidence or associations, not interchangeable map keys.
`reviewEvidenceChecks` needs `prNumber` or a typed issue reference for an
addressable label target. Keep verdicts, fingerprints, review counts, and
conformance tied to current provider evidence. Valid JSON proves neither
currency nor mutation authority.

Version 2 and unversioned input remain supported through one boundary adapter.
It translates documented legacy identity, scope, dependency, and receipt fields
before any consumer runs. During migration, a separate legacy `--state` file
can accompany a v3 snapshot: collector and planner validate/adapt that same file
at the boundary. Inline v3 state must already be canonical; its retired fields
remain errors. Legacy generic worker `id` is a receipt identity,
never an issue alias. New producers and handoffs always use v3. Remove the
adapter only after supported producers and downstream consumers use v3 and
compatibility evaluation proves no supported input depends on legacy fields;
remove the legacy schema and migration tests in that same change. Do not add
legacy parsing to individual planner consumers.

Reusing an equivalent fingerprint requires an explicit clean `reviewVerdict`
and a positive `independentReviewCount` or completed `independentReviews` list.
Callers filter the list to completed independent reviewers and record identity;
the planner cannot independently verify a first-party numeric count or list.
Fingerprint equality cannot create a verdict or a review. Record reviewed
identity in `reviewedDiffFingerprint` or `reviewedReviewDiffFingerprint`;
`reviewRelevantDiffFingerprint` identifies the current diff. A freshly observed
GitHub approval on the current head provides its own completed review evidence.

## Local credential setup

`linear-graphql.mjs setup` requires macOS and checks support before reading input
or changing files. Interactive input suppresses terminal and readline echo;
failure to hide input aborts before the prompt. EOF, interruption, or a suspension
attempt cancels input and restores the terminal. Piped stdin is also accepted.
Setup encrypts into a temporary file, stores its decrypt key under a unique
Keychain account, and atomically replaces the credential file. Previous accounts
remain valid for rollback and readers holding an older file snapshot. The file
records its account; existing unversioned stores remain readable. Linux workers
use `LINEAR_API_KEY` through project tooling or the configured tracker tools.

## Maintaining the contract

Schema source lives in this repository's `scripts/planner-schema/`. Regenerate
the published schema and validator after changes:

```bash
pnpm generate:planner-contract
pnpm check
```

`pnpm check` rejects stale generated artifacts. The published validator uses
[Ajv standalone generation](https://ajv.js.org/standalone.html), so copied skills
validate inputs without an Ajv install or runtime code generation. Tests exercise
both malformed inputs and the copied skill's CLI.
