import type { Binding, RoomRecord, Store, Tally } from "./store";

// For local dev and tests. Copies on the way in and out, like a real database,
// so callers can't mutate stored state by accident.
export class MemoryStore implements Store {
  private rooms = new Map<string, RoomRecord>();
  private bindings = new Map<string, Binding>();
  private hits = new Map<string, number>();
  readonly tallies: Partial<Record<Tally, number>> = {};

  constructor(private readonly now: () => number = Date.now) {}

  async getRoom(code: string) {
    const record = this.rooms.get(code);
    return record ? structuredClone(record) : null;
  }

  async putRoom(record: RoomRecord, expectedVersion: number | null) {
    const current = this.rooms.get(record.room.code);
    if ((current?.version ?? null) !== expectedVersion) return false;
    this.rooms.set(record.room.code, structuredClone(record));
    return true;
  }

  async deleteRoom(code: string) {
    this.rooms.delete(code);
  }

  async getBinding(connectionId: string) {
    const binding = this.bindings.get(connectionId);
    return binding ? { ...binding } : null;
  }

  async putBinding(connectionId: string, binding: Binding) {
    this.bindings.set(connectionId, { ...binding });
  }

  async deleteBinding(connectionId: string) {
    this.bindings.delete(connectionId);
  }

  async hit(key: string, windowSeconds: number) {
    const window = Math.floor(this.now() / 1000 / windowSeconds);
    const id = `${key}#${window}`;
    const count = (this.hits.get(id) ?? 0) + 1;
    this.hits.set(id, count);
    return count;
  }

  async tally(counts: Partial<Record<Tally, number>>) {
    for (const [field, n] of Object.entries(counts) as [Tally, number][])
      this.tallies[field] = (this.tallies[field] ?? 0) + n;
  }
}
