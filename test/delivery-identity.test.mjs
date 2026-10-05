import assert from "node:assert/strict";
import test from "node:test";
import {
  issueIdentityIndex,
  issueIdentifier,
  itemMentionsIssue,
} from "../skills/ziw-orchestrate/scripts/delivery-identity.mjs";

const uuid = "11111111-2222-4333-8444-555555555555";
const otherUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

test("tracker aliases resolve UUID receipts to the canonical key regardless of record order", () => {
  for (const records of [
    [{ issueId: uuid }, { id: uuid, identifier: "ZAK-12" }],
    [{ id: uuid, identifier: "ZAK-12" }, { issueId: uuid }],
  ]) {
    const index = issueIdentityIndex(records);
    assert.equal(issueIdentifier({ issueId: uuid }, index), "ZAK-12");
    assert.equal(itemMentionsIssue({ issueId: uuid }, "ZAK-12", index), true);
    assert.equal(itemMentionsIssue({ issueId: "ZAK-12" }, uuid, index), true);
  }
});

test("unresolved explicit UUIDs match exactly and never fall through to conflicting branch text", () => {
  const index = issueIdentityIndex([{ issueId: uuid }]);
  assert.equal(itemMentionsIssue({ issueId: uuid.toUpperCase() }, uuid, index), true);
  assert.equal(
    itemMentionsIssue({ issueId: otherUuid, branch: `feat/${uuid}` }, uuid, index),
    false,
  );
  assert.equal(
    itemMentionsIssue({ issueId: otherUuid, branch: "feat/zak-12" }, "ZAK-12", index),
    false,
  );
});

test("an unresolved UUID cannot hide a ticket key in another explicit field", () => {
  const index = issueIdentityIndex([{ identifier: "ZAK-12" }]);
  const fields = ["issueId", "identifier", "ticket", "key"];
  for (const [position, uuidField] of fields.entries()) {
    for (const keyField of fields.slice(position + 1)) {
      const receipt = { [uuidField]: uuid, [keyField]: "zak-12", branch: "feat/zak-13" };
      assert.equal(issueIdentifier(receipt, index), "ZAK-12");
      assert.equal(itemMentionsIssue(receipt, "ZAK-12", index), true);
      assert.equal(itemMentionsIssue(receipt, "ZAK-13", index), false);
      assert.equal(index.has(uuid), false);
    }
  }
});

test("generic receipt IDs cannot override unresolved dedicated issue UUIDs", () => {
  for (const id of ["dispatch-1", "agent-1", otherUuid]) {
    const receipt = { issueId: uuid, id };
    const index = issueIdentityIndex([{ id: uuid }], [receipt]);
    assert.equal(issueIdentifier(receipt, index), uuid);
    assert.equal(itemMentionsIssue(receipt, uuid, index), true);
  }
});

test("an unresolved UUID cannot hide a later tracker-resolved UUID", () => {
  const index = issueIdentityIndex([{ id: otherUuid, identifier: "ZAK-12" }]);
  assert.equal(issueIdentifier({ issueId: uuid, identifier: otherUuid }, index), "ZAK-12");
});

test("tracker-resolved explicit identities retain precedence over conflicting later keys", () => {
  const index = issueIdentityIndex([{ id: uuid, identifier: "ZAK-13" }]);
  const receipt = { issueId: uuid, identifier: "ZAK-12" };
  assert.equal(issueIdentifier(receipt, index), "ZAK-13");
  assert.equal(itemMentionsIssue(receipt, "ZAK-12", index), false);
});

test("UUID-shaped path text never creates an explicit delivery identity", () => {
  const index = issueIdentityIndex([{ id: uuid, identifier: "ZAK-12" }]);
  assert.equal(issueIdentifier({ path: `/tmp/${uuid}` }, index), null);
  assert.equal(itemMentionsIssue({ path: `/tmp/${uuid}` }, uuid), false);
});

test("contradictory tracker aliases fail loudly", () => {
  assert.throws(
    () =>
      issueIdentityIndex([
        { id: uuid, identifier: "ZAK-12" },
        { id: uuid, identifier: "ZAK-13" },
      ]),
    /conflicting tracker UUID/,
  );
});

test("worker receipt UUIDs cannot create or conflict with tracker aliases", () => {
  const index = issueIdentityIndex(
    [{ id: uuid, identifier: "ZAK-12" }],
    [
      { id: otherUuid, issueId: "ZAK-12" },
      { id: otherUuid, issueId: "ZAK-13" },
    ],
  );
  assert.equal(issueIdentifier({ id: otherUuid }, index), null);
  assert.equal(itemMentionsIssue({ id: otherUuid, branch: "feat/zak-12" }, "ZAK-12", index), true);
  assert.equal(issueIdentifier({ id: uuid }, index), "ZAK-12");
});
