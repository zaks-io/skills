# Skill instruction budget

Measured: 2026-10-05. Baseline: `23d958d6297e2908cdd17f2f2a3a99c0a0f7e4b4`.

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
| `ziw-implement`    |           2,546 |          2,731 |
| `ziw-orchestrate`  |           2,826 |          2,832 |
| `ziw-pr`           |           2,335 |          2,371 |
| `ziw-setup`        |           4,521 |          2,840 |
| `ziw-to-issues`    |           3,673 |          3,709 |
| `ziw-triage`       |           4,263 |          4,299 |
| Existing eight     |          23,556 |         22,489 |
| All ten            |  not applicable |         24,167 |

The existing eight entrypoints are about 4.5% smaller than baseline.
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
| `project-config.md`        |  5,589 | Applicable setup field sections                                                |
| `planner-input.md`         |  1,702 | Assembling orchestration JSON                                                  |
| `dispatch-policy.md`       |  1,797 | Scope, routing, capacity, or collision decisions                               |

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
3,765 before applicable diagnostic techniques;
behavioral regression coverage adds 315. Feature regression work
loads Implement plus testing, about 3,046.

Unmapped glossary discovery adds 209 where required.
Complaint handling adds 1,627 only when friction occurs.
A full-file Setup config-index read costs
8,429; targeted section reads can cost less.
Other Setup references load for tracker policy, worker/loop policy, adapters,
Linear + Cursor delegation, or handoff work rather than on every refresh.

These are file-load estimates, not observed runtime traces. Shared references
already loaded in the same context need not be loaded again. Codex adapter
prompts and global discovery metadata are not included in the path sums.

Orchestrator with the planner input contract loads about 4,534
estimated tokens. Dispatch policy adds 1,797 when that branch applies.
The script fixes execute without loading their source into model context.

## Maintenance

Recount entrypoints and representative loaded paths after meaningful edits.
Moving text into a mandatory reference does not reduce the path's total.
Prefer a precise load condition, a canonical source, and a demonstrated
behavioral benefit over an arbitrary file-size threshold.
