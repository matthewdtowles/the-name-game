import {
  DEFAULT_REMINDERS,
  type ErrorReason,
  type GameView,
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

// The guessing game. Everyone with a name in the hat starts as a team of one;
// a team is known by its leader, the one member whose name is still unguessed.
export interface Game {
  // Each playing player's team, by leader id.
  teams: Record<string, string>;
  // Players whose names have been guessed out loud.
  guessed: string[];
  // The leader of the team whose turn it is.
  turn: string;
  // A guess said out loud, waiting for the guessed player to answer.
  pending: { by: string; team: string; target: string } | null;
  // Leaders of the winning teams once it's over (more than one on a tie).
  winners: string[] | null;
}

// Undo goes back this many answers.
const HISTORY_LIMIT = 20;

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
  // From the first reveal until the next game.
  game: Game | null;
  // Earlier game states, most recent last, for the host's undo.
  history: Game[];
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
  | { type: "remind"; playerId: string }
  | { type: "moveSeat"; playerId: string; targetId: string; to: number }
  | { type: "guess"; playerId: string; targetId: string }
  | { type: "answerGuess"; playerId: string; correct: boolean }
  | { type: "cancelGuess"; playerId: string }
  | { type: "endRound"; playerId: string }
  | { type: "undo"; playerId: string }
  | { type: "playAgain"; playerId: string };

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
    game: null,
    history: [],
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
      return ok({
        ...room,
        phase: "reveal",
        reveal: fresh(names, random),
        game: newGame(room),
        history: [],
      });
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

    case "moveSeat": {
      if (!isHost) return fail("not_host");
      if (room.phase !== "lobby") return fail("wrong_phase");
      const mover = room.players.find((p) => p.id === action.targetId);
      if (!mover) return fail("not_in_room");
      if (action.to >= room.players.length) return fail("invalid_message");
      const players = room.players.filter((p) => p.id !== mover.id);
      players.splice(action.to, 0, mover);
      return ok({ ...room, players });
    }

    case "guess": {
      const game = room.game;
      if (room.phase !== "play" || !game) return fail("wrong_phase");
      if (game.pending) return fail("guess_pending");
      if (game.teams[actor.id] !== game.turn) return fail("not_your_turn");
      if (
        action.targetId === game.turn ||
        !activeLeaders(room, game).includes(action.targetId)
      ) {
        return fail("invalid_target");
      }
      return ok({
        ...room,
        game: {
          ...game,
          pending: { by: actor.id, team: game.turn, target: action.targetId },
        },
      });
    }

    case "answerGuess": {
      const game = room.game;
      if (room.phase !== "play" || !game) return fail("wrong_phase");
      const pending = game.pending;
      if (!pending) return fail("no_guess_pending");
      if (actor.id !== pending.target && !isHost) return fail("not_your_turn");
      const history = remember(room, game);
      if (!action.correct) {
        return ok({
          ...room,
          history,
          game: {
            ...game,
            pending: null,
            turn: nextTurn(room, game, pending.team),
          },
        });
      }
      // Right: the guessed player's whole team joins the guessers, who go again.
      const teams = Object.fromEntries(
        Object.entries(game.teams).map(([id, leader]) => [
          id,
          leader === pending.target ? pending.team : leader,
        ]),
      );
      const next: Game = {
        ...game,
        teams,
        guessed: [...game.guessed, pending.target],
        pending: null,
      };
      return ok(settle({ ...room, history, game: next }));
    }

    case "cancelGuess": {
      const game = room.game;
      if (!game?.pending) return fail("no_guess_pending");
      if (game.teams[actor.id] !== game.pending.team && !isHost) {
        return fail("not_your_turn");
      }
      return ok({ ...room, game: { ...game, pending: null } });
    }

    case "endRound": {
      if (!isHost) return fail("not_host");
      const game = room.game;
      if (room.phase !== "play" || !game) return fail("wrong_phase");
      if (room.remindersLeft > 0) return fail("reminders_left");
      // The largest team wins; tied teams share the win.
      const leaders = activeLeaders(room, game);
      const size = (leader: string) =>
        room.players.filter((p) => game.teams[p.id] === leader).length;
      const most = Math.max(...leaders.map(size));
      return ok({
        ...room,
        phase: "over",
        history: remember(room, game),
        game: {
          ...game,
          pending: null,
          winners: leaders.filter((leader) => size(leader) === most),
        },
      });
    }

    case "undo": {
      if (!isHost) return fail("not_host");
      if ((room.phase !== "play" && room.phase !== "over") || !room.game) {
        return fail("wrong_phase");
      }
      const previous = room.history.at(-1);
      if (!previous) return fail("nothing_to_undo");
      return ok({
        ...room,
        phase: "play",
        game: previous,
        history: room.history.slice(0, -1),
      });
    }

    case "playAgain":
      if (!isHost) return fail("not_host");
      if (room.phase !== "over") return fail("wrong_phase");
      return ok({
        ...room,
        phase: "lobby",
        players: room.players.map((p) => ({ ...p, name: null })),
        remindersLeft: room.settings.reminders,
        reveal: null,
        game: null,
        history: [],
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
    game: gameView(room),
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
    game: gameView(room),
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

// A player's name is public once it's been guessed out loud, and everyone's is
// once the game is over.
function playerViews(room: Room) {
  const game = room.game;
  return room.players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    connected: p.connected,
    submitted: p.name !== null,
    team: game?.teams[p.id] ?? null,
    name: room.phase === "over" || game?.guessed.includes(p.id) ? p.name : null,
  }));
}

function gameView(room: Room): GameView | null {
  const game = room.game;
  if (!game) return null;
  return {
    turn: game.turn,
    pending: game.pending,
    winners: game.winners,
    canUndo: room.history.length > 0,
  };
}

// Everyone with a name in the hat plays, starting as a team of one; the first
// of them in seat order goes first.
function newGame(room: Room): Game {
  const playing = room.players.filter((p) => p.name !== null);
  return {
    teams: Object.fromEntries(playing.map((p) => [p.id, p.id])),
    guessed: [],
    turn: playing[0]!.id,
    pending: null,
    winners: null,
  };
}

// Leaders of the teams still in the game, in seat order. A team whose leader
// left has no one left to guess, so it's out.
function activeLeaders(room: Room, game: Game): string[] {
  return room.players
    .map((p) => p.id)
    .filter((id) => game.teams[id] === id && !game.guessed.includes(id));
}

// The next team after `from` in seat order, wrapping around.
function nextTurn(room: Room, game: Game, from: string): string {
  const seats = room.players.map((p) => p.id);
  const active = new Set(activeLeaders(room, game));
  const start = seats.indexOf(from);
  for (let step = 1; step <= seats.length; step++) {
    const id = seats[(start + step) % seats.length]!;
    if (active.has(id) && id !== from) return id;
  }
  return from;
}

// The game is over once a single team is left.
function settle(room: Room): Room {
  const game = room.game;
  if (!game || game.winners) return room;
  const leaders = activeLeaders(room, game);
  if (leaders.length > 1) return room;
  return {
    ...room,
    phase: "over",
    game: { ...game, pending: null, winners: leaders },
  };
}

function remember(room: Room, game: Game): Game[] {
  return [...room.history, game].slice(-HISTORY_LIMIT);
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
  const game = room.game;
  if (!game || game.winners) return { ...room, players, hostId };
  // Mid-game: a guess involving them is off, and if it was their team's turn
  // it passes on. If they led a team, that team is out.
  const pending =
    game.pending &&
    [game.pending.by, game.pending.team, game.pending.target].includes(playerId)
      ? null
      : game.pending;
  const turn =
    game.turn === playerId ? nextTurn(room, game, playerId) : game.turn;
  const left = { ...room, players, hostId, game: { ...game, pending, turn } };
  return room.phase === "play" ? settle(left) : left;
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
