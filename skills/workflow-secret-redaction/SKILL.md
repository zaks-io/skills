---
name: workflow-secret-redaction
description: Use when an agent needs to redact, inspect, verify, compare, diff, schema-check, or summarize secret-bearing files or values such as .env files, API keys, tokens, credentials, or config without exposing secret values.
when_to_use: Use automatically before reading .env files, credential files, pasted secrets, or command output that may contain secret values.
argument-hint: "[path|--stdin|--mode text]"
---

# Secret Redaction

Redact secret-bearing input before it enters the model context. Use this before
opening `.env*`, credential files, token files, or command output that may print
secrets.

## Inputs

- One or more files that may contain secrets.
- A raw value, command output, or pasted text that may contain secrets.
- The verification goal: present keys, empty values, missing values, or whether
  two values match.
- The format check goal: whether a value matches a common credential shape.

## Workflow

1. Do not open secret-bearing files with `cat`, `sed`, `rg`, editor reads, or
   screenshots.
2. Use the bundled script at
   [scripts/redact-secrets.mjs](scripts/redact-secrets.mjs). Resolve the path
   relative to this `SKILL.md`.
3. For `.env`-style files, run:

   ```sh
   node scripts/redact-secrets.mjs .env .env.local
   ```

4. To compare values across files, pass all files in one command. The script uses
   one hidden HMAC key per run, so matching fingerprints in the same output mean
   matching raw values.
5. The script reports common credential formats when the value shape is
   recognized. This is shape-only validation, not proof that a credential is
   live or authorized.
6. To verify required keys without seeing values, use `--expect`:

   ```sh
   node scripts/redact-secrets.mjs --expect OPENAI_API_KEY,DATABASE_URL .env
   ```

7. To enforce expected formats, use a schema file with `KEY=Format` lines:

   ```sh
   node scripts/redact-secrets.mjs --schema secret-schema.txt --strict .env
   ```

8. To compare two `.env` files by key, use `--diff`:

   ```sh
   node scripts/redact-secrets.mjs --diff .env.example .env.local
   ```

9. Use `--json` when another tool or agent needs machine-readable redacted
   output.
10. For arbitrary text or a single raw value, pipe it through stdin in text mode:

```sh
printf '%s' "$VALUE" | node scripts/redact-secrets.mjs --stdin --mode text
```

11. If the value comes from a human, do not ask them to paste it into chat. Ask
    them to run a hidden prompt locally:

```sh
read -rsp "Secret: " VALUE; printf '\n'; printf '%s' "$VALUE" | node scripts/redact-secrets.mjs --stdin --mode text
```

12. If key names may also be sensitive, add `--hide-keys`.

## Done

Report only the redacted result and the verification conclusion: keys present,
empty values, missing expected keys, duplicate fingerprints, matching values,
schema mismatches, diff status, recognized credential formats, character-class
hints, near-match hints, and length hints for unrecognized values. Never include
raw secret values, command lines containing raw values, or stable hashes of
low-entropy secrets.

## Guardrails

- Never paste a secret into a shell command argument or chat message.
- Prefer file input or stdin over environment variables for raw secret material.
- Use one command for comparisons that need matching fingerprints.
- Stop and ask for a safer path if verification requires knowing the raw value.
