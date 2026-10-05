import assert from "node:assert/strict";
import test from "node:test";
import { buildIssueCatalog } from "../skills/ziw-orchestrate/scripts/issue-catalog.mjs";
import {
  coversIssue,
  possibleIssueLinks,
} from "../skills/ziw-orchestrate/scripts/delivery-identity.mjs";
import { normalizePlannerModel } from "../skills/ziw-orchestrate/scripts/planner-model.mjs";

const uuid = "11111111-2222-4333-8444-555555555555";
const otherUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const catalogFor = (records) =>
  buildIssueCatalog(records.map((record, index) => ({ record, path: `tracker/${index}` })));

const permutations = (values) =>
  values.length === 0
    ? [[]]
    : values.flatMap((value, index) =>
        permutations(values.filter((_, position) => position !== index)).map((rest) => [
          value,
          ...rest,
        ]),
      );

test("tracker aliases resolve typed UUID and key references independently of record order", () => {
  const records = [{ issueUuid: uuid }, { issueKey: "ZAK-12", issueUuid: uuid }];
  for (const ordering of [records, records.toReversed()]) {
    const catalog = catalogFor(ordering);
    assert.equal(catalog.resolve({ issueUuid: uuid.toUpperCase() }).issueRef, "ZAK-12");
    assert.equal(catalog.resolve({ issueKey: "zak-12" }).issueRef, "ZAK-12");
    assert.equal(catalog.has(uuid), true);
    assert.equal(catalog.has("ZAK-12"), true);
  }
});

test("a UUID-only tracker record is an exact issue identity", () => {
  const catalog = catalogFor([{ issueUuid: uuid }]);
  assert.equal(catalog.resolve({ issueUuid: uuid }).issueRef, uuid);
  assert.equal(catalog.has(uuid), true);
  assert.equal(catalog.resolve({ issueUuid: otherUuid }).issueRef, otherUuid);
  assert.equal(catalog.has(otherUuid), false);
});

test("partial tracker observations and their duplicates produce one authoritative alias", () => {
  const records = [
    { issueKey: "ZAK-12" },
    { issueUuid: uuid },
    { issueKey: "ZAK-12", issueUuid: uuid },
  ];
  for (const ordering of permutations(records)) {
    for (const repeated of [ordering, [...ordering, ...ordering.toReversed()]]) {
      const catalog = catalogFor(repeated);
      for (const reference of records)
        assert.deepEqual(catalog.resolve(reference), {
          issueRef: "ZAK-12",
          issueKey: "ZAK-12",
          issueUuid: uuid,
          unresolvedUuid: false,
        });
    }
  }
});

test("an unverifiable UUID beside a dedicated key supports only that local association", () => {
  const catalog = catalogFor([{ issueKey: "ZAK-12" }]);
  assert.equal(catalog.resolve({ issueKey: "ZAK-12", issueUuid: uuid }).issueRef, "ZAK-12");
  assert.equal(catalog.resolve({ issueUuid: uuid }).issueRef, uuid);
  assert.equal(catalog.has(uuid), false);
});

test("separately known unpaired UUID and key retain a local mixed association without an alias", () => {
  for (const ordering of permutations([{ issueKey: "ZAK-12" }, { issueUuid: uuid }])) {
    const catalog = catalogFor(ordering);
    assert.equal(catalog.resolve({ issueKey: "ZAK-12", issueUuid: uuid }).issueRef, "ZAK-12");
    assert.equal(catalog.resolve({ issueUuid: uuid }).issueRef, uuid);
    assert.equal(catalog.resolve({ issueKey: "ZAK-12" }).issueUuid, null);
  }
});

test("verified contradictions identify the offending field path instead of choosing precedence", () => {
  const catalog = catalogFor([{ issueKey: "ZAK-12", issueUuid: uuid }]);
  assert.throws(
    () => catalog.resolve({ issueKey: "ZAK-13", issueUuid: uuid }, "state/workers/0"),
    /state\/workers\/0.*contradict/i,
  );
  assert.throws(
    () => catalog.resolve({ issueKey: "ZAK-12", issueUuid: otherUuid }, "snapshot/prs/1"),
    /snapshot\/prs\/1.*contradict/i,
  );
  assert.throws(
    () =>
      catalogFor([
        { issueKey: "ZAK-12", issueUuid: uuid },
        { issueKey: "ZAK-13", issueUuid: uuid },
      ]),
    /tracker\/1.*contradict/i,
  );
});

test("delivery matching consumes resolved references and treats possible links conservatively", () => {
  assert.equal(coversIssue({ issueRef: "ZAK-12" }, "ZAK-12"), true);
  assert.equal(coversIssue({ issueRefs: ["ZAK-12", "ZAK-13"] }, "ZAK-13"), true);
  const hinted = { possibleIssueRefs: ["ZAK-12"] };
  assert.equal(coversIssue(hinted, "ZAK-12"), true);
  assert.equal(coversIssue(hinted, "ZAK-12", { includePossible: false }), false);
  assert.equal(coversIssue({ receiptId: "ZAK-12", sessionId: uuid }, "ZAK-12"), false);
  assert.equal(coversIssue({ issueKey: "ZAK-12" }, "ZAK-12"), false);
});

test("text can hint at catalog keys but never invent issues or override explicit references", () => {
  const catalog = catalogFor([{ issueKey: "ZAK-12", issueUuid: uuid }]);
  assert.deepEqual(possibleIssueLinks({ branch: "codex/phase-2-zak-12-entry-browsing" }, catalog), [
    "ZAK-12",
  ]);
  assert.deepEqual(possibleIssueLinks({ path: "/tmp/review-main-2855565" }, catalog), []);
  assert.deepEqual(possibleIssueLinks({ path: `/tmp/${uuid}` }, catalog), []);
  assert.deepEqual(possibleIssueLinks({ issueRef: "ZAK-13", title: "ZAK-12 work" }, catalog), []);
});

test("worker and PR associations cannot create tracker UUID aliases", () => {
  const model = normalizePlannerModel({
    snapshot: {
      v: 3,
      linear: { issues: [{ issueKey: "ZAK-12" }] },
      prs: [{ number: 22, issueKey: "ZAK-12", issueUuid: uuid }],
    },
    state: {
      workers: [
        { sessionId: "first", issueKey: "ZAK-12", issueUuid: uuid },
        { sessionId: "second", issueUuid: uuid },
      ],
    },
  });
  assert.equal(model.state.workers[0].issueRef, "ZAK-12");
  assert.equal(model.state.workers[1].issueRef, uuid);
  assert.equal(model.snapshot.prs[0].issueRef, "ZAK-12");
  assert.ok(model.diagnostics.some((entry) => entry.code === "ISSUE_ALIAS_REQUIRED"));
});

test("opaque legacy receipt IDs remain distinct from the dedicated issue reference", () => {
  for (const id of ["ZAK-13", uuid, "dispatch-1"]) {
    const model = normalizePlannerModel({
      snapshot: { v: 2, linear: { issues: [{ identifier: "ZAK-12" }] } },
      state: { dispatches: [{ id, issueId: "ZAK-12", state: "running" }] },
    });
    assert.equal(model.state.dispatches[0].issueRef, "ZAK-12");
    assert.equal(model.state.dispatches[0].workerRef, `receipt:${id}`);
  }
});

test("generic receipt IDs without dedicated issue fields never establish an association", () => {
  for (const id of ["ZAK-12", uuid, "dispatch-1"]) {
    const model = normalizePlannerModel({
      snapshot: { v: 2, linear: { issues: [{ identifier: "ZAK-12", id: uuid }] } },
      state: { dispatches: [{ id, state: "running" }] },
    });
    assert.equal(model.state.dispatches[0].issueRef, null);
    assert.equal(model.state.dispatches[0].workerRef, `receipt:${id}`);
    assert.ok(model.diagnostics.some((entry) => entry.code === "WORKER_ISSUE_UNRESOLVED"));
  }
});
