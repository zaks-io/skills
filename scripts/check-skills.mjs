import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(root, "skills");
const errors = [];
const manualOnlySkills = new Set([
  "workflow-agent-implement",
  "workflow-agent-orchestrator",
  "workflow-agent-review",
  "workflow-create-pr",
  "workflow-issue-triage",
  "workflow-setup",
]);
const implicitInvocationSkills = new Set(["workflow-code-review", "workflow-secret-redaction"]);
const cleanContextSkills = new Set(["workflow-agent-review", "workflow-code-review"]);
const bannedFrontmatterFields = ["allowed-tools", "model", "effort", "shell"];
const scriptAllowedSkills = new Set(["workflow-secret-redaction"]);
const triggerTerms = {
  "workflow-agent-implement": ["implement", "issue", "pr"],
  "workflow-agent-orchestrator": ["orchestrate", "issue", "tracker"],
  "workflow-agent-review": ["review", "pr"],
  "workflow-code-review": ["review", "code"],
  "workflow-create-pr": ["pr", "pull request"],
  "workflow-issue-triage": ["tracker", "triage", "project", "issue"],
  "workflow-secret-redaction": ["secret", ".env", "redact"],
  "workflow-setup": ["setup", "config"],
};

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
  const skillScriptsDir = path.join(skillsDir, name, "scripts");
  const h1Count = (skillText.match(/^#\s+/gm) ?? []).length;
  if (h1Count !== 1) {
    fail(`${relative(skillFile)} must have exactly one top-level heading`);
  }
  if (!/^## Inputs\s*$/m.test(skillText)) {
    fail(`${relative(skillFile)} must include a ## Inputs section`);
  }
  if (!/^## (Done|Output)\s*$/m.test(skillText)) {
    fail(`${relative(skillFile)} must include a ## Done or ## Output section`);
  }
  if (existsSync(skillScriptsDir) && !scriptAllowedSkills.has(name)) {
    fail(
      `${relative(skillScriptsDir)} is not allowed without adding this skill to scriptAllowedSkills`,
    );
  }

  const frontmatterMatch = skillText.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    fail(`${relative(skillFile)} is missing YAML frontmatter`);
    continue;
  }
  const frontmatter = frontmatterMatch[1];
  const hasFrontmatterField = (field) => new RegExp(`^${field}:\\s*`, "m").test(frontmatter);
  const frontmatterValue = (field) => {
    const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)\\s*$`, "m"));
    return match?.[1]?.trim().replace(/^["']|["']$/g, "");
  };

  const nameMatch = frontmatter.match(/^name:\s*(.+)\s*$/m);
  if (!nameMatch) {
    fail(`${relative(skillFile)} is missing frontmatter name`);
  } else {
    const frontmatterName = nameMatch[1].trim().replace(/^["']|["']$/g, "");
    if (frontmatterName !== name) {
      fail(`${relative(skillFile)} name is ${frontmatterName}, expected ${name}`);
    }
  }

  const descriptionMatch = frontmatter.match(/^description:\s*(.+|\|>-?)\s*$/m);
  if (!descriptionMatch) {
    fail(`${relative(skillFile)} is missing frontmatter description`);
  }
  const description = descriptionMatch?.[1]?.toLowerCase() ?? "";
  for (const term of triggerTerms[name] ?? []) {
    if (!description.includes(term)) {
      fail(`${relative(skillFile)} description must include trigger term "${term}"`);
    }
  }

  if (manualOnlySkills.has(name) && frontmatterValue("disable-model-invocation") !== "true") {
    fail(`${relative(skillFile)} must set disable-model-invocation: true`);
  }
  if (cleanContextSkills.has(name) && frontmatterValue("context") !== "fork") {
    fail(`${relative(skillFile)} must set context: fork`);
  }
  for (const field of bannedFrontmatterFields) {
    if (hasFrontmatterField(field)) {
      fail(`${relative(skillFile)} must not set ${field}`);
    }
  }
  if (/```!/.test(skillText) || /(^|\s)!`[^`\n]+`/.test(skillText)) {
    fail(`${relative(skillFile)} must not use Claude dynamic shell injection`);
  }

  const openaiFile = path.join(skillsDir, name, "agents", "openai.yaml");
  const openaiText = readText(openaiFile);
  const expectedImplicitPolicy = manualOnlySkills.has(name)
    ? "false"
    : implicitInvocationSkills.has(name)
      ? "true"
      : null;
  if (!openaiText.includes(`default_prompt:`)) {
    fail(`${relative(openaiFile)} is missing interface.default_prompt`);
  }
  if (!openaiText.includes(`$${name}`)) {
    fail(`${relative(openaiFile)} default_prompt must reference $${name}`);
  }
  for (const term of triggerTerms[name] ?? []) {
    if (!openaiText.toLowerCase().includes(term)) {
      fail(`${relative(openaiFile)} default_prompt should include trigger term "${term}"`);
    }
  }
  if (
    expectedImplicitPolicy &&
    !new RegExp(`^\\s*allow_implicit_invocation:\\s*${expectedImplicitPolicy}\\s*$`, "m").test(
      openaiText,
    )
  ) {
    fail(
      `${relative(openaiFile)} must set policy.allow_implicit_invocation: ${expectedImplicitPolicy}`,
    );
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
