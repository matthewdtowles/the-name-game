import type { RoomView, ServerMessage } from "@tng/shared";

import {
  GameClient,
  HEARTBEAT_MS,
  RECONNECT_DELAYS_MS,
  type Session,
  type SessionStorage,
} from "../lib/game/client";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: unknown[] = [];

  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: ServerMessage | string) {
    this.onmessage?.({
      data: typeof message === "string" ? message : JSON.stringify(message),
    });
  }
}

const session: Session = { code: "WXYZ", playerId: "p1", sessionToken: "t1" };
const room: RoomView = {
  code: "WXYZ",
  phase: "lobby",
  tier: "free",
  settings: { reminders: 1, revealSeconds: null },
  hostId: "p1",
  players: [
    { id: "p1", displayName: "Sam", connected: true, submitted: false },
  ],
  you: { playerId: "p1", submittedName: null },
  remindersLeft: 1,
  reveal: null,
  tv: false,
};

let stored: Session | null;
const storage: SessionStorage = {
  load: async () => stored,
  save: async (s) => void (stored = s),
  clear: async () => void (stored = null),
};

function makeClient() {
  return new GameClient({
    url: "ws://test",
    storage,
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
  });
}

const latest = () => FakeSocket.all.at(-1)!;
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  FakeSocket.all = [];
  stored = null;
});

afterEach(() => jest.useRealTimers());

it("resumes a stored session as soon as the socket opens", async () => {
  stored = session;
  const client = makeClient();
  await client.start();
  latest().open();
  expect(latest().sent).toEqual([
    { type: "resume", code: "WXYZ", sessionToken: "t1" },
  ]);
  expect(client.getState().status).toBe("open");
});

it("stores the session from welcome and tracks the room", async () => {
  const client = makeClient();
  await client.start();
  latest().open();
  expect(latest().sent).toEqual([]);
  latest().receive({ type: "welcome", ...session });
  latest().receive({ type: "room", room });
  await flush();
  expect(stored).toEqual(session);
  expect(client.getState()).toMatchObject({ session, room });
});

it("reconnects with backoff and resumes after a drop", async () => {
  const client = makeClient();
  await client.start();
  latest().open();
  latest().receive({ type: "welcome", ...session });
  await flush();

  latest().close();
  expect(client.getState().status).toBe("closed");
  jest.advanceTimersByTime(RECONNECT_DELAYS_MS[0]!);
  expect(FakeSocket.all).toHaveLength(2);
  latest().open();
  expect(latest().sent).toEqual([
    { type: "resume", code: "WXYZ", sessionToken: "t1" },
  ]);
});

it("backs off further on repeated failures", async () => {
  const client = makeClient();
  await client.start();
  latest().close();
  jest.advanceTimersByTime(RECONNECT_DELAYS_MS[0]!);
  latest().close();
  jest.advanceTimersByTime(RECONNECT_DELAYS_MS[1]! - 1);
  expect(FakeSocket.all).toHaveLength(2);
  jest.advanceTimersByTime(1);
  expect(FakeSocket.all).toHaveLength(3);
  client.stop();
});

it("forgets the game when the player is removed", async () => {
  stored = session;
  const client = makeClient();
  await client.start();
  latest().open();
  latest().receive({ type: "room", room });
  latest().receive({ type: "removed" });
  await flush();
  expect(stored).toBeNull();
  expect(client.getState()).toMatchObject({ session: null, room: null });
});

it("forgets an expired session and reports why", async () => {
  stored = session;
  const client = makeClient();
  await client.start();
  latest().open();
  latest().receive({
    type: "error",
    reason: "session_expired",
    message: "Gone",
  });
  await flush();
  expect(stored).toBeNull();
  expect(client.getState().error).toEqual({
    reason: "session_expired",
    message: "Gone",
  });
});

it("keeps other errors until the next action", async () => {
  const client = makeClient();
  await client.start();
  latest().open();
  latest().receive({
    type: "error",
    reason: "duplicate_name",
    message: "Taken",
  });
  await flush();
  expect(client.getState().error?.reason).toBe("duplicate_name");
  client.send({ type: "submitName", name: "Prince" });
  expect(client.getState().error).toBeNull();
});

it("ignores malformed messages and messages from a replaced socket", async () => {
  const client = makeClient();
  await client.start();
  const first = latest();
  first.open();
  first.receive("not json");
  first.receive(JSON.stringify({ type: "room", room: { nope: true } }));
  expect(client.getState().room).toBeNull();

  first.close();
  jest.advanceTimersByTime(RECONNECT_DELAYS_MS[0]!);
  first.receive({ type: "room", room });
  expect(client.getState().room).toBeNull();
});

it("refuses to send while disconnected", async () => {
  const client = makeClient();
  await client.start();
  expect(client.send({ type: "startReveal" })).toBe(false);
  latest().open();
  expect(client.send({ type: "startReveal" })).toBe(true);
});

it("sends a heartbeat while connected", async () => {
  const client = makeClient();
  await client.start();
  latest().open();
  jest.advanceTimersByTime(HEARTBEAT_MS * 2);
  expect(latest().sent).toEqual([{ type: "ping" }, { type: "ping" }]);
  client.stop();
});

it("stays down once stopped", async () => {
  const client = makeClient();
  await client.start();
  latest().open();
  client.stop();
  jest.advanceTimersByTime(60_000);
  expect(FakeSocket.all).toHaveLength(1);
});
