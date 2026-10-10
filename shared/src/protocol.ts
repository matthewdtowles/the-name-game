import { z } from "zod";

// The wire protocol between clients and the server. Clients send intents; the
// server answers with a per-recipient view of the room, so nothing a player
// shouldn't see (other players' names, who wrote what) ever leaves the server.

// Letters only, minus I, L and O, so a code read off a TV or said aloud can't be
// mistaken for another.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;
export const DISPLAY_NAME_MAX = 20;
export const SECRET_NAME_MAX = 60;
export const DEFAULT_REMINDERS = 1;
export const MAX_REMINDERS = 5;
export const MIN_REVEAL_SECONDS = 3;
export const MAX_REVEAL_SECONDS = 30;

export const RoomCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`),
    `Room codes are ${ROOM_CODE_LENGTH} letters`,
  );

export const DisplayName = z.string().trim().min(1).max(DISPLAY_NAME_MAX);
export const SecretName = z.string().trim().min(1).max(SECRET_NAME_MAX);

// Server-issued opaque strings.
export const PlayerId = z.string().min(1).max(64);
export const SessionToken = z.string().min(1).max(128);

// Paid tiers join this enum later; the server enforces each tier's limits.
export const Tier = z.enum(["free"]);

// lobby: players join and submit names. reveal: the names are shown, shuffled.
// play: teams take turns guessing; a reminder returns to reveal. over: a team
// won (or the round was ended) and everyone sees who wrote what.
export const Phase = z.enum(["lobby", "reveal", "play", "over"]);

export const Settings = z.object({
  reminders: z.int().min(0).max(MAX_REMINDERS),
  // Seconds each name stays up before the reveal moves on by itself; null
  // means the host moves it along by hand.
  revealSeconds: z
    .int()
    .min(MIN_REVEAL_SECONDS)
    .max(MAX_REVEAL_SECONDS)
    .nullable(),
});

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create"), displayName: DisplayName }),
  z.object({
    type: z.literal("join"),
    code: RoomCode,
    displayName: DisplayName,
  }),
  z.object({
    type: z.literal("resume"),
    code: RoomCode,
    sessionToken: SessionToken,
  }),
  z.object({ type: z.literal("submitName"), name: SecretName }),
  z.object({ type: z.literal("updateSettings"), settings: Settings }),
  z.object({ type: z.literal("kick"), playerId: PlayerId }),
  z.object({ type: z.literal("startReveal") }),
  z.object({ type: z.literal("finishReveal") }),
  z.object({ type: z.literal("remind") }),
  z.object({ type: z.literal("leave") }),
  // Host: which slip the reveal shows, by position, so a repeated tap can't
  // skip one. `all` shows every slip at once.
  z.object({ type: z.literal("revealTo"), index: z.int().min(0) }),
  z.object({ type: z.literal("revealAll"), all: z.boolean() }),
  // Host, in the lobby: move a player to another seat (0 is first).
  z.object({
    type: z.literal("moveSeat"),
    playerId: PlayerId,
    to: z.int().min(0),
  }),
  // A member of the team whose turn it is names the leader they're guessing.
  z.object({ type: z.literal("guess"), playerId: PlayerId }),
  // The guessed player (or the host for them) says whether it was right.
  z.object({ type: z.literal("answerGuess"), correct: z.boolean() }),
  z.object({ type: z.literal("cancelGuess") }),
  // Host: end the round once no reminders are left; the largest team wins.
  z.object({ type: z.literal("endRound") }),
  // Host: take back the last answer or ending.
  z.object({ type: z.literal("undo") }),
  // Host: a new game with the same players and seats.
  z.object({ type: z.literal("playAgain") }),
  // A TV attaching as a display: to a new room when there's no code (the first
  // phone to join hosts it), or back to its room after a reload.
  z.object({ type: z.literal("display"), code: RoomCode.optional() }),
  // Heartbeat: keeps an idle socket open (API Gateway closes them after 10
  // minutes). The server ignores it.
  z.object({ type: z.literal("ping") }),
]);

export const ErrorReason = z.enum([
  "invalid_message",
  "room_not_found",
  "room_locked",
  "room_full",
  "session_expired",
  "not_in_room",
  "display_name_taken",
  "duplicate_name",
  "not_host",
  "wrong_phase",
  "not_enough_names",
  "no_reminders_left",
  "not_your_turn",
  "invalid_target",
  "guess_pending",
  "no_guess_pending",
  "reminders_left",
  "nothing_to_undo",
]);

export const PlayerView = z.object({
  id: PlayerId,
  displayName: DisplayName,
  connected: z.boolean(),
  submitted: z.boolean(),
  // The leader of this player's team once the game starts; null for players
  // who put no name in and only watch.
  team: PlayerId.nullable(),
  // Their name once it's public: guessed out loud, or after the game.
  name: SecretName.nullable(),
});

// The guessing game, from the first reveal on. Teams are known by their leader.
export const GameView = z.object({
  turn: PlayerId,
  pending: z
    .object({ by: PlayerId, team: PlayerId, target: PlayerId })
    .nullable(),
  winners: z.array(PlayerId).nullable(),
  canUndo: z.boolean(),
});

// Where the reveal is. `names` is the shuffled list, sent only to the host and
// only when no TV is showing it.
export const RevealView = z.object({
  index: z.int().min(0),
  total: z.int().min(0),
  all: z.boolean(),
  names: z.array(SecretName).nullable(),
});

export const RoomView = z.object({
  code: RoomCode,
  phase: Phase,
  tier: Tier,
  settings: Settings,
  hostId: PlayerId,
  // In seat order.
  players: z.array(PlayerView),
  you: z.object({
    playerId: PlayerId,
    submittedName: SecretName.nullable(),
  }),
  remindersLeft: z.int().min(0),
  // Set only during the reveal.
  reveal: RevealView.nullable(),
  // A TV is showing the game, so the reveal happens there.
  tv: z.boolean(),
  game: GameView.nullable(),
});

// What a TV shows. During the reveal, `slips` holds only what's on screen: the
// current name, or all of them when the host shows them all.
export const ScreenView = z.object({
  code: RoomCode,
  phase: Phase,
  hostId: PlayerId.nullable(),
  players: z.array(PlayerView),
  remindersLeft: z.int().min(0),
  reveal: z
    .object({
      index: z.int().min(0),
      total: z.int().min(0),
      slips: z.array(SecretName),
    })
    .nullable(),
  game: GameView.nullable(),
});

export const ServerMessage = z.discriminatedUnion("type", [
  // Sent once a player is in a room (create, join or resume); the client keeps
  // the session token to resume after a dropped connection.
  z.object({
    type: z.literal("welcome"),
    code: RoomCode,
    playerId: PlayerId,
    sessionToken: SessionToken,
  }),
  z.object({ type: z.literal("room"), room: RoomView }),
  // Sent to a TV once it's attached, then the screen on every change.
  z.object({ type: z.literal("watching"), code: RoomCode }),
  z.object({ type: z.literal("screen"), screen: ScreenView }),
  // Sent to a player who left or was kicked; the client forgets its session.
  z.object({ type: z.literal("removed") }),
  z.object({
    type: z.literal("error"),
    reason: ErrorReason,
    message: z.string(),
  }),
]);

export type Tier = z.infer<typeof Tier>;
export type Phase = z.infer<typeof Phase>;
export type Settings = z.infer<typeof Settings>;
export type ClientMessage = z.infer<typeof ClientMessage>;
export type ErrorReason = z.infer<typeof ErrorReason>;
export type PlayerView = z.infer<typeof PlayerView>;
export type GameView = z.infer<typeof GameView>;
export type RoomView = z.infer<typeof RoomView>;
export type RevealView = z.infer<typeof RevealView>;
export type ScreenView = z.infer<typeof ScreenView>;
export type ServerMessage = z.infer<typeof ServerMessage>;
