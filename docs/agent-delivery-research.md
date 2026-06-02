# Agent Delivery Research

Reviewed: 2026-06-01

This note records the research behind the workflow design. Use it when changing
the workflow skills, adding a new role, or deciding whether to delegate work to
a coding agent.

## Takeaways

- Keep one active work loop. The orchestrator should refresh external state,
  delegate implementation, call review, call integrate, and stop on blockers.
- Prefer simple, inspectable workflows over broad autonomous systems. Add
  agentic complexity only when it improves measured delivery outcomes.
- Treat Linear tickets as prompts. Small, well-scoped tickets with acceptance
  criteria, relevant artifacts, and verification commands are more likely to
  merge.
- Keep skills narrow. A skill should earn its token cost by improving pass rate,
  review quality, safety, or cycle time.
- Route work by task type. Documentation, tests, CI, build updates, small
  refactors, and scoped bug fixes are better agent targets than broad domain
  changes, auth, security, PII, production, performance, or ambiguous work.
- Do not trust tests alone. Code review, required checks, and human judgment for
  high-risk work remain part of the delivery system.
- Measure agent delivery as a system outcome: merge rate, time to merge,
  first-pass check rate, review rework, stuck workers, human escalations, and
  agent cost when available.

## Evidence

| Source                                                                                                                                             | Relevant finding                                                                                                                                      | Workflow implication                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Anthropic, [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)                                            | Successful production systems often use simple composable patterns. Complexity should be added only when simpler approaches fall short.               | Keep README and adapter docs short. Keep orchestration explicit.                                                  |
| Anthropic, [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)                                        | Multi-agent systems helped breadth-first research, but used about 15x chat tokens; Anthropic notes many coding tasks have fewer independent subtasks. | Use parallel workers only for independent slice tickets. Avoid multi-agent work for tightly coupled code changes. |
| Kapoor et al., [AI Agents That Matter](https://arxiv.org/abs/2407.01502)                                                                           | Accuracy-only benchmarks can reward costly, fragile systems; agent evaluation should include cost and reproducibility.                                | Track cost and rework, not only task completion.                                                                  |
| Xia et al., [Agentless](https://arxiv.org/abs/2407.01489)                                                                                          | A simple localize, repair, validate workflow matched or beat more complex open-source agents on SWE-bench Lite at low cost.                           | Do not add roles or skills when a bounded pipeline can do the job.                                                |
| Yang et al., [SWE-agent](https://papers.nips.cc/paper_files/paper/2024/hash/5a7c947568c1b1328ccc5230172e1e7c-Abstract-Conference.html)             | Agent-computer interface design affected coding-agent performance.                                                                                    | Tool and handoff shape matter. Keep worker prompts short and give agents real repo commands.                      |
| Han et al., [SWE-Skills-Bench](https://arxiv.org/abs/2603.15401)                                                                                   | 39 of 49 SWE skills gave zero pass-rate improvement; average gain was +1.2%; token overhead reached 451%; stale guidance sometimes hurt.              | New skills require a clear job, current docs, and measured value. Delete or demote pass-through skills.           |
| Sayagh, [What Makes a GitHub Issue Ready for Copilot?](https://arxiv.org/abs/2512.21426)                                                           | Merged agent PRs came from issues that were shorter, well scoped, and included guidance about relevant artifacts and implementation.                  | To Issues and triage must optimize ticket quality before delegation.                                              |
| GitHub Docs, [Best practices for Copilot cloud agent](https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results)               | GitHub recommends clear, well-scoped tasks with acceptance criteria and directions about files; ambiguous, sensitive, and broad tasks are poor fits.  | Encode agent-suitability policy in tracker config and triage.                                                     |
| GitHub Docs, [Copilot cloud agent risks](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations)                     | GitHub emphasizes security scans, branch limits, audit logs, and human review before merge.                                                           | Keep branch protections, review gates, and merge authority explicit.                                              |
| Linear Docs, [Agents in Linear](https://linear.app/docs/agents-in-linear)                                                                          | Assigning an issue to an agent triggers delegation, but the human teammate remains responsible.                                                       | Issue-assigned delegation is not human ownership transfer. Orchestrator tracks and escalates.                     |
| DORA, [State of AI-assisted Software Development 2025](https://dora.dev/research/2025/dora-report/)                                                | AI amplifies the strengths and weaknesses of the existing delivery system.                                                                            | Improve issue quality, checks, review, and platform reliability before increasing automation.                     |
| Pinna et al., [Comparing AI Coding Agents](https://arxiv.org/abs/2602.08915)                                                                       | Task type dominated acceptance rates; documentation tasks accepted more often than features; no single agent was best across all task types.          | Route by work type and risk, not agent brand.                                                                     |
| UTSBoost, [Rigorous Evaluation of Coding Agents on SWE-bench](https://arxiv.org/abs/2506.09289)                                                    | Weak tests can label incorrect patches as passed and change leaderboard rankings.                                                                     | Required checks are necessary but insufficient; keep independent review.                                          |
| Wang et al., [Are "Solved Issues" in SWE-bench Really Solved Correctly?](https://software-lab.org/publications/icse2026_SWE-bench-correctness.pdf) | Some plausible patches pass tests while diverging from expected behavior.                                                                             | Review must compare against intent, not just check output.                                                        |

## Workflow Decisions

### One Work Loop

Agent Orchestrator is the only active loop. It should keep a small context,
refresh Linear, GitHub, checks, and PR state, then delegate implementation or
review. To Issues and Issue Triage prepare current work. Agent Review and
integrate are called steps.

There is no separate coverage-audit loop in this repo. If coverage auditing is
needed later, add it as a measured capability with its own acceptance criteria
and validation data.

### Skill Surface

Core user-facing roles:

- `ziw-setup`
- `ziw-to-issues`
- `ziw-triage`
- `ziw-orchestrate`
- `ziw-implement`
- `ziw-review`

Helper gates:

- `ziw-code-review`
- `ziw-pr`

Do not add a new workflow skill unless it has one job, a distinct owner in the
workflow, and a measurable reason not to live inside an existing role.

### Agent-Ready Tickets

A slice ticket should be short and specific. It needs:

- outcome
- context docs
- likely files or artifacts
- in scope and out of scope
- acceptance criteria
- required checks
- security, privacy, data, and operational constraints
- dependencies or blockers

External references, credentials, third-party APIs, production access, or
unclear domain behavior lower agent suitability unless the ticket says exactly
how to verify them.

### Routing Policy

Good first-choice agent work:

- docs
- tests
- build, CI, and lint updates
- small refactors with clear local tests
- scoped bug fixes with reproduction or acceptance checks
- isolated UI changes with screenshots or target states

Default human-planning work:

- auth, authorization, PII, secrets, payments, or destructive data
- production incidents or production deploy decisions
- broad refactors and cross-repo changes
- deep domain behavior without clear acceptance criteria
- performance work without a benchmark
- tasks where learning or design judgment is the point

### Measurement

Each orchestrator run should produce enough data to answer:

- How many tickets were started, merged, blocked, or escalated?
- What was the first-pass check rate?
- How often did review send work back?
- How many workers got stuck or needed continuation nudges?
- Which task types merged cleanly?
- What did the run cost in tokens, credits, or billed requests when available?
- Did cycle time or merge rate improve without increasing failed checks or
  review load?

## Documentation Rules

- README stays the usage guide.
- `docs/agent-workflow.md` is the technical contract.
- `docs/agent-delivery-research.md` records why the contract looks this way.
- `skills/ziw-setup/references/*` must mirror the contract because setup
  uses those files to generate downstream repo config.
- Claude Code sub-agents stay short and load shared `SKILL.md` files through
  `${CLAUDE_PLUGIN_ROOT}`.
- Codex adapters stay in `skills/<skill>/agents/openai.yaml` and should point to
  the same skill names used in README.
- Adapter docs should point to the repo config and core skills; they should not
  duplicate the full workflow.
- If research changes a workflow rule, update this note, the contract, setup
  references, README, and validation in the same PR.

## Done

A workflow change is done when:

- unsupported loops and roles are not referenced
- Codex and Claude Code entry points still point to the same workflow roles
- setup references generate the current contract for downstream repos
- `pnpm check` and `pnpm format:check` pass
- research-backed decisions are linked from this file or intentionally marked as
  local judgment
