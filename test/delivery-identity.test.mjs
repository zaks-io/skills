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
