import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export function isMain(url) {
  return Boolean(process.argv[1]) && url === pathToFileURL(realpathSync(process.argv[1])).href;
}
export function parseCli(args, { usage, options = {}, allowPositionals = false }) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals,
      options: { ...options, help: { type: "boolean", short: "h" } },
    });
    for (const [name, value] of Object.entries(parsed.values)) {
      if ([value].flat().some((entry) => typeof entry === "string" && !entry.trim()))
        throw new Error(`--${name} requires a nonempty value`);
    }
  } catch (error) {
    throw new Error(`${error.message}\n${usage}`);
  }
  if (parsed.values.help) {
    console.log(usage);
    return null;
  }
  return parsed;
}
export async function runCli(name, operation) {
  try {
    await operation();
  } catch (error) {
    console.error(`${name}: ${error.message}`);
    process.exitCode = 1;
  }
}
