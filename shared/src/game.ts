import {
  DEFAULT_REMINDERS,
  type ErrorReason,
  type Phase,
  type RoomView,
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

export interface Room {
  code: string;
  tier: Tier;
  phase: Phase;
  settings: Settings;
  hostId: string;
  // In seat order. Join order sets the seats.
  players: Player[];
  remindersLeft: number;
  // The shuffled names for the current reveal; null until the first reveal.
  revealOrder: string[] | null;
}

// Every action carries the acting player's id, resolved by the server from the
// connection, never trusted from the client.
export type Action =
  | {
      type: "join";
      playerId: string;
      sessionToken: string;
      displayName: string;
    }
  | { type: "connect"; playerId: string }
  | { type: "disconnect"; playerId: string }
  | { type: "leave"; playerId: string }
  | { type: "kick"; playerId: string; targetId: string }
  | { type: "submitName"; playerId: string; name: string }
  | { type: "updateSettings"; playerId: string; settings: Settings }
  | { type: "startReveal"; playerId: string }
  | { type: "finishReveal"; playerId: string }
  | { type: "remind"; playerId: string };

export type Result =
  { ok: true; room: Room } | { ok: false; reason: ErrorReason };

// A [0, 1) source, like Math.random. The server passes a crypto-backed one.
export type Random = () => number;

export function createRoom(input: {
  code: string;
  tier: Tier;
  host: { id: string; sessionToken: string; displayName: string };
}): Room {
  return {
    code: input.code,
    tier: input.tier,
    phase: "lobby",
    settings: { reminders: DEFAULT_REMINDERS },
    hostId: input.host.id,
    players: [{ ...input.host, connected: true, name: null }],
    remindersLeft: DEFAULT_REMINDERS,
    revealOrder: null,
  };
}

export function apply(room: Room, action: Action, random: Random): Result {
  if (action.type === "join") return join(room, action);

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
      return ok({
        ...room,
        phase: "reveal",
        revealOrder: shuffle(names, random),
      });
    }

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
        revealOrder: shuffle(room.revealOrder ?? [], random),
      });
  }
}

// What one player is allowed to see. Other players' names never leave the
// server, and the shuffled list goes only to the host, only while revealing.
export function viewFor(room: Room, playerId: string): RoomView {
  const you = room.players.find((p) => p.id === playerId);
  if (!you) throw new Error(`Player ${playerId} is not in room ${room.code}`);
  return {
    code: room.code,
    phase: room.phase,
    tier: room.tier,
    settings: room.settings,
    hostId: room.hostId,
    players: room.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      connected: p.connected,
      submitted: p.name !== null,
    })),
    you: { playerId: you.id, submittedName: you.name },
    remindersLeft: room.remindersLeft,
    names:
      room.phase === "reveal" && playerId === room.hostId
        ? room.revealOrder
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
  return ok({ ...room, players: [...room.players, player] });
}

// When the host goes, hosting passes to the next player in seat order. A room
// left with no players is the server's to delete.
function removePlayer(room: Room, playerId: string): Room {
  const seat = room.players.findIndex((p) => p.id === playerId);
  const players = room.players.filter((p) => p.id !== playerId);
  const hostId =
    playerId === room.hostId && players.length > 0
      ? players[seat % players.length]!.id
      : room.hostId;
  return { ...room, players, hostId };
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
