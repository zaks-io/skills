#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, usage } from "./downstream-skills/options.mjs";
import { printReport } from "./downstream-skills/report.mjs";
import { updateTargets } from "./downstream-skills/update.mjs";

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error("");
    console.error(usage());
    process.exit(2);
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const results = updateTargets(options);
  printReport(results, options);

  if (
    results.some((result) => result.status.endsWith("failed") || result.checkStatus === "failed")
  ) {
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  main();
}
