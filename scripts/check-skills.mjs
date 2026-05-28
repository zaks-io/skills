import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(root, "skills");
const errors = [];

const fail = (message) => errors.push(message);
const relative = (file) => path.relative(root, file) || ".";

const readText = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    fail(`Cannot read ${relative(file)}: ${error.message}`);
    return "";
  }
};

const skillNames = readdirSync(skillsDir)
  .filter((name) => {
    const fullPath = path.join(skillsDir, name);
    return statSync(fullPath).isDirectory();
  })
  .sort();

for (const name of skillNames) {
  if (!name.startsWith("workflow-")) {
    fail(`skills/${name} must start with workflow-`);
  }

  const skillFile = path.join(skillsDir, name, "SKILL.md");
  const skillText = readText(skillFile);
  const frontmatterMatch = skillText.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    fail(`${relative(skillFile)} is missing YAML frontmatter`);
    continue;
  }

  const nameMatch = frontmatterMatch[1].match(/^name:\s*(.+)\s*$/m);
  if (!nameMatch) {
    fail(`${relative(skillFile)} is missing frontmatter name`);
  } else {
    const frontmatterName = nameMatch[1].trim().replace(/^["']|["']$/g, "");
    if (frontmatterName !== name) {
      fail(`${relative(skillFile)} name is ${frontmatterName}, expected ${name}`);
    }
  }

  const descriptionMatch = frontmatterMatch[1].match(/^description:\s*(.+|\|>-?)\s*$/m);
  if (!descriptionMatch) {
    fail(`${relative(skillFile)} is missing frontmatter description`);
  }

  const openaiFile = path.join(skillsDir, name, "agents", "openai.yaml");
  const openaiText = readText(openaiFile);
  if (!openaiText.includes(`default_prompt:`)) {
    fail(`${relative(openaiFile)} is missing interface.default_prompt`);
  }
  if (!openaiText.includes(`$${name}`)) {
    fail(`${relative(openaiFile)} default_prompt must reference $${name}`);
  }
}

if (skillNames.length === 0) {
  fail("No skills found");
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Skill repo check passed (${skillNames.length} skills).`);
}
