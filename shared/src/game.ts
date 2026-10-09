import {
  DEFAULT_REMINDERS,
  type ErrorReason,
  type Phase,
  type RoomView,
  type ScreenView,
  type Settings,
  type Tier,
} from "./protocol";

// The rules of a room, as a pure function of (room, action). No I/O, no clock,
// no ambient randomness: the server supplies ids, tokens and a random source, so
// every rule is unit-testable and the server and local dev share one engine.

export const TIER_LIMITS: Record<Tier, { maxPlayers: number }> = {
  free: { maxPlayers: 20 },
};

export interface Player {
  id: string;
  displayName: string;
  sessionToken: string;
  connected: boolean;
  // The secret name this player submitted, or null until they do.
  name: string | null;
}

export interface Reveal {
  // The shuffled names.
  order: string[];
  // The slip on show, and whether every slip is showing instead.
  index: number;
  all: boolean;
}

export interface Room {
  code: string;
  tier: Tier;
  phase: Phase;
  settings: Settings;
  // Null only while a TV waits for its first player, who becomes host.
  hostId: string | null;
  // In seat order. Join order sets the seats.
  players: Player[];
  // TVs showing the room. While there's one, names appear only on the TV.
  displays: number;
  remindersLeft: number;
  // The current or last reveal; null until the first one.
  reveal: Reveal | null;
}

// Player actions carry the acting player's id, resolved by the server from the
// connection, never trusted from the client. TVs attach and detach anonymously.
export type Action =
  | {
      type: "join";
      playerId: string;
      sessionToken: string;
      displayName: string;
    }
  | { type: "attachDisplay" }
  | { type: "detachDisplay" }
  | { type: "connect"; playerId: string }
  | { type: "disconnect"; playerId: string }
  | { type: "leave"; playerId: string }
  | { type: "kick"; playerId: string; targetId: string }
  | { type: "submitName"; playerId: string; name: string }
  | { type: "updateSettings"; playerId: string; settings: Settings }
  | { type: "startReveal"; playerId: string }
  | { type: "revealTo"; playerId: string; index: number }
  | { type: "revealAll"; playerId: string; all: boolean }
  | { type: "finishReveal"; playerId: string }
  | { type: "remind"; playerId: string };

export type Result =
  { ok: true; room: Room } | { ok: false; reason: ErrorReason };

// A [0, 1) source, like Math.random. The server passes a crypto-backed one.
export type Random = () => number;

export const DEFAULT_SETTINGS: Settings = {
  reminders: DEFAULT_REMINDERS,
  revealSeconds: null,
};

// A room starts with its host, or, when a TV creates it, with nobody yet.
export function createRoom(input: {
  code: string;
  tier: Tier;
  host?: { id: string; sessionToken: string; displayName: string };
}): Room {
  return {
    code: input.code,
    tier: input.tier,
    phase: "lobby",
    settings: DEFAULT_SETTINGS,
    hostId: input.host?.id ?? null,
    players: input.host ? [{ ...input.host, connected: true, name: null }] : [],
    displays: 0,
    remindersLeft: DEFAULT_SETTINGS.reminders,
    reveal: null,
  };
}

export function apply(room: Room, action: Action, random: Random): Result {
  switch (action.type) {
    case "join":
      return join(room, action);
    case "attachDisplay":
      return ok({ ...room, displays: room.displays + 1 });
    case "detachDisplay":
      return ok({ ...room, displays: Math.max(0, room.displays - 1) });
  }

  const actor = room.players.find((p) => p.id === action.playerId);
  if (!actor) return fail("not_in_room");
  const isHost = actor.id === room.hostId;

  switch (action.type) {
    case "connect":
    case "disconnect":
      return ok({
        ...room,
        players: room.players.map((p) =>
          p.id === actor.id
            ? { ...p, connected: action.type === "connect" }
            : p,
        ),
      });

    case "leave":
      return ok(removePlayer(room, actor.id));

    case "kick": {
      if (!isHost) return fail("not_host");
      if (action.targetId === actor.id) return fail("invalid_message");
      if (!room.players.some((p) => p.id === action.targetId))
        return fail("not_in_room");
      return ok(removePlayer(room, action.targetId));
    }

    case "submitName": {
      if (room.phase !== "lobby") return fail("wrong_phase");
      const key = normalizeName(action.name);
      const taken = room.players.some(
        (p) =>
          p.id !== actor.id && p.name !== null && normalizeName(p.name) === key,
      );
      if (taken) return fail("duplicate_name");
      return ok({
        ...room,
        players: room.players.map((p) =>
          p.id === actor.id ? { ...p, name: action.name } : p,
        ),
      });
    }

    case "updateSettings":
      if (!isHost) return fail("not_host");
      if (room.phase !== "lobby") return fail("wrong_phase");
      return ok({
        ...room,
        settings: action.settings,
        remindersLeft: action.settings.reminders,
      });

    case "startReveal": {
      if (!isHost) return fail("not_host");
      if (room.phase !== "lobby") return fail("wrong_phase");
      // The host may start before everyone has submitted; those players simply
      // have no name in the game. A game needs at least two names.
      const names = room.players.flatMap((p) =>
        p.name === null ? [] : [p.name],
      );
      if (names.length < 2) return fail("not_enough_names");
      return ok({ ...room, phase: "reveal", reveal: fresh(names, random) });
    }

    case "revealTo":
      if (!isHost) return fail("not_host");
      if (room.phase !== "reveal" || !room.reveal) return fail("wrong_phase");
      if (action.index >= room.reveal.order.length)
        return fail("invalid_message");
      return ok({
        ...room,
        reveal: { ...room.reveal, index: action.index, all: false },
      });

    case "revealAll":
      if (!isHost) return fail("not_host");
      if (room.phase !== "reveal" || !room.reveal) return fail("wrong_phase");
      return ok({ ...room, reveal: { ...room.reveal, all: action.all } });

    case "finishReveal":
      if (!isHost) return fail("not_host");
      if (room.phase !== "reveal") return fail("wrong_phase");
      return ok({ ...room, phase: "play" });

    case "remind":
      if (!isHost) return fail("not_host");
      if (room.phase !== "play") return fail("wrong_phase");
      if (room.remindersLeft === 0) return fail("no_reminders_left");
      return ok({
        ...room,
        phase: "reveal",
        remindersLeft: room.remindersLeft - 1,
        reveal: fresh(room.reveal?.order ?? [], random),
      });
  }
}

// What one player is allowed to see. Other players' names never leave the
// server, and the shuffled list goes only to the host, only while revealing,
// and only when no TV is showing it to everyone instead.
export function viewFor(room: Room, playerId: string): RoomView {
  const you = room.players.find((p) => p.id === playerId);
  if (!you || room.hostId === null) {
    throw new Error(`Player ${playerId} is not in room ${room.code}`);
  }
  const revealing = room.phase === "reveal" && room.reveal;
  return {
    code: room.code,
    phase: room.phase,
    tier: room.tier,
    settings: room.settings,
    hostId: room.hostId,
    players: playerViews(room),
    you: { playerId: you.id, submittedName: you.name },
    remindersLeft: room.remindersLeft,
    reveal: revealing
      ? {
          index: revealing.index,
          total: revealing.order.length,
          all: revealing.all,
          names:
            playerId === room.hostId && room.displays === 0
              ? revealing.order
              : null,
        }
      : null,
    tv: room.displays > 0,
  };
}

// What a TV shows: never anyone's submitted name except the slips on screen.
export function screenFor(room: Room): ScreenView {
  const revealing = room.phase === "reveal" && room.reveal;
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    players: playerViews(room),
    remindersLeft: room.remindersLeft,
    reveal: revealing
      ? {
          index: revealing.index,
          total: revealing.order.length,
          slips: revealing.all
            ? revealing.order
            : [revealing.order[revealing.index]!],
        }
      : null,
  };
}

// Two names collide when they differ only by case, accents, or spacing.
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function playerViews(room: Room) {
  return room.players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    connected: p.connected,
    submitted: p.name !== null,
  }));
}

function join(room: Room, action: Extract<Action, { type: "join" }>): Result {
  if (room.phase !== "lobby") return fail("room_locked");
  if (room.players.length >= TIER_LIMITS[room.tier].maxPlayers)
    return fail("room_full");
  const key = normalizeName(action.displayName);
  if (room.players.some((p) => normalizeName(p.displayName) === key)) {
    return fail("display_name_taken");
  }
  const player: Player = {
    id: action.playerId,
    displayName: action.displayName,
    sessionToken: action.sessionToken,
    connected: true,
    name: null,
  };
  return ok({
    ...room,
    players: [...room.players, player],
    hostId: room.hostId ?? player.id,
  });
}

// When the host goes, hosting passes to the next player in seat order. A room
// left with no players and no TV is the server's to delete.
function removePlayer(room: Room, playerId: string): Room {
  const seat = room.players.findIndex((p) => p.id === playerId);
  const players = room.players.filter((p) => p.id !== playerId);
  const hostId =
    playerId !== room.hostId
      ? room.hostId
      : players.length > 0
        ? players[seat % players.length]!.id
        : null;
  return { ...room, players, hostId };
}

// A new shuffle, starting from the first slip.
function fresh(names: readonly string[], random: Random): Reveal {
  return { order: shuffle(names, random), index: 0, all: false };
}

// Fisher-Yates.
function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function ok(room: Room): Result {
  return { ok: true, room };
}

function fail(reason: ErrorReason): Result {
  return { ok: false, reason };
}
