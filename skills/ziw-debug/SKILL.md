---
name: ziw-debug
description: Diagnose bugs, failing tests, build failures, performance regressions, and unexpected behavior by reproducing the failure and testing hypotheses. Use for debugging requests or failures during implementation.
---

# Debug

Find the cause of a failure and prove it. Fix it only when the request
includes fixing.

## Inputs

The symptom, the expected behavior, where it happens, and whether to fix or
only diagnose.

## Steps

1. Reproduce the failure through the real failing path. A nearby failing test
   isn't a reproduction.
2. Find where behavior first diverges from what's expected. Compare against a
   working path and recent changes.
3. State one testable hypothesis, change one thing, and observe. Drop
   explanations the evidence contradicts.
4. Confirm the cause explains the original symptom. Call anything unconfirmed a
   hypothesis.
5. If fixing: write a failing test or reproducer, make the smallest fix, and
   rerun the reproducer and affected checks.
6. Remove any temporary logging or services you added.

For harder cases, load the matching guide:
[tracing across layers](references/tracing.md),
[intermittent failures](references/intermittent-failures.md), or
[performance](references/performance.md).

## Rules

- Experiment only locally and reversibly. Don't touch shared, hosted, paid, or
  production systems without explicit approval.
- A fix request authorizes a local fix, not a PR, tracker change, or deploy.

## Done

Report the symptom, reproducer, cause (or best hypothesis), the fix if any, the
checks run, and what's still uncertain.

## Sources

Adapted from [Superpowers systematic-debugging](https://github.com/obra/superpowers/blob/2c74782ead66b8ded584d9b9cf64dcba95457f320/skills/systematic-debugging/SKILL.md)
and Matt Pocock's [diagnosing-bugs](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/diagnosing-bugs/SKILL.md).
