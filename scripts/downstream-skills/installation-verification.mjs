import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const CANONICAL_ROOT = ".agents/skills";

export function parseSourceTree(payload) {
  if (!payload || typeof payload !== "object" || payload.truncated !== false) {
    throw new Error("GitHub returned an incomplete or truncated source tree");
  }
  if (!/^[0-9a-f]{40}$/.test(payload.sha) || !Array.isArray(payload.tree)) {
    throw new Error("GitHub returned a malformed source tree");
  }
  const nodes = new Map();
  for (const node of payload.tree) {
    if (
      !node ||
      typeof node.path !== "string" ||
      !["blob", "tree", "commit"].includes(node.type) ||
      typeof node.mode !== "string"
    ) {
      throw new Error("GitHub returned a malformed source tree entry");
    }
    if (!/^[0-9a-f]{40}$/.test(node.sha)) throw new Error(`Invalid Git object for ${node.path}`);
    if (nodes.has(node.path)) throw new Error(`Duplicate Git tree path: ${node.path}`);
    nodes.set(node.path, node);
  }
  const skills = new Map();
  for (const [skillPath, node] of nodes) {
    const match = skillPath.match(/^skills\/([^/]+)\/SKILL\.md$/);
    if (!match) continue;
    if (node.type !== "blob") throw new Error(`Unsupported Git object: ${skillPath}`);
    const name = match[1];
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) throw new Error(`Unsafe source skill name: ${name}`);
    const folder = nodes.get(`skills/${name}`);
    if (!folder || folder.type !== "tree") throw new Error(`Missing source tree node for ${name}`);
    const prefix = `skills/${name}/`;
    const files = new Map();
    for (const [entryPath, entry] of nodes) {
      if (!entryPath.startsWith(prefix)) continue;
      const relativePath = entryPath.slice(prefix.length);
      if (entry.type === "blob") files.set(relativePath, { mode: entry.mode, sha: entry.sha });
      else if (entry.type !== "tree")
        throw new Error(`Unsupported Git object in ${name}: ${entryPath}`);
    }
    if (files.size === 0) throw new Error(`Source skill ${name} has no files`);
    skills.set(name, { files, skillFolderHash: folder.sha });
  }
  if (skills.size === 0)
    throw new Error("GitHub source tree contains no skills/<name>/SKILL.md files");
  return { sourceSha: payload.sha, skills };
}

export function validateInstallation(root, source, sourceTree, runtimeRoots = new Set()) {
  const lock = readLock(path.join(root, "skills-lock.json"));
  const actualNames = [...lockNames(lock, source)].sort();
  const expectedNames = [...sourceTree.skills.keys()].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `Source lock names differ: expected ${expectedNames.join(", ")}; got ${actualNames.join(", ")}`,
    );
  }
  for (const [name, skill] of sourceTree.skills) {
    const entry = lock.skills[name];
    if (entry.skillPath !== `skills/${name}/SKILL.md`)
      throw new Error(`Invalid skillPath for ${name}`);
    const canonical = path.join(root, CANONICAL_ROOT, name);
    compareSourceFiles(canonical, skill.files, name);
    if (entry.computedHash !== computeLockHash(canonical, skill.files.keys()))
      throw new Error(`Stale computedHash for ${name}`);
    for (const runtimeRoot of runtimeRoots) {
      compareRuntime(
        path.join(root, runtimeRoot, name),
        canonical,
        runtimeRoot === "agent/skills",
        name,
      );
    }
  }
  for (const name of expectedNames) {
    for (const runtimeRoot of runtimeRoots) {
      if (!fs.existsSync(path.join(root, runtimeRoot, name)))
        throw new Error(`Missing runtime skill ${runtimeRoot}/${name}`);
    }
  }
}

export function readLock(lockPath) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  if (
    lock?.version !== 1 ||
    !lock.skills ||
    typeof lock.skills !== "object" ||
    Array.isArray(lock.skills)
  ) {
    throw new Error("Invalid skills-lock.json");
  }
  return lock;
}

export function lockNames(lock, source) {
  return new Set(
    Object.entries(lock.skills)
      .filter(([, entry]) => entry?.source === source)
      .map(([name]) => name),
  );
}

function compareSourceFiles(directory, expected, name) {
  const actual = localFiles(directory);
  if (JSON.stringify([...actual.keys()].sort()) !== JSON.stringify([...expected.keys()].sort())) {
    throw new Error(`Canonical file list differs for ${name}`);
  }
  for (const [file, object] of expected) {
    if (actual.get(file)?.sha !== object.sha)
      throw new Error(`Stale canonical file: ${name}/${file}`);
  }
}

function compareRuntime(runtime, canonical, eve, name) {
  const stat = fs.lstatSync(runtime);
  if (stat.isSymbolicLink()) {
    const target = path.resolve(path.dirname(runtime), fs.readlinkSync(runtime));
    if (target !== canonical)
      throw new Error(`Runtime link does not target canonical skill: ${runtime}`);
    return;
  }
  if (!stat.isDirectory()) throw new Error(`Unsupported runtime skill: ${runtime}`);
  const expected = localFiles(canonical);
  const actual = localFiles(runtime);
  if (JSON.stringify([...actual.keys()].sort()) !== JSON.stringify([...expected.keys()].sort())) {
    throw new Error(`Runtime file list differs for ${name}`);
  }
  for (const [file, object] of expected) {
    if (eve && path.basename(file).toLowerCase() === "skill.md") {
      const runtimeText = fs.readFileSync(path.join(runtime, file), "utf8");
      if (
        !runtimeText.match(new RegExp(`^---\\r?\\n[\\s\\S]*?^name: ${escapeRegex(name)}$`, "m"))
      ) {
        throw new Error(`Invalid Eve frontmatter: ${name}/${file}`);
      }
      const canonicalBody = stripFrontmatter(fs.readFileSync(path.join(canonical, file), "utf8"));
      const runtimeBody = stripFrontmatter(runtimeText);
      if (canonicalBody !== runtimeBody) throw new Error(`Stale Eve skill file: ${name}/${file}`);
    } else if (actual.get(file)?.sha !== object.sha)
      throw new Error(`Stale runtime file: ${name}/${file}`);
  }
}

function localFiles(directory) {
  if (!fs.statSync(directory).isDirectory())
    throw new Error(`Missing skill directory: ${directory}`);
  const files = new Map();
  const visit = (current, prefix = "") => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full, relative);
      else if (entry.isFile()) files.set(relative, { sha: gitBlobSha(fs.readFileSync(full)) });
      else if (entry.isSymbolicLink())
        files.set(relative, { sha: gitBlobSha(Buffer.from(fs.readlinkSync(full))) });
      else throw new Error(`Unsupported file type: ${full}`);
    }
  };
  visit(directory);
  return files;
}

function gitBlobSha(content) {
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
}

function stripFrontmatter(text) {
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return (match ? text.slice(match[0].length) : text).replace(/^\r?\n/, "");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Keep the lock hash compatible with computeSkillFolderHash in skills@1.7.0.
function computeLockHash(directory, names) {
  const hash = createHash("sha256");
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    if (
      name
        .split("/")
        .slice(0, -1)
        .some((part) => part === ".git" || part === "node_modules")
    )
      continue;
    const file = path.join(directory, name);
    if (!fs.lstatSync(file).isFile()) continue;
    hash.update(name);
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}
