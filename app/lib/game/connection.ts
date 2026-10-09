import { ServerMessage, type ClientMessage } from "@tng/shared";

// A WebSocket to the game server that stays up: it reconnects with backoff
// after any drop and sends a heartbeat while open. What to say on (re)connect
// and what to do with messages belong to the client using it.

export type Status = "connecting" | "open" | "closed";

// WebSocket.OPEN, spelled out so the client doesn't need the global to load.
const OPEN = 1;
// API Gateway drops sockets idle for 10 minutes.
export const HEARTBEAT_MS = 4 * 60 * 1000;
export const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];

export class Connection {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;

  constructor(
    private readonly options: {
      url: string;
      createSocket: (url: string) => WebSocket;
      onStatus: (status: Status) => void;
      // Runs on every (re)connect: the place to resume or re-attach.
      onOpen: () => void;
      onMessage: (message: ServerMessage) => void;
    },
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  // Sends now or not at all: the UI disables actions while not connected.
  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private connect(): void {
    if (this.stopped) return;
    // Never two live sockets: a replaced one's events are ignored below.
    const previous = this.socket;
    this.socket = null;
    previous?.close();
    this.options.onStatus("connecting");
    const socket = this.options.createSocket(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempts = 0;
      this.options.onStatus("open");
      this.options.onOpen();
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
      if (parsed.success) this.options.onMessage(parsed.data);
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      this.options.onStatus("closed");
      if (this.stopped) return;
      const delay =
        RECONNECT_DELAYS_MS[
          Math.min(this.attempts, RECONNECT_DELAYS_MS.length - 1)
        ];
      this.attempts++;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
  }
}
