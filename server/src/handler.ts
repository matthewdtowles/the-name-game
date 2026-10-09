import { randomBytes, randomInt, randomUUID } from "node:crypto";

import {
  apply,
  ClientMessage,
  createRoom,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  screenFor,
  viewFor,
  type Action,
  type ErrorReason,
  type Random,
} from "@tng/shared";

import type { RoomRecord, Send, Store } from "./store";

// The transport-agnostic server: one entry point per socket event. The local
// dev server and the Lambda adapter differ only in the Store and Send they pass.

export interface Deps {
  store: Store;
  send: Send;
}

const MESSAGES: Record<ErrorReason, string> = {
  invalid_message: "That request didn't make sense.",
  room_not_found: "No game has that code.",
  room_locked: "That game has already started.",
  room_full: "That game is full.",
  session_expired: "Your spot in that game is gone. Join again.",
  not_in_room: "You're not in that game.",
  display_name_taken: "Someone in the game already has that name.",
  duplicate_name: "Someone already picked that name. Choose another.",
  not_host: "Only the host can do that.",
  wrong_phase: "You can't do that right now.",
  not_enough_names: "At least two names are needed to start.",
  no_reminders_left: "There are no reminders left.",
  not_your_turn: "It’s not your turn.",
  invalid_target: "You can only guess another team’s leader.",
  guess_pending: "Wait for the last guess to be answered.",
  no_guess_pending: "There’s no guess to answer.",
  reminders_left: "Use up the reminders before ending the round.",
  nothing_to_undo: "There’s nothing to undo.",
};

// crypto.randomInt's range must stay below 2^48.
const RANDOM_RANGE = 2 ** 48 - 1;
const random: Random = () => randomInt(RANDOM_RANGE) / RANDOM_RANGE;
const ATTEMPTS = 5;

export async function handleMessage(
  deps: Deps,
  connectionId: string,
  raw: string,
): Promise<void> {
  const parsed = ClientMessage.safeParse(safeJson(raw));
  if (!parsed.success) return sendError(deps, connectionId, "invalid_message");
  const message = parsed.data;
  if (message.type === "ping") return;
  const binding = await deps.store.getBinding(connectionId);

  if (message.type === "display") {
    if (binding) return sendError(deps, connectionId, "invalid_message");
    return watch(deps, connectionId, message.code);
  }

  if (
    message.type === "create" ||
    message.type === "join" ||
    message.type === "resume"
  ) {
    // One room per connection: leave the current game before entering another.
    if (binding) return sendError(deps, connectionId, "invalid_message");
    return enter(deps, connectionId, message);
  }

  if (!binding) return sendError(deps, connectionId, "not_in_room");
  // A TV only watches.
  if (binding.playerId === null) {
    return sendError(deps, connectionId, "invalid_message");
  }
  const action = toAction(message, binding.playerId);
  const outcome = await mutate(deps.store, binding.code, (record) => {
    const result = apply(record.room, action, random);
    if (!result.ok) return result.reason;
    const remaining = new Set(result.room.players.map((p) => p.id));
    const connections = Object.fromEntries(
      Object.entries(record.connections).filter(([playerId]) =>
        remaining.has(playerId),
      ),
    );
    return { ...record, room: result.room, connections };
  });
  if (typeof outcome === "string")
    return sendError(deps, connectionId, outcome);

  // Players who left or were kicked are told and unbound.
  for (const [playerId, conn] of Object.entries(outcome.prev.connections)) {
    if (playerId in outcome.next.connections) continue;
    await deps.store.deleteBinding(conn);
    await deps.send(conn, { type: "removed" });
  }
  await broadcast(deps, outcome.next);
}

export async function handleDisconnect(
  deps: Deps,
  connectionId: string,
): Promise<void> {
  const binding = await deps.store.getBinding(connectionId);
  if (!binding) return;
  await deps.store.deleteBinding(connectionId);
  const { playerId } = binding;
  const outcome = await mutate(deps.store, binding.code, (record) => {
    if (playerId === null) {
      if (!record.displays.includes(connectionId)) return record;
      const result = apply(record.room, { type: "detachDisplay" }, random);
      if (!result.ok) return record;
      const displays = record.displays.filter((c) => c !== connectionId);
      return { ...record, room: result.room, displays };
    }
    // A socket that closes after its player resumed elsewhere changes nothing.
    if (record.connections[playerId] !== connectionId) return record;
    const result = apply(record.room, { type: "disconnect", playerId }, random);
    if (!result.ok) return record;
    const connections = Object.fromEntries(
      Object.entries(record.connections).filter(([id]) => id !== playerId),
    );
    return { ...record, room: result.room, connections };
  });
  if (typeof outcome !== "string" && outcome.next !== outcome.prev) {
    await broadcast(deps, outcome.next);
  }
}

async function enter(
  deps: Deps,
  connectionId: string,
  message: Extract<ClientMessage, { type: "create" | "join" | "resume" }>,
): Promise<void> {
  let record: RoomRecord;
  let playerId: string;
  let sessionToken: string;

  if (message.type === "create") {
    playerId = randomUUID();
    sessionToken = newToken();
    const host = {
      id: playerId,
      sessionToken,
      displayName: message.displayName,
    };
    const created = await createUniqueRoom(deps.store, (code) => ({
      room: createRoom({ code, tier: "free", host }),
      connections: { [host.id]: connectionId },
      displays: [],
      version: 1,
    }));
    if (!created) throw new Error("Could not find a free room code");
    record = created;
  } else if (message.type === "join") {
    playerId = randomUUID();
    sessionToken = newToken();
    const join: Action = {
      type: "join",
      playerId,
      sessionToken,
      displayName: message.displayName,
    };
    const outcome = await mutate(deps.store, message.code, (current) => {
      const result = apply(current.room, join, random);
      if (!result.ok) return result.reason;
      return {
        ...current,
        room: result.room,
        connections: { ...current.connections, [playerId]: connectionId },
      };
    });
    if (typeof outcome === "string")
      return sendError(deps, connectionId, outcome);
    record = outcome.next;
  } else {
    sessionToken = message.sessionToken;
    const outcome = await mutate(deps.store, message.code, (current) => {
      const player = current.room.players.find(
        (p) => p.sessionToken === sessionToken,
      );
      if (!player) return "session_expired";
      const result = apply(
        current.room,
        { type: "connect", playerId: player.id },
        random,
      );
      if (!result.ok) return result.reason;
      return {
        ...current,
        room: result.room,
        connections: { ...current.connections, [player.id]: connectionId },
      };
    });
    // A room that no longer exists means the session is gone too.
    if (outcome === "room_not_found")
      return sendError(deps, connectionId, "session_expired");
    if (typeof outcome === "string")
      return sendError(deps, connectionId, outcome);
    record = outcome.next;
    playerId = record.room.players.find(
      (p) => p.sessionToken === sessionToken,
    )!.id;
  }

  await deps.store.putBinding(connectionId, {
    code: record.room.code,
    playerId,
  });
  await deps.send(connectionId, {
    type: "welcome",
    code: record.room.code,
    playerId,
    sessionToken,
  });
  await broadcast(deps, record);
}

// A TV attaching: to a new room it waits in for players, or back to its room
// after a reload.
async function watch(
  deps: Deps,
  connectionId: string,
  code: string | undefined,
): Promise<void> {
  let record: RoomRecord;
  if (code === undefined) {
    const created = await createUniqueRoom(deps.store, (newCode) =>
      withDisplay(
        {
          room: createRoom({ code: newCode, tier: "free" }),
          connections: {},
          displays: [],
          version: 1,
        },
        connectionId,
      ),
    );
    if (!created) throw new Error("Could not find a free room code");
    record = created;
  } else {
    const outcome = await mutate(deps.store, code, (current) =>
      withDisplay(current, connectionId),
    );
    if (typeof outcome === "string")
      return sendError(deps, connectionId, outcome);
    record = outcome.next;
  }

  await deps.store.putBinding(connectionId, {
    code: record.room.code,
    playerId: null,
  });
  await deps.send(connectionId, { type: "watching", code: record.room.code });
  await broadcast(deps, record);
}

function withDisplay(record: RoomRecord, connectionId: string): RoomRecord {
  const result = apply(record.room, { type: "attachDisplay" }, random);
  if (!result.ok) throw new Error(`Couldn't attach a TV: ${result.reason}`);
  return {
    ...record,
    room: result.room,
    displays: [...record.displays, connectionId],
  };
}

// Builds a room under a fresh code, retrying on the rare collision.
async function createUniqueRoom(
  store: Store,
  build: (code: string) => RoomRecord,
): Promise<RoomRecord | null> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const record = build(newCode());
    if (await store.putRoom(record, null)) return record;
  }
  return null;
}

// Read, change, and conditionally write a room, retrying when another write
// got there first. Returning the record unchanged skips the write; a room
// left with no players and no TV is deleted.
async function mutate(
  store: Store,
  code: string,
  change: (record: RoomRecord) => RoomRecord | ErrorReason,
): Promise<{ prev: RoomRecord; next: RoomRecord } | ErrorReason> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const prev = await store.getRoom(code);
    if (!prev) return "room_not_found";
    const changed = change(prev);
    if (typeof changed === "string") return changed;
    if (changed === prev) return { prev, next: prev };
    const next = { ...changed, version: prev.version + 1 };
    if (next.room.players.length === 0 && next.displays.length === 0) {
      await store.deleteRoom(code);
      return { prev, next };
    }
    if (await store.putRoom(next, prev.version)) return { prev, next };
  }
  throw new Error(`Room ${code} kept changing underneath us`);
}

async function broadcast(deps: Deps, record: RoomRecord): Promise<void> {
  const screen = screenFor(record.room);
  await Promise.all([
    ...Object.entries(record.connections).map(([playerId, conn]) =>
      deps.send(conn, { type: "room", room: viewFor(record.room, playerId) }),
    ),
    ...record.displays.map((conn) =>
      deps.send(conn, { type: "screen", screen }),
    ),
  ]);
}

function toAction(
  message: Exclude<
    ClientMessage,
    { type: "create" | "join" | "resume" | "ping" | "display" }
  >,
  playerId: string,
): Action {
  switch (message.type) {
    case "submitName":
      return { type: "submitName", playerId, name: message.name };
    case "updateSettings":
      return { type: "updateSettings", playerId, settings: message.settings };
    case "kick":
      return { type: "kick", playerId, targetId: message.playerId };
    case "revealTo":
      return { type: "revealTo", playerId, index: message.index };
    case "revealAll":
      return { type: "revealAll", playerId, all: message.all };
    case "moveSeat":
      return {
        type: "moveSeat",
        playerId,
        targetId: message.playerId,
        to: message.to,
      };
    case "guess":
      return { type: "guess", playerId, targetId: message.playerId };
    case "answerGuess":
      return { type: "answerGuess", playerId, correct: message.correct };
    case "cancelGuess":
    case "endRound":
    case "undo":
    case "playAgain":
      return { type: message.type, playerId };
    case "startReveal":
    case "finishReveal":
    case "remind":
    case "leave":
      return { type: message.type, playerId };
  }
}

function sendError(
  deps: Deps,
  connectionId: string,
  reason: ErrorReason,
): Promise<void> {
  return deps.send(connectionId, {
    type: "error",
    reason,
    message: MESSAGES[reason],
  });
}

function newCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
