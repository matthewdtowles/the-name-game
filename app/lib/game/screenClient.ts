import type { ScreenView, ServerMessage } from "@tng/shared";

import { Connection, type Status } from "./connection";

// A TV's connection to the game. It opens a new room or, after a reload, goes
// back to the one it was showing; the room code is all a TV needs to remember.

export interface CodeStorage {
  load(): string | null;
  save(code: string): void;
  clear(): void;
}

export interface ScreenState {
  status: Status;
  screen: ScreenView | null;
}

export class ScreenClient {
  private state: ScreenState = { status: "closed", screen: null };
  private listeners = new Set<() => void>();
  private code: string | null;
  private readonly connection: Connection;

  constructor(
    options: {
      url: string;
      storage: CodeStorage;
      createSocket: (url: string) => WebSocket;
      // A room to show from the start, e.g. from whosename.app/tv/ABCD.
      code?: string;
    },
    private readonly storage = options.storage,
  ) {
    this.code = options.code ?? storage.load();
    this.connection = new Connection({
      url: options.url,
      createSocket: options.createSocket,
      onStatus: (status) => this.update({ status }),
      onOpen: () =>
        this.connection.send({
          type: "display",
          ...(this.code ? { code: this.code } : {}),
        }),
      onMessage: (message) => this.receive(message),
    });
  }

  getState = (): ScreenState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    this.connection.start();
  }

  stop(): void {
    this.connection.stop();
  }

  // Leaves the current room for a new one: the server ties a socket to one
  // room, so this reconnects.
  newGame(): void {
    this.forget();
    this.connection.stop();
    this.connection.start();
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case "watching":
        this.code = message.code;
        this.storage.save(message.code);
        return;
      case "screen":
        this.update({ screen: message.screen });
        return;
      case "error":
        // The room this TV remembers has ended: open a new one instead.
        if (message.reason === "room_not_found" && this.code) {
          this.forget();
          this.connection.send({ type: "display" });
        }
        return;
    }
  }

  private forget(): void {
    this.code = null;
    this.storage.clear();
    this.update({ screen: null });
  }

  private update(patch: Partial<ScreenState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
