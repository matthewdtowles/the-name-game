import type { ScreenView, ServerMessage } from "@tng/shared";

import { type CodeStorage, ScreenClient } from "../lib/game/screenClient";

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
  receive(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const screen: ScreenView = {
  code: "WXYZ",
  phase: "lobby",
  hostId: null,
  players: [],
  remindersLeft: 1,
  reveal: null,
  game: null,
};

let stored: string | null;
const storage: CodeStorage = {
  load: () => stored,
  save: (code) => void (stored = code),
  clear: () => void (stored = null),
};

function makeClient(code?: string) {
  return new ScreenClient({
    url: "ws://test",
    storage,
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
    code,
  });
}

const latest = () => FakeSocket.all.at(-1)!;

beforeEach(() => {
  FakeSocket.all = [];
  stored = null;
});

it("opens a new room when it has none", () => {
  makeClient().start();
  latest().open();
  expect(latest().sent).toEqual([{ type: "display" }]);
});

it("goes back to the room it remembers, or the one in its link", () => {
  stored = "ABCD";
  makeClient().start();
  latest().open();
  expect(latest().sent).toEqual([{ type: "display", code: "ABCD" }]);

  makeClient("WXYZ").start();
  latest().open();
  expect(latest().sent).toEqual([{ type: "display", code: "WXYZ" }]);
});

it("remembers its room and shows the screen", () => {
  const client = makeClient();
  client.start();
  latest().open();
  latest().receive({ type: "watching", code: "WXYZ" });
  latest().receive({ type: "screen", screen });
  expect(stored).toBe("WXYZ");
  expect(client.getState().screen).toEqual(screen);
});

it("opens a new room when the remembered one has ended", () => {
  stored = "ABCD";
  makeClient().start();
  latest().open();
  latest().receive({
    type: "error",
    reason: "room_not_found",
    message: "Gone",
  });
  expect(stored).toBeNull();
  expect(latest().sent).toEqual([
    { type: "display", code: "ABCD" },
    { type: "display" },
  ]);
});

it("starts a new game on a fresh socket", () => {
  const client = makeClient();
  client.start();
  latest().open();
  latest().receive({ type: "watching", code: "WXYZ" });
  latest().receive({ type: "screen", screen });
  client.newGame();
  expect(FakeSocket.all).toHaveLength(2);
  expect(client.getState().screen).toBeNull();
  latest().open();
  expect(latest().sent).toEqual([{ type: "display" }]);
  client.stop();
});
