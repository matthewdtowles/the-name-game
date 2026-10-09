import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

import type { Binding, RoomRecord, Store } from "./store";

// One table, keyed by `pk`: ROOM#<code> holds a room and its connections,
// CONN#<connectionId> says which room and player a socket speaks for. Every
// write pushes `expiresAt` out a day, so DynamoDB's TTL deletes a game a day
// after its last activity.

const TTL_SECONDS = 24 * 60 * 60;

export class DynamoStore implements Store {
  constructor(
    private readonly tableName: string,
    private readonly client = DynamoDBDocumentClient.from(
      new DynamoDBClient({}),
      {
        marshallOptions: { removeUndefinedValues: true },
      },
    ),
    private readonly now: () => number = Date.now,
  ) {}

  async getRoom(code: string): Promise<RoomRecord | null> {
    const { Item } = await this.client.send(
      // Strongly consistent: optimistic concurrency needs the latest version.
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: roomKey(code) },
        ConsistentRead: true,
      }),
    );
    if (!Item) return null;
    return {
      room: Item.room,
      connections: Item.connections,
      displays: Item.displays ?? [],
      version: Item.version,
    };
  }

  async putRoom(
    record: RoomRecord,
    expectedVersion: number | null,
  ): Promise<boolean> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: roomKey(record.room.code),
            room: record.room,
            connections: record.connections,
            displays: record.displays,
            version: record.version,
            expiresAt: this.expiry(),
          },
          ...(expectedVersion === null
            ? { ConditionExpression: "attribute_not_exists(pk)" }
            : {
                ConditionExpression: "version = :expected",
                ExpressionAttributeValues: { ":expected": expectedVersion },
              }),
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async deleteRoom(code: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { pk: roomKey(code) },
      }),
    );
  }

  async getBinding(connectionId: string): Promise<Binding | null> {
    const { Item } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: connectionKey(connectionId) },
      }),
    );
    return Item ? { code: Item.code, playerId: Item.playerId ?? null } : null;
  }

  async putBinding(connectionId: string, binding: Binding): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: connectionKey(connectionId),
          ...binding,
          expiresAt: this.expiry(),
        },
      }),
    );
  }

  async deleteBinding(connectionId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { pk: connectionKey(connectionId) },
      }),
    );
  }

  private expiry(): number {
    return Math.floor(this.now() / 1000) + TTL_SECONDS;
  }
}

function roomKey(code: string): string {
  return `ROOM#${code}`;
}

function connectionKey(connectionId: string): string {
  return `CONN#${connectionId}`;
}
