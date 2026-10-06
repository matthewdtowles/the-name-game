import {
  ServerMessage,
  type ClientMessage,
  type ErrorReason,
  type RoomView,
} from "@tng/shared";

// One long-lived connection to the game server. It keeps the player in their
// room across dropped sockets, sleeping phones and app restarts: the session
// from the server's `welcome` is stored, and every new socket resumes it.

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

export type Status = "connecting" | "open" | "closed";

export interface GameState {
  status: Status;
  session: Session | null;
  room: RoomView | null;
  error: { reason: ErrorReason; message: string } | null;
}

// WebSocket.OPEN, spelled out so the client doesn't need the global to load.
const OPEN = 1;
// API Gateway drops sockets idle for 10 minutes.
export const HEARTBEAT_MS = 4 * 60 * 1000;
export const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];

export class GameClient {
  private state: GameState = {
    status: "closed",
    session: null,
    room: null,
    error: null,
  };
  private listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private readonly options: {
      url: string;
      storage: SessionStorage;
      createSocket: (url: string) => WebSocket;
    },
  ) {}

  getState = (): GameState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async start(): Promise<void> {
    this.stopped = false;
    this.update({ session: await this.options.storage.load() });
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
  }

  // Sends now or not at all: the UI disables actions while not connected.
  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== OPEN) return false;
    if (message.type !== "ping") this.update({ error: null });
    this.socket.send(JSON.stringify(message));
    return true;
  }

  clearError(): void {
    this.update({ error: null });
  }

  private connect(): void {
    if (this.stopped) return;
    // Never two live sockets: a replaced one's events are ignored below.
    const previous = this.socket;
    this.socket = null;
    previous?.close();
    this.update({ status: "connecting" });
    const socket = this.options.createSocket(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempts = 0;
      this.update({ status: "open" });
      const { session } = this.state;
      if (session) {
        this.send({
          type: "resume",
          code: session.code,
          sessionToken: session.sessionToken,
        });
      }
      this.heartbeatTimer = setInterval(
        () => this.send({ type: "ping" }),
        HEARTBEAT_MS,
      );
    };

    socket.onmessage = (event) => {
      if (this.socket !== socket || typeof event.data !== "string") return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        return;
      }
      const parsed = ServerMessage.safeParse(raw);
      if (parsed.success) void this.receive(parsed.data);
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      this.update({ status: "closed" });
      if (this.stopped) return;
      const delay =
        RECONNECT_DELAYS_MS[
          Math.min(this.attempts, RECONNECT_DELAYS_MS.length - 1)
        ];
      this.attempts++;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

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

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
  }

  private update(patch: Partial<GameState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
