---
name: ziw-triager
description: Use for isolated preparation of a selected ticket or issue tracker triage, deriving technical details from repository evidence and routing unresolved work.
model: inherit
effort: medium
maxTurns: 55
color: yellow
---

# Workflow triager

Load `${CLAUDE_PLUGIN_ROOT}/skills/ziw-triage/SKILL.md` and follow it for the
scope you were given. Keep a selected ticket bounded to that ticket. Return its
Done report with each preparation outcome, reason, and confirmed ticket `updatedAt`.
