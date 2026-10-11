// Counts each connection's messages in fixed windows. Best effort: a Lambda
// instance sees only the messages routed to it, which is still enough to stop
// one runaway socket from fanning out to its whole room.
export class MessageLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  // The connection's message count in the current window, this one included.
  count(connectionId: string): number {
    const now = this.now();
    const current = this.windows.get(connectionId);
    if (current && now - current.start < this.windowMs) return ++current.count;
    if (this.windows.size > 10_000) this.prune(now);
    this.windows.set(connectionId, { start: now, count: 1 });
    return 1;
  }

  private prune(now: number) {
    for (const [id, { start }] of this.windows)
      if (now - start >= this.windowMs) this.windows.delete(id);
  }
}
