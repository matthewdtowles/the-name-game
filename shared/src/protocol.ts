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

// lobby: players join and submit names. reveal: the host is shown the shuffled
// names to read out. play: names are hidden; a reminder returns to reveal.
export const Phase = z.enum(["lobby", "reveal", "play"]);

export const Settings = z.object({
  reminders: z.int().min(0).max(MAX_REMINDERS),
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
]);

export const PlayerView = z.object({
  id: PlayerId,
  displayName: DisplayName,
  connected: z.boolean(),
  submitted: z.boolean(),
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
  // The shuffled names, sent only to the host and only during the reveal.
  names: z.array(SecretName).nullable(),
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
export type RoomView = z.infer<typeof RoomView>;
export type ServerMessage = z.infer<typeof ServerMessage>;
