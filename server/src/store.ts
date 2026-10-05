import type { Room, ServerMessage } from "@tng/shared";

export interface RoomRecord {
  room: Room;
  // Each player's live connection, for fan-out. Kept beside the room rather
  // than in it because sockets are the server's concern, not the game's.
  connections: Record<string, string>;
  version: number;
}

// Which room and player a connection speaks for.
export interface Binding {
  code: string;
  playerId: string;
}

export interface Store {
  getRoom(code: string): Promise<RoomRecord | null>;
  // Writes the record only if the stored version is still `expectedVersion`
  // (null: only if no room has the code). Returns false on a conflict.
  putRoom(record: RoomRecord, expectedVersion: number | null): Promise<boolean>;
  deleteRoom(code: string): Promise<void>;
  getBinding(connectionId: string): Promise<Binding | null>;
  putBinding(connectionId: string, binding: Binding): Promise<void>;
  deleteBinding(connectionId: string): Promise<void>;
}

// Delivers a message to one connection. A connection that has gone away is
// ignored, not an error.
export type Send = (
  connectionId: string,
  message: ServerMessage,
) => Promise<void>;
