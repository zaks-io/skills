export function printReport(results, options) {
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`Source: ${options.source}`);
  console.log(`Mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`Targets: ${results.length}`);
  console.log(`Summary: ${summary(results)}`);
  console.log("");

  for (const result of results) {
    printResult(result);
  }
}

function summary(results) {
  const counts = new Map();
  for (const result of results) {
    counts.set(result.status, (counts.get(result.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => `${status}=${count}`).join(", ");
}

function printResult(result) {
  console.log(`${result.status.padEnd(18)} ${result.repoRoot}`);
  if (result.branchName) {
    console.log(`  branch: ${result.branchName}`);
  }
  if (result.baseRef) {
    console.log(`  base: ${result.baseRef}`);
  }
  if (result.worktreePath) {
    console.log(`  worktree: ${result.worktreePath}`);
  }
  if (result.reusedBranch) {
    console.log("  reused branch: true");
  }
  if (result.worktreeCleanup) {
    console.log(`  worktree cleanup: ${result.worktreeCleanup}`);
  }
  if (result.branchCleanup) {
    console.log(`  branch cleanup: ${result.branchCleanup}`);
  }
  if (result.commit) {
    console.log(`  commit: ${result.commit}`);
  }
  if (result.prUrl) {
    console.log(`  pr: ${result.prUrl}`);
  }
  if (result.pushHooks) {
    console.log(`  push hooks: ${result.pushHooks}`);
  }
  if (result.checkStatus) {
    console.log(`  check: ${result.checkStatus} (${result.checkCommand ?? "none"})`);
  }
  if (result.error) {
    console.log(`  error: ${result.error}`);
  }
  if (result.worktreeCleanupError) {
    console.log(`  worktree cleanup error: ${result.worktreeCleanupError}`);
  }
  if (result.branchCleanupError) {
    console.log(`  branch cleanup error: ${result.branchCleanupError}`);
  }
  if (result.after?.length) {
    console.log(`  changes: ${result.after.length}`);
  }
  if (result.sourceBefore?.length) {
    console.log(`  source checkout changes: ${result.sourceBefore.length}`);
  }
}
