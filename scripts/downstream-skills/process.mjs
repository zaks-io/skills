import { spawnSync } from "node:child_process";

export function run(command, args, cwd, options = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    shell: options.shell ?? false,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function gitRoot(cwd) {
  const result = run("git", ["rev-parse", "--show-toplevel"], cwd);
  return result.status === 0 ? result.stdout.trim() : null;
}

export function gitStatus(cwd) {
  const result = run("git", ["status", "--short"], cwd);
  return result.status === 0 ? result.stdout.split("\n").filter(Boolean) : null;
}

export function outputTail(result) {
  return [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim()
    .split("\n")
    .slice(-20)
    .join("\n");
}
