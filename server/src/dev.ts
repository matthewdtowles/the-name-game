import { randomUUID } from "node:crypto";

import { WebSocket, WebSocketServer } from "ws";

import { handleDisconnect, handleMessage, type Deps } from "./handler";
import { MemoryStore } from "./memoryStore";

// The game server on localhost: the same handler the Lambda runs, over a plain
// WebSocket with rooms in memory. Restarting it ends every game.

const port = Number(process.env.PORT ?? 8787);
const sockets = new Map<string, WebSocket>();

const deps: Deps = {
  store: new MemoryStore(),
  send: async (connectionId, message) => {
    const socket = sockets.get(connectionId);
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  },
};

const server = new WebSocketServer({ port });

server.on("connection", (socket) => {
  const connectionId = randomUUID();
  sockets.set(connectionId, socket);
  // Handle each connection's events in arrival order, as API Gateway does.
  let queue = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    queue = queue.then(work).catch((error: unknown) => console.error(error));
  };
  socket.on("message", (data) => {
    enqueue(() => handleMessage(deps, connectionId, data.toString()));
  });
  socket.on("close", () => {
    enqueue(async () => {
      sockets.delete(connectionId);
      await handleDisconnect(deps, connectionId);
    });
  });
});

server.on("listening", () =>
  console.log(`Game server on ws://localhost:${port}`),
);
