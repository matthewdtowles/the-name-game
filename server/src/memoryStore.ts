import type { Binding, RoomRecord, Store } from "./store";

// For local dev and tests. Copies on the way in and out, like a real database,
// so callers can't mutate stored state by accident.
export class MemoryStore implements Store {
  private rooms = new Map<string, RoomRecord>();
  private bindings = new Map<string, Binding>();

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
}
