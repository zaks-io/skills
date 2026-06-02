import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(root, "skills");
const errors = [];
const manualOnlySkills = new Set([
  "ziw-implement",
  "ziw-orchestrate",
  "ziw-review",
  "ziw-pr",
  "ziw-to-issues",
  "ziw-triage",
  "ziw-setup",
]);
const implicitInvocationSkills = new Set(["ziw-code-review"]);
const cleanContextSkills = new Set(["ziw-review", "ziw-code-review"]);
const bannedFrontmatterFields = ["allowed-tools", "model", "effort", "shell"];
const scriptAllowedSkills = new Set();
const triggerTerms = {
  "ziw-implement": ["implement", "issue", "pr"],
  "ziw-orchestrate": ["orchestrate", "issue", "tracker"],
  "ziw-review": ["review", "pr"],
  "ziw-code-review": ["review", "code"],
  "ziw-pr": ["pr", "pull request"],
  "ziw-to-issues": ["spec", "ticket", "dependency"],
  "ziw-triage": ["tracker", "triage", "project", "issue"],
  "ziw-setup": ["setup", "config"],
};
const claudePluginFile = path.join(root, ".claude-plugin", "plugin.json");
const claudeAgentsDir = path.join(root, "agents");
const docsDir = path.join(root, "docs");
const readmeFile = path.join(root, "README.md");
const agentWorkflowFile = path.join(docsDir, "agent-workflow.md");
const researchFile = path.join(docsDir, "agent-delivery-research.md");
const expectedClaudeAgents = new Set(["ziw-implementer", "ziw-reviewer", "ziw-triager"]);
const unsupportedClaudeAgentFields = ["hooks", "mcpServers", "permissionMode"];

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

const markdownFiles = (dir) => {
  if (!existsSync(dir)) {
    fail(`${relative(dir)} is missing`);
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return markdownFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
    })
    .sort();
};

const skillNames = readdirSync(skillsDir)
  .filter((name) => {
    const fullPath = path.join(skillsDir, name);
    return statSync(fullPath).isDirectory();
  })
  .sort();

if (!existsSync(researchFile)) {
  fail(`${relative(researchFile)} is missing`);
} else {
  const researchText = readText(researchFile);
  for (const required of [
    "## Takeaways",
    "## Evidence",
    "## Workflow Decisions",
    "## Documentation Rules",
    "## Done",
  ]) {
    if (!researchText.includes(required)) {
      fail(`${relative(researchFile)} must include ${required}`);
    }
  }
}

const docsAndSkillFiles = [
  readmeFile,
  agentWorkflowFile,
  ...markdownFiles(docsDir),
  ...markdownFiles(skillsDir),
  ...markdownFiles(claudeAgentsDir),
];
for (const file of [...new Set(docsAndSkillFiles)]) {
  const text = readText(file);
  const removedLoopName = `${"spec"}-${"con" + "formance"}`;
  const removedCoverageLoop = new RegExp(`workflow-${removedLoopName}|${removedLoopName}`, "i");
  if (removedCoverageLoop.test(text)) {
    fail(`${relative(file)} must not reference the removed coverage-audit workflow`);
  }
}

const readmeText = readText(readmeFile);
if (!readmeText.includes("docs/agent-delivery-research.md")) {
  fail(`${relative(readmeFile)} must link to docs/agent-delivery-research.md`);
}
const workflowText = readText(agentWorkflowFile);
if (!workflowText.includes("agent-delivery-research.md")) {
  fail(`${relative(agentWorkflowFile)} must link to agent-delivery-research.md`);
}

for (const name of skillNames) {
  if (!name.startsWith("ziw-")) {
    fail(`skills/${name} must start with ziw-`);
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

const pluginManifestText = readText(claudePluginFile);
try {
  const pluginManifest = JSON.parse(pluginManifestText);
  if (pluginManifest.name !== "zaks-io-skills") {
    fail(`${relative(claudePluginFile)} name must be zaks-io-skills`);
  }
  if (!pluginManifest.description) {
    fail(`${relative(claudePluginFile)} is missing description`);
  }
} catch (error) {
  fail(`${relative(claudePluginFile)} must be valid JSON: ${error.message}`);
}

const claudeAgentNames = new Set();
for (const agentFile of markdownFiles(claudeAgentsDir)) {
  const agentText = readText(agentFile);
  const frontmatterMatch = agentText.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    fail(`${relative(agentFile)} is missing YAML frontmatter`);
    continue;
  }

  const frontmatter = frontmatterMatch[1];
  const frontmatterValue = (field) => {
    const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)\\s*$`, "m"));
    return match?.[1]?.trim().replace(/^["']|["']$/g, "");
  };
  const hasFrontmatterField = (field) => new RegExp(`^${field}:\\s*`, "m").test(frontmatter);
  const agentName = frontmatterValue("name");

  if (!agentName) {
    fail(`${relative(agentFile)} is missing frontmatter name`);
  } else {
    claudeAgentNames.add(agentName);
    if (!/^[a-z0-9-]+$/.test(agentName)) {
      fail(`${relative(agentFile)} name must be lowercase kebab-case`);
    }
    if (path.basename(agentFile, ".md") !== agentName) {
      fail(`${relative(agentFile)} filename must match agent name ${agentName}`);
    }
  }

  if (!frontmatterValue("description")) {
    fail(`${relative(agentFile)} is missing frontmatter description`);
  }
  if (frontmatterValue("model") !== "inherit") {
    fail(`${relative(agentFile)} must set model: inherit`);
  }
  if (!agentText.includes("${CLAUDE_PLUGIN_ROOT}/skills/")) {
    fail(`${relative(agentFile)} must load its skill from CLAUDE_PLUGIN_ROOT`);
  }
  for (const field of unsupportedClaudeAgentFields) {
    if (hasFrontmatterField(field)) {
      fail(`${relative(agentFile)} must not set unsupported plugin agent field ${field}`);
    }
  }
}

for (const expectedAgent of expectedClaudeAgents) {
  if (!claudeAgentNames.has(expectedAgent)) {
    fail(`agents/${expectedAgent}.md is missing`);
  }
}
for (const agentName of claudeAgentNames) {
  if (!expectedClaudeAgents.has(agentName)) {
    fail(`agents/${agentName}.md is not a configured workflow agent`);
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
