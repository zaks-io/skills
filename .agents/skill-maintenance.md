# Skill maintenance

Use when editing the published skills or their agent-facing references.

## Author the smallest useful change

Keep ordered actions in the entrypoint. Put substantial guidance needed only
for one branch in a reference, with a pointer stating when to load it. Co-locate
a rule with its conditions and exceptions. Preserve authority and safety
boundaries even when reducing instruction length.

Each step needs an observable completion criterion. "Run the reproducer and
observe the reported symptom" is checkable; "understand the bug" is not.
Keep one authoritative definition of behavior. Runtime tools and provider
locations belong in repo config, not repeated skill prose.

Remove an instruction as a no-op only when actual behavior shows it adds no
value. Word counts measure instruction size, not token usage or effectiveness.
Use positive actions where possible and retain hard prohibitions for authority,
secrets, destructive operations, and other real guardrails.

Update the portable contract, Codex adapter, downstream template, and current
workflow docs together. Preserve existing invocation policy. Add a published
role only when a distinct caller and outcome justify it; record that rationale
in the skill portfolio.

## Validate behavior

Compare entrypoint token estimates and representative loaded-reference paths.
Record the tokenizer and version; do not present estimates as billed tokens.
Use [the instruction budget](../docs/skill-instruction-budget.md) as the dated
baseline. Move material only when its loading condition or canonical ownership
earns the change; a mandatory reference still counts toward the loaded path.

Run the repository's structure, formatting, discovery, and relevant tests.
For meaningful changes to decision-making, give a fresh agent the edited
skill, its needed references, a realistic request, and raw fixtures. Keep
expected answers and author conclusions out of its prompt. Fixture providers
must stay offline: no real tracker, complaint, PR, or production writes.

Inspect what the agent actually asks or proposes. Check dependencies, partial
answers, loading conditions, configured paths, complaint deduplication, and
authority boundaries where they apply. A keyword match proves none of these.
Use the bounded cases in [workflow-evaluation/cases.json](workflow-evaluation/cases.json)
for the planning and complaint changes. The historical architecture case records
the eight-role version; use [diagnostic-skill-evaluation/cases.json](diagnostic-skill-evaluation/cases.json)
for current Debug, Architecture, and state-free Setup behavior.

## Done

Report the changed behavior, executed checks, evaluator model and session,
case outcomes, review findings, and material limits. Preserve review outputs
outside published skill discovery. Fix observed failures and rerun only the
affected cases. Do not claim a fixture run exercised a live integration.

## Sources

Adapted from Matt Pocock's [writing-for-agents](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/productivity/writing-for-agents/SKILL.md)
and [retro](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/retro/SKILL.md).
