# Ratchet setup guide

Draft `setup.json` with the user. `init` locks everything in it; to change it, start a new run.

```json
{
  "goal": "Make the dashboard calm and easy to scan",
  "ticket": "EXA-12",
  "notes": "Users lose work in dialogs and miss bulk actions.",
  "context": ["docs/design-system.md", "src/components/"],
  "judges": ["sol", "opus"],
  "implementer": "sol",
  "recipe": "node .ziw/ratchet/dash/capture.mjs",
  "sets": {
    "working": ["home", "search", "settings", "billing", "empty"],
    "validation": ["reports", "team", "onboarding"],
    "confirmation": ["profile", "errors", "alerts"]
  },
  "references": [],
  "boundary": {
    "target": ["src/"],
    "protected": [".ziw/ratchet/dash/capture.mjs", "e2e/fixtures/"]
  },
  "checks": { "focused": "pnpm test --filter web", "full": "pnpm ci:check" },
  "criteria": [
    {
      "id": "hierarchy",
      "type": "judged",
      "weight": 3,
      "target": 6,
      "definition": "The most important content is obvious first.",
      "checks": [
        "How many heading sizes appear?",
        "Is there one clear primary action?",
        "Does secondary text recede?"
      ]
    },
    { "id": "a11y", "type": "gate", "command": "pnpm axe --fail-on serious" }
  ]
}
```

`notes` and `context` tell the implementer what users struggle with and where
the design system lives.

## Criteria

Pick categories for this goal, then decide how each is checked:

- `judged`: needs taste. Give `weight`, `target`, a `definition` of what
  better means, and 3 to 6 observable `checks`.
- `measured`: a tool can score it. Give `weight`, `target`, a `command` that
  prints one number, `runs`, `minChange`, `tolerance`, and a `map` from values
  to standing (`at0` scores 0, `at10` scores 10).
- `gate`: must simply pass. Give a `command` whose exit code 0 passes.

Each judged criterion adds a verdict per pair, so judge only what a tool can't
check. At least one criterion must be judged.

Each round the judges critique the last kept version against the judged
criteria. That critique is the next round's work list.

## Recipe

One command that writes evidence for the current commit into `$RATCHET_OUT`,
plus `items.json`: `{ "items": [{ "id": "home-wide", "unit": "home", "file":
"home-wide.png" }] }`. It must produce the same items every time. Mark an item
`"critical": true` when any agreed loss on it should revert the round.

- UI: fixed routes, viewports, states, theme, and seed data, captured with
  playwright-cli. Cover key task flows as step-by-step captures, keyboard focus,
  error and recovery states, and a narrow viewport. A unit is one page or flow.
- Prompts: fixed inputs, model, and parameters, with several samples per input.
  A unit is one input across its samples.

Split units across the sets. The implementer only sees working feedback;
validation guards every keep; confirmation stays untouched until the end.
`init` reports the minimum units per set; stay near it, since every item costs
judge tokens every round.

## References

Decide with the user whether references help this goal. They set a taste
target and make 5 mean parity with them; without them, 5 means the starting
version. Each reference is a directory with its own `items.json`, using the
target's item IDs for the items it matches.

## Boundary

`target` lists what the implementer improves. `protected` lists the evaluation
machinery and inputs: the recipe, its helpers, evaluators, fixtures, seed data,
and eval inputs. Never protect the target. Keep helpers in the run directory
unless they must live in the repo.

## Defaults

`cap` is 25 rounds. `thresholds` defaults: `alpha` 0.1, `confidence` 0.9,
`regressionTolerance` 0, `anchorTolerance` 1, `minAgreement` 0.6. Change them
only when calibration or the user gives a reason.
