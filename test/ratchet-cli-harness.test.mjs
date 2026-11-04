import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../skills/ziw-ratchet/scripts/ratchet.mjs", import.meta.url));
export function fixture(t, initialize = true, options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "ratchet-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const file = (name) => path.join(root, name);
  const write = (name, value) => {
    mkdirSync(path.dirname(file(name)), { recursive: true });
    writeFileSync(file(name), typeof value === "string" ? value : JSON.stringify(value));
  };
  const read = (name) => readFileSync(file(name), "utf8");
  const setup = {
    goal: "Improve the target",
    ticket: "SKI-12",
    judges: ["sol", "opus"],
    implementer: "sol",
    recipe: "node .run/helper.mjs",
    sets: Object.fromEntries(
      ["working", "validation", "confirmation"].map((set) => [
        set,
        Array.from({ length: 5 }, (_, i) => `${set}${i}`),
      ]),
    ),
    references: [".run/ref"],
    boundary: { target: ["target.txt"], protected: [".run/helper.mjs"] },
    checks: { focused: "true", full: "true" },
    criteria: [
      {
        id: "quality",
        type: "judged",
        weight: 3,
        target: 6,
        definition: "Make the answer useful",
        checks: ["Correct facts", "Clear action", "Readable order"],
      },
      { id: "gate", type: "gate", command: "true" },
    ],
  };
  Object.assign(setup, options.setup);
  const items = Object.values(setup.sets)
    .flat()
    .map((unit) => ({
      id: unit,
      unit,
      file: `${unit}.txt`,
      ...(unit === options.critical ? { critical: true } : {}),
    }));
  const helper = `import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const out = process.env.RATCHET_OUT; mkdirSync(out, { recursive: true });
const items = ${JSON.stringify(items)};
for (const item of items) writeFileSync(out + '/' + item.file, item.id + ': ' + readFileSync('target.txt', 'utf8'));
writeFileSync(out + '/items.json', JSON.stringify({ items }));\n`;
  git("init", "-b", "main");
  git("config", "user.email", "test@example.test");
  git("config", "user.name", "Ratchet test");
  write(".gitignore", ".run/\n");
  write("target.txt", "baseline");
  git("add", ".");
  git("commit", "-m", "baseline");
  write(".run/helper.mjs", helper);
  write(".run/input.json", setup);
  write(".run/ref/items.json", { items });
  for (const item of items) write(`.run/ref/${item.file}`, `reference ${item.id}`);
  function raw(args) {
    return spawnSync(
      process.execPath,
      [cli, ...args, ...(args.includes("--run") ? [] : ["--run", ".run"])],
      { cwd: root, encoding: "utf8" },
    );
  }
  function run(...args) {
    const result = raw(args);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return args[0] === "report" ? result.stdout : JSON.parse(result.stdout);
  }
  function fail(pattern, ...args) {
    const result = raw(args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, pattern);
  }
  const record = (event, ...args) => run("record", event, ...args);
  const tick = () => run("tick");
  const journal = () => read(".run/journal.jsonl").trim().split("\n").map(JSON.parse);
  function judge(action, verdict = "loss", recommendations = true) {
    if (action.kind === "launch-judge")
      record("launched", "--session", action.session, "--receipt", `receipt-${action.session}`);
    const session = journal().findLast(
      (e) => e.type === "session-staged" && e.session.id === action.session,
    ).session;
    if (session.family.endsWith("-crit")) {
      const issues = Array.isArray(recommendations)
        ? recommendations
        : recommendations
          ? session.items.slice(0, 2).map((item) => ({
              criterion: "quality",
              item: item.id,
              severity: "high",
              issue: "Action is unclear",
              fix: `Use a clear action for ${item.id}`,
            }))
          : [];
      write(path.relative(root, path.join(session.directory, "critique.json")), { issues });
    } else {
      const verdicts = session.pairs.map((p) => {
        const result = p.duplicate ? "tie" : typeof verdict === "function" ? verdict(p) : verdict;
        return {
          pair: p.pair,
          criterion: "quality",
          observations: `${p.set === "working" ? "WORKING" : "HELDOUT"} observation for ${p.item}`,
          verdict:
            result === "tie"
              ? "same"
              : result === "win"
                ? p.currentSide
                : p.currentSide === "A"
                  ? "B"
                  : "A",
        };
      });
      write(path.relative(root, path.join(session.directory, "verdicts.json")), { verdicts });
    }
    record("judged", "--session", action.session);
  }
  function calibrate() {
    assert.equal(tick().actions[0].kind, "capture");
    run("capture");
    const actions = tick().actions;
    assert.equal(actions.length, setup.references?.length ? 6 : 2);
    actions.forEach((a) => judge(a));
    const approval = tick();
    assert.equal(approval.status, "awaiting-approval");
    assert.match(
      approval.actions[0].summary,
      setup.references?.length ? /position bias.*duplicate tie rate/s : /No references were set/,
    );
    record("approved");
    return tick();
  }
  function candidate(content) {
    const previous = git("rev-parse", "HEAD");
    write("target.txt", content);
    git("add", "target.txt");
    git("commit", "-m", content);
    const commit = git("rev-parse", "HEAD");
    git("reset", "--hard", previous);
    return commit;
  }
  function implement(content = "candidate", units) {
    const plan = tick().actions[0];
    assert.equal(plan.kind, "plan");
    record(
      "plan",
      "--recs",
      plan.recommendations[0].id,
      "--targets",
      "quality",
      ...(units ? ["--units", units] : []),
    );
    const launch = tick().actions[0];
    assert.equal(launch.kind, "launch-implementer");
    record("launched", "--session", launch.session, "--receipt", `receipt-${launch.session}`);
    const commit = candidate(content);
    record("implemented", "--commit", commit);
    assert.equal(tick().actions[0].kind, "capture");
    run("capture");
    return { commit, actions: tick().actions, launch };
  }
  function keep(content = "kept") {
    const round = implement(content);
    round.actions.forEach((a) => judge(a, "win"));
    const refs = tick().actions;
    assert.equal(refs.length, 2);
    refs.forEach((a) =>
      judge(a, (p) => (p.set === "validation" ? "tie" : p.item === "working0" ? "loss" : "win")),
    );
    assert.equal(tick().actions[0].kind, "run-full-gate");
    record("checked", "--result", "pass");
    const comment = tick().actions[0];
    assert.equal(comment.kind, "comment");
    record("commented", "--round", String(journal().filter((e) => e.type === "plan").length));
    tick()
      .actions.filter((a) => a.kind === "launch-judge")
      .forEach((a) => judge(a));
    tick();
    return round;
  }
  function finish() {
    record("stop");
    const actions = tick().actions;
    assert.equal(actions.length, 4);
    actions.forEach((a) => judge(a, "win"));
    const publish = tick().actions[0];
    assert.equal(publish.kind, "publish");
    return publish;
  }
  if (initialize) run("init", "--setup", file(".run/input.json"));
  return {
    root,
    file,
    write,
    read,
    git,
    setup,
    helper,
    raw,
    run,
    record,
    fail,
    tick,
    journal,
    judge,
    calibrate,
    candidate,
    implement,
    keep,
    finish,
  };
}
