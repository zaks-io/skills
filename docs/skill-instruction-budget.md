# Skill instruction budget

Measured: 2026-10-05. Baseline: `23d958d6297e2908cdd17f2f2a3a99c0a0f7e4b4`.

Identity contract comparison: `baf37e74fbaa8f132137dacdf93981431945bf57`.
The redesign adds 101 entrypoint tokens across ten skills. Its detailed planner
contract grows by 1,355 tokens for role fields, automatic collection, diagnostics
and migration. These instructions load only when assembling planner inputs.

Counts use `tiktoken 0.14.0` with `o200k_base`, including each
file's frontmatter and Markdown. These are consistent token estimates for
comparing instructions, not exact Opus or Codex billing counts. Repo config,
user requests, tool responses, and conversation history are excluded.

## Entrypoints

| Skill              | Baseline tokens | Updated tokens |
| ------------------ | --------------: | -------------: |
| `ziw-architecture` |             new |            644 |
| `ziw-code-review`  |           2,466 |          2,548 |
| `ziw-debug`        |             new |          1,034 |
| `ziw-grill`        |             926 |          1,159 |
| `ziw-implement`    |           2,546 |          2,765 |
| `ziw-orchestrate`  |           2,826 |          2,821 |
| `ziw-pr`           |           2,335 |          2,449 |
| `ziw-setup`        |           4,521 |          2,840 |
| `ziw-to-issues`    |           3,673 |          3,709 |
| `ziw-triage`       |           4,263 |          4,299 |
| Existing eight     |          23,556 |         22,590 |
| All ten            |  not applicable |         24,268 |

The existing eight entrypoints are about 4.1% smaller than baseline.
The two new skills add 1,678 entrypoint tokens.
The all-ten total measures repository instruction size, not a normal session
load or a like-for-like reduction. Setup's field lists live in canonical
references; project state and verification transcripts are excluded from config.

## Reference costs and common paths

| Reference                  | Tokens | Load condition                                                                 |
| -------------------------- | -----: | ------------------------------------------------------------------------------ |
| `planning-artifacts.md`    |  1,133 | Every Grill session                                                            |
| `glossary-discovery.md`    |    209 | Only unmapped glossary discovery                                               |
| `codebase-design.md`       |    463 | Module design; assessment candidates; scoped Grill or Implement interface work |
| `assessment.md`            |    484 | Requested architecture assessment                                              |
| `resumable-planning.md`    |    327 | Planning spanning sessions                                                     |
| `tracing.md`               |    328 | Suspect cross-component boundary or unknown value origin                       |
| `intermittent-failures.md` |    328 | Timing, concurrency, or intermittent failures                                  |
| `performance.md`           |    287 | Performance regression                                                         |
| `testing.md`               |    315 | Behavioral regression coverage                                                 |
| `friction-log.md`          |  1,627 | Encountered friction or run rollup                                             |
| `project-config.md`        |  5,629 | Applicable setup field sections                                                |
| `planner-input.md`         |  3,057 | Assembling orchestration JSON                                                  |
| `dispatch-policy.md`       |  1,919 | Scope, routing, capacity, or collision decisions                               |

Direct Debug starts at 1,034 tokens, about 53% below
Superpowers systematic-debugging's 2,183-token entrypoint measured with the same
tokenizer. That comparison excludes supporting files on both sides and measures
length, not quality. Tracing adds 328; intermittent investigation adds
328; performance adds 287. Load more than
one technique only when the failure calls for it.

Module design loads Architecture plus codebase design, about
1,107 tokens. Architecture assessment adds
assessment guidance, bringing that path to about
1,591. Grill is not part
of the assessment load unless unresolved selected decisions need clarification.

Grill with mapped glossary paths loads about
2,292 tokens. Resumable planning adds
327 only when needed.
A tracked bug loads Implement plus Debug, about
3,799 before applicable diagnostic techniques;
behavioral regression coverage adds 315. Feature regression work
loads Implement plus testing, about 3,080.

Unmapped glossary discovery adds 209 where required.
Complaint handling adds 1,627 only when friction occurs.
A full-file Setup config-index read costs
8,469; targeted section reads can cost less.
Other Setup references load for tracker policy, worker/loop policy, adapters,
Linear + Cursor delegation, or handoff work rather than on every refresh.

These are file-load estimates, not observed runtime traces. Shared references
already loaded in the same context need not be loaded again. Codex adapter
prompts and global discovery metadata are not included in the path sums.

Orchestrator with the planner input contract loads about 5,878
estimated tokens. Dispatch policy adds 1,919 when that branch applies.
The script fixes execute without loading their source into model context.

## Create PR shipping rewrite

Measured 2026-10-15 with the same tokenizer. `ziw-pr` drops from 2,449 to 1,643
tokens: it runs no checks of its own, no code review unless asked, no issue
search or creation, no hosted bot review resolution, and no tracker evidence
comment, and it bounds hook fixes with explicit progress rules and a
three-round cap. `ziw-implement` drops from 2,765 to 2,296 by trusting hooks,
CI, and task caches instead of replicating CI jobs locally, by skipping claim
re-verification for dispatched work, and by a scanning-first layout. Agent
Orchestrator reads code-host PR state itself instead of requiring it in worker
handoffs.

## PR 22: readable, proportionate workflows

Measured 2026-10-16 with the same tokenizer. Compare PR 22 against its actual
stack base, PR 21 at `02fe12c06cdf41eb257dc5a59242147e8a4161de`, separately from
PR 21's Create PR and Implement savings. The original PR 22 head was
`53e9057a3e73049cbdaa51c805cbc9b8910ac53c`.

| Skill              | PR 21 base | Original PR 22 | Revised PR 22 |
| ------------------ | ---------: | -------------: | ------------: |
| `ziw-architecture` |        644 |            769 |           629 |
| `ziw-code-review`  |      2,548 |          2,814 |         2,516 |
| `ziw-debug`        |      1,034 |          1,254 |         1,084 |
| `ziw-grill`        |      1,159 |          1,365 |         1,203 |
| `ziw-orchestrate`  |      2,836 |          2,888 |         2,818 |
| `ziw-setup`        |      2,855 |          2,945 |         1,737 |
| `ziw-to-issues`    |      3,709 |          4,125 |         3,292 |
| `ziw-triage`       |      4,518 |          4,712 |         4,697 |
| Eight rewritten    |     19,303 |         20,872 |        17,976 |
| `ziw-implement`    |      2,296 |          2,296 |         2,340 |
| `ziw-pr`           |      1,643 |          1,643 |         1,643 |
| All ten            |     23,242 |         24,811 |        21,959 |

The eight rewritten entrypoints are 13.9% smaller than original PR 22 and
6.9% smaller than their actual stack base. Ordered actions replace repeated
outlines and prose. The new decision rules allow scoped Grill returns, affected
Setup verification, bounded Triage path discovery, snapshot reuse, and
proportionate Debug checks. Implement adds the documentation-check exception
at its main verification step.

### Representative loaded paths

These totals include every file named in each path, including conditional
references. They exclude config, task evidence, and adapter prompts as above.
Shared files already in context need not be loaded twice. Section-specific
reads can be smaller than these full-file estimates.

| Path                                                | Original PR 22 | Revised PR 22 |
| --------------------------------------------------- | -------------: | ------------: |
| Direct Debug                                        |          1,254 |         1,084 |
| Implement + Debug + behavioral testing reference    |          3,865 |         3,739 |
| Scoped Grill clarification                          |          2,498 |         1,203 |
| Grill planning + planning-artifact contract         |          2,498 |         2,391 |
| Setup + full config index                           |          8,688 |         7,507 |
| Orchestrate + planner input contract                |          5,945 |         5,875 |
| Orchestrate + planner + integration checklist       |          8,530 |         8,499 |
| Same integration path + loop configuration contract |         10,934 |        10,963 |

The planning-artifact reference grows from 1,133 to 1,188 tokens and now loads
only for planning or changed boundaries. It does not load for a resolved scoped
clarification. The config index grows from 5,743 to 5,770, the integration
checklist from 2,585 to 2,624, and the loop contract from 2,404 to 2,464.
Those increases align scope and freshness rules; no bulk entrypoint content
was moved into references to claim a reduction. A configured orchestration loop
does not reload its setup contract on every tick.

## Identity handoff references

| Reference              | Tokens | Load condition                                  |
| ---------------------- | -----: | ----------------------------------------------- |
| `loop-contract.md`     |  2,395 | Configuring or operating the orchestration loop |
| `delegation-policy.md` |  1,520 | Dispatching or reconciling delegated workers    |
| `handoff.md`           |    927 | Producing a workflow handoff                    |
| `operating-profile.md` |  2,994 | Setup worker, capacity, and lifecycle policy    |

## Maintenance

Recount entrypoints and representative loaded paths after meaningful edits.
Moving text into a mandatory reference does not reduce the path's total.
Prefer a precise load condition, a canonical source, and a demonstrated
behavioral benefit over an arbitrary file-size threshold.

## To Issues slicing

Measured 2026-10-17 with the same tokenizer against the PR 21 head,
`3f68b61b83fe83bf4211af8a8ebcc510648a39e7`. `ziw-to-issues` grows from 3,292 to
3,534 entrypoint tokens for the one-slice-per-feature default, the narrowed
split reasons, and the confirmation before more than three new slices.

## Bounded review rounds

Measured 2026-10-26 against `d32f3a5b1733efdc0cdc445d5e41a054210379aa`
with `tiktoken 0.14.0`, `o200k_base`. These are instruction estimates, not
billed usage. Review adds one-level delegation, a three-round cap with a
five-round high-risk exception, and progress and nitpick stopping rules.

| Loaded path                                       | Before | After |
| ------------------------------------------------- | -----: | ----: |
| Code Review entrypoint                            |  2,516 | 2,932 |
| Orchestrate entrypoint                            |  2,818 | 2,883 |
| Implement entrypoint                              |  2,340 | 2,426 |
| Orchestrate + integration checklist + Code Review |  7,958 | 8,552 |
| Code Review + remote-worker review reference      |  3,242 | 3,726 |
| Implement + handoff reference                     |  3,232 | 3,382 |
| Orchestrate + delegation policy                   |  4,338 | 4,493 |

The integration checklist loads for returned PRs; the remote-worker reference
loads only for a remote review handoff. The review skill owns the limits;
callers link to it instead of loading an additional policy reference.

## One home per rule

Measured 2026-10-27 against `54f235c8ecb46d3b0f581853ca2c47672c891825` with
`tiktoken 0.14.0`, `o200k_base`. These are instruction estimates, not billed
usage. Each shared rule now has one owning file; other files state only what
their role needs and link the owner. Planner internals moved to the maintainer
doc `docs/planner-internals.md`, which no published skill loads. `Never` lists
keep hard limits only, and every skill files ordinary friction from a one-line
pointer instead of loading the friction reference.

| Loaded path                                         | Before |  After |
| --------------------------------------------------- | -----: | -----: |
| All ten entrypoints                                 | 22,908 | 18,332 |
| Orchestrate + planner input + integrate checklist   |  9,449 |  6,391 |
| Same + loop contract, dispatch, delegation policies | 15,587 | 10,274 |
| Triage + planner input (+ contract sections after)  |  8,601 |  6,276 |
| Code Review + checklist + hosted review             |  5,473 |  4,866 |
| Implement + Create PR                               |  4,119 |  3,346 |
| Implement + handoff                                 |  3,393 |  2,616 |
| Setup + full config index                           |  7,677 |  6,878 |
| Friction reference, loaded only on storage problems |  1,639 |  1,125 |

Published skill and agent Markdown fell from 69,069 to 51,633 tokens. Triage
now loads the tracker contract's `Agent-Ready Issue Body` and `Agent Suitability`
sections, which own readiness and fragments; the triage row includes them.
