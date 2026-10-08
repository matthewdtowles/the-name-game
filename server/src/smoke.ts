import assert from "node:assert/strict";

import { ServerMessage, type ClientMessage } from "@tng/shared";
import { WebSocket } from "ws";

// Plays a short game against a running server and fails loudly if anything is
// off: `npm run smoke -w @tng/server -- wss://...`. CI runs it against staging
// before deploying prod.

const url = process.argv[2] ?? "ws://localhost:8787";

class Player {
  private socket: WebSocket;
  private inbox: ServerMessage[] = [];
  private waiters: (() => void)[] = [];

  constructor(readonly name: string) {
    this.socket = new WebSocket(url);
    this.socket.on("message", (data) => {
      this.inbox.push(ServerMessage.parse(JSON.parse(data.toString())));
      this.waiters.splice(0).forEach((wake) => wake());
    });
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  // Waits for the next message matching `match`, consuming everything before it.
  async next<T extends ServerMessage>(
    match: (m: ServerMessage) => m is T,
    label: string,
  ): Promise<T> {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const index = this.inbox.findIndex(match);
      if (index >= 0) return this.inbox.splice(0, index + 1).at(-1) as T;
      if (Date.now() > deadline)
        throw new Error(`${this.name} never got ${label}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 250);
      });
    }
  }

  close(): void {
    this.socket.close();
  }
}

const isType =
  <K extends ServerMessage["type"]>(type: K) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: K }> =>
    m.type === type;
const roomWhere =
  (test: (room: Extract<ServerMessage, { type: "room" }>["room"]) => boolean) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: "room" }> =>
    m.type === "room" && test(m.room);

async function main() {
  const host = new Player("host");
  const guest = new Player("guest");
  await Promise.all([host.opened(), guest.opened()]);

  host.send({ type: "create", displayName: "Smoke Host" });
  const { code } = await host.next(isType("welcome"), "a welcome");
  guest.send({ type: "join", code, displayName: "Smoke Guest" });
  await guest.next(isType("welcome"), "a welcome");

  host.send({ type: "submitName", name: "Dolly Parton" });
  await host.next(
    roomWhere((r) => r.you.submittedName === "Dolly Parton"),
    "its name",
  );
  guest.send({ type: "submitName", name: "dolly parton" });
  const duplicate = await guest.next(isType("error"), "a duplicate error");
  assert.equal(duplicate.reason, "duplicate_name");
  guest.send({ type: "submitName", name: "Cher" });
  await host.next(
    roomWhere((r) => r.players.every((p) => p.submitted)),
    "everyone submitted",
  );

  host.send({ type: "startReveal" });
  const hostView = await host.next(
    roomWhere((r) => r.phase === "reveal"),
    "the reveal",
  );
  assert.deepEqual([...(hostView.room.names ?? [])].sort(), [
    "Cher",
    "Dolly Parton",
  ]);
  const guestView = await guest.next(
    roomWhere((r) => r.phase === "reveal"),
    "the reveal",
  );
  assert.equal(guestView.room.names, null, "only the host sees the names");

  host.send({ type: "finishReveal" });
  await guest.next(
    roomWhere((r) => r.phase === "play"),
    "play",
  );

  guest.send({ type: "leave" });
  await guest.next(isType("removed"), "removal");
  host.send({ type: "leave" });
  await host.next(isType("removed"), "removal");
  host.close();
  guest.close();
  console.log(`Smoke test passed against ${url} (room ${code})`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
