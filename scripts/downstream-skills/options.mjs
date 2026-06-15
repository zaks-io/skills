import os from "node:os";
import path from "node:path";

import { DEFAULT_BASE_REF, DEFAULT_WORKTREE_ROOT } from "./worktrees.mjs";

export const DEFAULT_SOURCE = "zaks-io/skills";
export const DEFAULT_ROOT = path.join(os.homedir(), "src");

export const usage = () => `Usage:
  pnpm skills:downstream [--root <path>] [--source <owner/repo>] [--repo <path> ...]
  pnpm skills:downstream:update -- [--check --trust-check-commands] [--commit] [--push] [--pr] [--repo <path> ...]

Options:
  --apply           Run npx skills update -p -y in eligible repos.
                    Uses temporary git worktrees by default.
  --check           Run the repo Full local gate from docs/agents/workflow/config.md.
                    This executes trusted repo-configured shell commands.
  --trust-check-commands
                    Required with --check; confirms target repo configs are trusted.
  --commit          Create a branch, stage, and commit generated updates.
  --push            Push committed update branches. Implies --commit.
  --pr              Create GitHub PRs with gh after push. Implies --push.
  --allow-dirty     Update repos with existing local changes.
  --in-place        Mutate target repo checkouts directly instead of temp worktrees.
  --keep-worktree   Keep temporary worktrees instead of automatic cleanup.
  --worktree-root <path>
                    Directory for temporary git worktrees. Defaults to ${DEFAULT_WORKTREE_ROOT}.
  --base-ref <ref>  Ref used as the worktree base. Defaults to ${DEFAULT_BASE_REF}.
  --root <path>     Discovery root. Defaults to ~/src.
  --repo <path>     Limit to one repo. Repeat for multiple repos.
  --source <source> Match skills-lock.json entries by source. Defaults to zaks-io/skills.
  --branch-prefix <name>
                    Branch prefix for --commit. Defaults to codex/update-workflow-skills.
  --max-depth <n>   Max discovery depth below root. Defaults to 4.
  --json            Emit JSON report.
  --help            Show this help.
`;

export function parseArgs(argv) {
  const options = {
    allowDirty: false,
    apply: false,
    baseRef: DEFAULT_BASE_REF,
    branchPrefix: "codex/update-workflow-skills",
    check: false,
    commit: false,
    inPlace: false,
    json: false,
    keepWorktree: false,
    maxDepth: 4,
    pr: false,
    push: false,
    repos: [],
    root: DEFAULT_ROOT,
    source: DEFAULT_SOURCE,
    trustCheckCommands: false,
    worktreeRoot: DEFAULT_WORKTREE_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (applyFlag(options, arg)) {
      continue;
    }
    if (
      applyValuedOption(options, arg, argv[index + 1], (usedValue) => {
        index += usedValue ? 1 : 0;
      })
    ) {
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  normalizeOptions(options);
  return options;
}

function applyFlag(options, arg) {
  const flagMap = {
    "--help": "help",
    "-h": "help",
    "--apply": "apply",
    "--check": "check",
    "--commit": "commit",
    "--push": "push",
    "--pr": "pr",
    "--allow-dirty": "allowDirty",
    "--in-place": "inPlace",
    "--keep-worktree": "keepWorktree",
    "--json": "json",
    "--trust-check-commands": "trustCheckCommands",
  };
  const key = flagMap[arg];
  if (!key) {
    return false;
  }
  options[key] = true;
  return true;
}

function applyValuedOption(options, arg, value, markUsed) {
  const valid = new Set([
    "--root",
    "--repo",
    "--source",
    "--branch-prefix",
    "--base-ref",
    "--max-depth",
    "--worktree-root",
  ]);
  if (!valid.has(arg)) {
    return false;
  }
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }
  markUsed(true);

  if (arg === "--root") {
    options.root = expandHome(value);
  } else if (arg === "--repo") {
    options.repos.push(expandHome(value));
  } else if (arg === "--source") {
    options.source = value;
  } else if (arg === "--branch-prefix") {
    options.branchPrefix = value;
  } else if (arg === "--base-ref") {
    options.baseRef = value;
  } else if (arg === "--worktree-root") {
    options.worktreeRoot = expandHome(value);
  } else {
    options.maxDepth = parseMaxDepth(value);
  }
  return true;
}

function normalizeOptions(options) {
  if (options.pr) {
    options.push = true;
  }
  if (options.push) {
    options.commit = true;
  }
  if (options.commit) {
    options.apply = true;
  }
  if (options.commit && options.allowDirty && options.inPlace) {
    throw new Error("--commit cannot be combined with --allow-dirty in --in-place mode");
  }
  if (options.check && !options.trustCheckCommands) {
    throw new Error("--check requires --trust-check-commands");
  }
}

function parseMaxDepth(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("--max-depth must be a non-negative integer");
  }
  return parsed;
}

export function expandHome(value) {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}
