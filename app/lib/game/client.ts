import type {
  ClientMessage,
  ErrorReason,
  RoomView,
  ServerMessage,
} from "@tng/shared";

import { Connection, type Status } from "./connection";

export { HEARTBEAT_MS, RECONNECT_DELAYS_MS, type Status } from "./connection";

// A player's connection to the game. It keeps them in their room across
// dropped sockets, sleeping phones and app restarts: the session from the
// server's `welcome` is stored, and every new socket resumes it.

export interface Session {
  code: string;
  playerId: string;
  sessionToken: string;
}

export interface SessionStorage {
  load(): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(): Promise<void>;
}

export interface GameState {
  status: Status;
  session: Session | null;
  room: RoomView | null;
  error: { reason: ErrorReason; message: string } | null;
}

export class GameClient {
  private state: GameState = {
    status: "closed",
    session: null,
    room: null,
    error: null,
  };
  private listeners = new Set<() => void>();
  private readonly connection: Connection;

  constructor(
    private readonly options: {
      url: string;
      storage: SessionStorage;
      createSocket: (url: string) => WebSocket;
    },
  ) {
    this.connection = new Connection({
      url: options.url,
      createSocket: options.createSocket,
      onStatus: (status) => this.update({ status }),
      onOpen: () => {
        const { session } = this.state;
        if (session) {
          this.connection.send({
            type: "resume",
            code: session.code,
            sessionToken: session.sessionToken,
          });
        }
      },
      onMessage: (message) => void this.receive(message),
    });
  }

  getState = (): GameState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async start(): Promise<void> {
    this.update({ session: await this.options.storage.load() });
    this.connection.start();
  }

  stop(): void {
    this.connection.stop();
  }

  // Sends now or not at all: the UI disables actions while not connected.
  // Arrow properties, so screens can depend on them without re-running effects.
  send = (message: ClientMessage): boolean => {
    if (message.type !== "ping") this.update({ error: null });
    return this.connection.send(message);
  };

  clearError = (): void => {
    this.update({ error: null });
  };

  private async receive(message: ServerMessage): Promise<void> {
    switch (message.type) {
      case "welcome": {
        const session = {
          code: message.code,
          playerId: message.playerId,
          sessionToken: message.sessionToken,
        };
        this.update({ session });
        await this.options.storage.save(session);
        return;
      }
      case "room":
        this.update({ room: message.room });
        return;
      case "error":
        // The stored session can't be resumed: start over from the home screen.
        if (message.reason === "session_expired") await this.forget();
        this.update({
          error: { reason: message.reason, message: message.message },
        });
        return;
      case "removed":
        await this.forget();
        return;
    }
  }

  private async forget(): Promise<void> {
    this.update({ session: null, room: null });
    await this.options.storage.clear();
  }

  private update(patch: Partial<GameState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
