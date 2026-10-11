import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
} from "aws-lambda";

import { DynamoStore } from "./dynamoStore";
import {
  handleDisconnect,
  handleMessage,
  MESSAGE_WINDOW_MS,
  type Deps,
} from "./handler";
import { MessageLimiter } from "./limiter";

// The API Gateway WebSocket entry point: the same handler as the dev server,
// with DynamoDB for state and the management API for pushing to sockets.

const connections = new ApiGatewayManagementApiClient({
  endpoint: requireEnv("CONNECTIONS_URL"),
});

const deps: Deps = {
  store: new DynamoStore(requireEnv("TABLE_NAME")),
  limiter: new MessageLimiter(MESSAGE_WINDOW_MS),
  send: async (connectionId, message) => {
    try {
      await connections.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: JSON.stringify(message),
        }),
      );
    } catch (error) {
      // The socket closed before we could reach it; $disconnect cleans up.
      if (!(error instanceof GoneException)) throw error;
    }
  },
};

export async function handler(
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResultV2> {
  const { connectionId, routeKey } = event.requestContext;
  // WebSocket events carry the caller's address, though the types omit it.
  const { identity } = event.requestContext as {
    identity?: { sourceIp?: string };
  };
  if (routeKey === "$disconnect") await handleDisconnect(deps, connectionId);
  else if (routeKey !== "$connect")
    await handleMessage(
      deps,
      connectionId,
      event.body ?? "",
      identity?.sourceIp ?? connectionId,
    );
  return { statusCode: 200 };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
