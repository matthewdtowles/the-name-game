import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { createRoom } from "@tng/shared";
import { mockClient } from "aws-sdk-client-mock";

import { DynamoStore } from "./dynamoStore";
import type { RoomRecord } from "./store";

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-east-1" }),
);
const ddb = mockClient(client);
const NOW = 1_700_000_000_000;
const store = new DynamoStore("Rooms", client, () => NOW);

const record: RoomRecord = {
  room: createRoom({
    code: "WXYZ",
    tier: "free",
    host: { id: "p1", sessionToken: "t1", displayName: "Sam" },
  }),
  connections: { p1: "c1" },
  displays: ["tv1"],
  version: 2,
};

beforeEach(() => ddb.reset());

describe("DynamoStore", () => {
  it("creates a room only if the code is free", async () => {
    ddb.on(PutCommand).resolves({});
    assert.equal(await store.putRoom({ ...record, version: 1 }, null), true);
    const input = ddb.commandCalls(PutCommand)[0]!.args[0].input;
    assert.equal(input.ConditionExpression, "attribute_not_exists(pk)");
    assert.equal(input.Item?.pk, "ROOM#WXYZ");
  });

  it("updates a room only if nobody else has since", async () => {
    ddb.on(PutCommand).resolves({});
    await store.putRoom(record, 1);
    const input = ddb.commandCalls(PutCommand)[0]!.args[0].input;
    assert.equal(input.ConditionExpression, "version = :expected");
    assert.deepEqual(input.ExpressionAttributeValues, { ":expected": 1 });
    assert.equal(input.Item?.version, 2);
  });

  it("reports a lost race as a conflict, not an error", async () => {
    ddb
      .on(PutCommand)
      .rejects(
        new ConditionalCheckFailedException({ message: "no", $metadata: {} }),
      );
    assert.equal(await store.putRoom(record, 1), false);
  });

  it("passes other failures through", async () => {
    ddb.on(PutCommand).rejects(new Error("throttled"));
    await assert.rejects(store.putRoom(record, 1), /throttled/);
  });

  it("expires items a day after the last write", async () => {
    ddb.on(PutCommand).resolves({});
    await store.putRoom(record, 1);
    await store.putBinding("c1", { code: "WXYZ", playerId: "p1" });
    for (const call of ddb.commandCalls(PutCommand)) {
      assert.equal(
        call.args[0].input.Item?.expiresAt,
        NOW / 1000 + 24 * 60 * 60,
      );
    }
  });

  it("reads rooms with strong consistency and round-trips them", async () => {
    ddb.on(GetCommand).resolves({
      Item: { pk: "ROOM#WXYZ", ...record, expiresAt: 1 },
    });
    assert.deepEqual(await store.getRoom("WXYZ"), record);
    assert.equal(
      ddb.commandCalls(GetCommand)[0]!.args[0].input.ConsistentRead,
      true,
    );
  });

  it("returns null for a missing room or binding", async () => {
    ddb.on(GetCommand).resolves({});
    assert.equal(await store.getRoom("ZZZZ"), null);
    assert.equal(await store.getBinding("nope"), null);
  });

  it("counts hits per window and expires each window's counter", async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { hits: 3 } });
    assert.equal(await store.hit("entry:1.2.3.4", 600), 3);
    const input = ddb.commandCalls(UpdateCommand)[0]!.args[0].input;
    const window = Math.floor(NOW / 1000 / 600);
    assert.deepEqual(input.Key, { pk: `LIMIT#entry:1.2.3.4#${window}` });
    assert.equal(
      input.ExpressionAttributeValues?.[":expires"],
      (window + 1) * 600,
    );
  });

  it("adds usage to the day's counters and keeps them", async () => {
    ddb.on(UpdateCommand).resolves({});
    await store.tally({ gamesStarted: 1, players: 5 });
    const input = ddb.commandCalls(UpdateCommand)[0]!.args[0].input;
    assert.deepEqual(input.Key, { pk: "STATS#2023-11-14" });
    assert.equal(
      input.UpdateExpression,
      "ADD gamesStarted :gamesStarted, players :players",
    );
    assert.deepEqual(input.ExpressionAttributeValues, {
      ":gamesStarted": 1,
      ":players": 5,
    });
  });
});
