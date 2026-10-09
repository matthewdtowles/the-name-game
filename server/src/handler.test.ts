import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type { ClientMessage, ServerMessage } from "@tng/shared";

import { handleDisconnect, handleMessage, type Deps } from "./handler";
import { MemoryStore } from "./memoryStore";

let deps: Deps;
let inbox: Map<string, ServerMessage[]>;

beforeEach(() => {
  inbox = new Map();
  deps = {
    store: new MemoryStore(),
    send: async (connectionId, message) => {
      inbox.set(connectionId, [...(inbox.get(connectionId) ?? []), message]);
    },
  };
});

function send(connectionId: string, message: ClientMessage) {
  return handleMessage(deps, connectionId, JSON.stringify(message));
}

function last<T extends ServerMessage["type"]>(connectionId: string, type: T) {
  const found = (inbox.get(connectionId) ?? [])
    .filter((m) => m.type === type)
    .at(-1);
  assert.ok(found, `${connectionId} got no ${type} message`);
  return found as Extract<ServerMessage, { type: T }>;
}

async function hostAndJoin() {
  await send("c-host", { type: "create", displayName: "Sam" });
  const { code } = last("c-host", "welcome");
  await send("c-alex", { type: "join", code, displayName: "Alex" });
  return code;
}

describe("entering a room", () => {
  it("creates a room and welcomes the host", async () => {
    await send("c-host", { type: "create", displayName: "Sam" });
    const welcome = last("c-host", "welcome");
    assert.match(welcome.code, /^[A-Z]{4}$/);
    const { room } = last("c-host", "room");
    assert.equal(room.hostId, welcome.playerId);
    assert.equal(room.players.length, 1);
  });

  it("lets others join by code and tells everyone", async () => {
    await hostAndJoin();
    assert.equal(last("c-host", "room").room.players.length, 2);
    assert.equal(last("c-alex", "room").room.players.length, 2);
  });

  it("accepts a lowercase code", async () => {
    await send("c-host", { type: "create", displayName: "Sam" });
    const { code } = last("c-host", "welcome");
    await send("c-alex", {
      type: "join",
      code: code.toLowerCase(),
      displayName: "Alex",
    });
    assert.equal(last("c-alex", "welcome").code, code);
  });

  it("reports an unknown code", async () => {
    await send("c-alex", { type: "join", code: "ZZZZ", displayName: "Alex" });
    assert.equal(last("c-alex", "error").reason, "room_not_found");
  });

  it("keeps a connection to one room", async () => {
    await hostAndJoin();
    await send("c-alex", { type: "create", displayName: "Alex" });
    assert.equal(last("c-alex", "error").reason, "invalid_message");
  });
});

describe("messages", () => {
  it("rejects malformed input", async () => {
    await handleMessage(deps, "c1", "not json");
    assert.equal(last("c1", "error").reason, "invalid_message");
    await handleMessage(
      deps,
      "c1",
      JSON.stringify({ type: "submitName", name: "" }),
    );
    assert.equal(last("c1", "error").reason, "invalid_message");
  });

  it("ignores heartbeats, in a room or not", async () => {
    await send("c1", { type: "ping" });
    await hostAndJoin();
    const before = inbox.get("c-host")?.length;
    await send("c-host", { type: "ping" });
    assert.equal(inbox.has("c1"), false);
    assert.equal(inbox.get("c-host")?.length, before);
  });

  it("rejects game actions from a connection that isn't in a room", async () => {
    await send("c1", { type: "startReveal" });
    assert.equal(last("c1", "error").reason, "not_in_room");
  });

  it("sends each player only their own name", async () => {
    await hostAndJoin();
    await send("c-host", { type: "submitName", name: "Cher" });
    await send("c-alex", { type: "submitName", name: "Prince" });
    const hostView = JSON.stringify(last("c-host", "room"));
    const alexView = JSON.stringify(last("c-alex", "room"));
    assert.ok(hostView.includes("Cher") && !hostView.includes("Prince"));
    assert.ok(alexView.includes("Prince") && !alexView.includes("Cher"));
  });

  it("shows the reveal to the host alone", async () => {
    await hostAndJoin();
    await send("c-host", { type: "submitName", name: "Cher" });
    await send("c-alex", { type: "submitName", name: "Prince" });
    await send("c-host", { type: "startReveal" });
    const names = last("c-host", "room").room.reveal?.names ?? [];
    assert.deepEqual([...names].sort(), ["Cher", "Prince"]);
    assert.equal(last("c-alex", "room").room.reveal?.names, null);
  });

  it("returns rule errors to the sender only", async () => {
    await hostAndJoin();
    const before = inbox.get("c-host")?.length;
    await send("c-alex", { type: "startReveal" });
    assert.equal(last("c-alex", "error").reason, "not_host");
    assert.equal(inbox.get("c-host")?.length, before);
  });
});

describe("leaving", () => {
  it("tells a kicked player and stops sending them the room", async () => {
    await hostAndJoin();
    const alexId = last("c-alex", "welcome").playerId;
    await send("c-host", { type: "kick", playerId: alexId });
    assert.equal(inbox.get("c-alex")?.at(-1)?.type, "removed");
    assert.equal(last("c-host", "room").room.players.length, 1);
    await send("c-alex", { type: "submitName", name: "Prince" });
    assert.equal(last("c-alex", "error").reason, "not_in_room");
  });

  it("deletes the room when the last player leaves", async () => {
    await send("c-host", { type: "create", displayName: "Sam" });
    const { code } = last("c-host", "welcome");
    await send("c-host", { type: "leave" });
    assert.equal(await deps.store.getRoom(code), null);
  });
});

describe("connections", () => {
  it("marks a dropped player disconnected and resumes them with their token", async () => {
    const code = await hostAndJoin();
    const { playerId, sessionToken } = last("c-alex", "welcome");
    await handleDisconnect(deps, "c-alex");
    const dropped = last("c-host", "room").room.players.find(
      (p) => p.id === playerId,
    );
    assert.equal(dropped?.connected, false);

    await send("c-alex-2", { type: "resume", code, sessionToken });
    assert.equal(last("c-alex-2", "welcome").playerId, playerId);
    const back = last("c-host", "room").room.players.find(
      (p) => p.id === playerId,
    );
    assert.equal(back?.connected, true);
  });

  it("ignores a stale socket closing after its player resumed", async () => {
    const code = await hostAndJoin();
    const { playerId, sessionToken } = last("c-alex", "welcome");
    await send("c-alex-2", { type: "resume", code, sessionToken });
    await handleDisconnect(deps, "c-alex");
    const player = last("c-host", "room").room.players.find(
      (p) => p.id === playerId,
    );
    assert.equal(player?.connected, true);
  });

  it("rejects an unknown token or a vanished room as an expired session", async () => {
    const code = await hostAndJoin();
    await send("c1", { type: "resume", code, sessionToken: "nope" });
    assert.equal(last("c1", "error").reason, "session_expired");
    await send("c2", { type: "resume", code: "ZZZZ", sessionToken: "nope" });
    assert.equal(last("c2", "error").reason, "session_expired");
  });
});

describe("TVs", () => {
  async function tvWithPlayers() {
    await send("tv", { type: "display" });
    const { code } = last("tv", "watching");
    await send("c-host", { type: "join", code, displayName: "Sam" });
    await send("c-alex", { type: "join", code, displayName: "Alex" });
    return code;
  }

  it("opens a room for players to join, with the first one hosting", async () => {
    await tvWithPlayers();
    const { screen } = last("tv", "screen");
    assert.deepEqual(
      screen.players.map((p) => p.displayName),
      ["Sam", "Alex"],
    );
    assert.equal(screen.hostId, last("c-host", "welcome").playerId);
    assert.equal(last("c-host", "room").room.tv, true);
  });

  it("puts the reveal on the TV, not the host's phone", async () => {
    await tvWithPlayers();
    await send("c-host", { type: "submitName", name: "Cher" });
    await send("c-alex", { type: "submitName", name: "Prince" });
    await send("c-host", { type: "startReveal" });
    assert.equal(last("c-host", "room").room.reveal?.names, null);
    assert.equal(last("tv", "screen").screen.reveal?.slips.length, 1);
    await send("c-host", { type: "revealTo", index: 1 });
    assert.equal(last("tv", "screen").screen.reveal?.index, 1);
  });

  it("only watches", async () => {
    await tvWithPlayers();
    await send("tv", { type: "startReveal" });
    assert.equal(last("tv", "error").reason, "invalid_message");
  });

  it("reattaches to its room after a reload", async () => {
    const code = await tvWithPlayers();
    await handleDisconnect(deps, "tv");
    assert.equal(last("c-host", "room").room.tv, false);
    await send("tv-2", { type: "display", code });
    assert.equal(last("tv-2", "watching").code, code);
    assert.equal(last("c-host", "room").room.tv, true);
  });

  it("reports an unknown room", async () => {
    await send("tv", { type: "display", code: "ZZZZ" });
    assert.equal(last("tv", "error").reason, "room_not_found");
  });

  it("keeps a room while a TV shows it, and deletes it once nobody's left", async () => {
    await send("tv", { type: "display" });
    const { code } = last("tv", "watching");
    await send("c-host", { type: "join", code, displayName: "Sam" });
    await send("c-host", { type: "leave" });
    assert.notEqual(await deps.store.getRoom(code), null);
    assert.equal(last("tv", "screen").screen.hostId, null);
    await handleDisconnect(deps, "tv");
    assert.equal(await deps.store.getRoom(code), null);
  });
});
