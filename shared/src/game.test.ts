import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apply,
  createRoom,
  normalizeName,
  TIER_LIMITS,
  viewFor,
  type Action,
  type Room,
} from "./game";

// Always picks the last remaining index, so the Fisher-Yates shuffle leaves the
// order untouched and assertions stay readable.
const identity = () => 0.999;

function lobby(...names: string[]): Room {
  let room = createRoom({
    code: "WXYZ",
    tier: "free",
    host: { id: "p0", sessionToken: "t0", displayName: names[0] ?? "Host" },
  });
  for (const [i, displayName] of names.slice(1).entries()) {
    const id = `p${i + 1}`;
    room = must(room, {
      type: "join",
      playerId: id,
      sessionToken: `t${i + 1}`,
      displayName,
    });
  }
  return room;
}

function must(room: Room, action: Action): Room {
  const result = apply(room, action, identity);
  if (!result.ok) assert.fail(`${action.type} failed: ${result.reason}`);
  return result.room;
}

function reason(room: Room, action: Action): string | null {
  const result = apply(room, action, identity);
  return result.ok ? null : result.reason;
}

function submitted(...names: string[]): Room {
  let room = lobby(...names.map((_, i) => `Player ${i}`));
  for (const [i, name] of names.entries()) {
    room = must(room, { type: "submitName", playerId: `p${i}`, name });
  }
  return room;
}

describe("joining", () => {
  it("seats players in join order with the creator as host", () => {
    const room = lobby("Sam", "Alex", "Jo");
    assert.deepEqual(
      room.players.map((p) => p.displayName),
      ["Sam", "Alex", "Jo"],
    );
    assert.equal(room.hostId, "p0");
  });

  it("rejects a display name already in the room, ignoring case and spacing", () => {
    const room = lobby("Sam");
    const join = { type: "join", playerId: "p1", sessionToken: "t1" } as const;
    assert.equal(
      reason(room, { ...join, displayName: "  sam " }),
      "display_name_taken",
    );
  });

  it("locks the room once the reveal starts", () => {
    const room = must(submitted("Cher", "Prince"), {
      type: "startReveal",
      playerId: "p0",
    });
    const join = {
      type: "join",
      playerId: "p9",
      sessionToken: "t9",
      displayName: "Late",
    } as const;
    assert.equal(reason(room, join), "room_locked");
  });

  it("enforces the tier's player cap", () => {
    const max = TIER_LIMITS.free.maxPlayers;
    const room = lobby(...Array.from({ length: max }, (_, i) => `Player ${i}`));
    const join = {
      type: "join",
      playerId: "px",
      sessionToken: "tx",
      displayName: "One more",
    } as const;
    assert.equal(reason(room, join), "room_full");
  });
});

describe("acting players", () => {
  it("rejects actions from a player who isn't in the room", () => {
    assert.equal(
      reason(lobby("Sam"), { type: "startReveal", playerId: "ghost" }),
      "not_in_room",
    );
  });

  it("tracks connection state without moving the host", () => {
    const room = must(lobby("Sam", "Alex"), {
      type: "disconnect",
      playerId: "p0",
    });
    assert.equal(room.players[0]!.connected, false);
    assert.equal(room.hostId, "p0");
    assert.equal(
      must(room, { type: "connect", playerId: "p0" }).players[0]!.connected,
      true,
    );
  });
});

describe("leaving and kicking", () => {
  it("passes hosting to the next seat when the host leaves", () => {
    const room = must(lobby("Sam", "Alex", "Jo"), {
      type: "leave",
      playerId: "p0",
    });
    assert.equal(room.hostId, "p1");
    assert.deepEqual(
      room.players.map((p) => p.id),
      ["p1", "p2"],
    );
  });

  it("wraps hosting to the first seat when the last-seated host leaves", () => {
    const room = { ...lobby("Sam", "Alex", "Jo"), hostId: "p2" };
    assert.equal(must(room, { type: "leave", playerId: "p2" }).hostId, "p0");
  });

  it("lets only the host kick, and not themselves", () => {
    const room = lobby("Sam", "Alex");
    assert.equal(
      reason(room, { type: "kick", playerId: "p1", targetId: "p0" }),
      "not_host",
    );
    assert.equal(
      reason(room, { type: "kick", playerId: "p0", targetId: "p0" }),
      "invalid_message",
    );
    assert.equal(
      reason(room, { type: "kick", playerId: "p0", targetId: "nope" }),
      "not_in_room",
    );
    assert.equal(
      must(room, { type: "kick", playerId: "p0", targetId: "p1" }).players
        .length,
      1,
    );
  });
});

describe("submitting names", () => {
  it("lets a player change their name until the reveal", () => {
    let room = must(lobby("Sam"), {
      type: "submitName",
      playerId: "p0",
      name: "Cher",
    });
    room = must(room, { type: "submitName", playerId: "p0", name: "Prince" });
    assert.equal(room.players[0]!.name, "Prince");
  });

  it("asks the later submitter to pick again on a duplicate", () => {
    const room = must(lobby("Sam", "Alex"), {
      type: "submitName",
      playerId: "p0",
      name: "Beyoncé",
    });
    assert.equal(
      reason(room, { type: "submitName", playerId: "p1", name: "beyonce " }),
      "duplicate_name",
    );
  });

  it("allows resubmitting your own name", () => {
    const room = must(lobby("Sam"), {
      type: "submitName",
      playerId: "p0",
      name: "Cher",
    });
    assert.equal(
      reason(room, { type: "submitName", playerId: "p0", name: "CHER" }),
      null,
    );
  });

  it("closes submissions once the reveal starts", () => {
    const room = must(submitted("Cher", "Prince"), {
      type: "startReveal",
      playerId: "p0",
    });
    assert.equal(
      reason(room, { type: "submitName", playerId: "p1", name: "Madonna" }),
      "wrong_phase",
    );
  });
});

describe("settings", () => {
  it("lets the host set reminders in the lobby, resetting the count", () => {
    const room = must(lobby("Sam"), {
      type: "updateSettings",
      playerId: "p0",
      settings: { reminders: 3 },
    });
    assert.equal(room.remindersLeft, 3);
  });

  it("is host-only and lobby-only", () => {
    const settings = { reminders: 0 };
    assert.equal(
      reason(lobby("Sam", "Alex"), {
        type: "updateSettings",
        playerId: "p1",
        settings,
      }),
      "not_host",
    );
    const revealing = must(submitted("Cher", "Prince"), {
      type: "startReveal",
      playerId: "p0",
    });
    assert.equal(
      reason(revealing, { type: "updateSettings", playerId: "p0", settings }),
      "wrong_phase",
    );
  });
});

describe("the reveal", () => {
  it("needs at least two names", () => {
    assert.equal(
      reason(submitted("Cher"), { type: "startReveal", playerId: "p0" }),
      "not_enough_names",
    );
  });

  it("can start before everyone has submitted", () => {
    let room = submitted("Cher", "Prince");
    room = must(room, {
      type: "join",
      playerId: "p9",
      sessionToken: "t9",
      displayName: "Late",
    });
    room = must(room, { type: "startReveal", playerId: "p0" });
    assert.deepEqual(room.revealOrder, ["Cher", "Prince"]);
  });

  it("shuffles the names", () => {
    const room = submitted("Cher", "Prince", "Madonna");
    const result = apply(
      room,
      { type: "startReveal", playerId: "p0" },
      () => 0,
    );
    assert.ok(result.ok);
    assert.deepEqual(result.room.revealOrder, ["Prince", "Madonna", "Cher"]);
  });

  it("is driven by the host", () => {
    const room = submitted("Cher", "Prince");
    assert.equal(
      reason(room, { type: "startReveal", playerId: "p1" }),
      "not_host",
    );
    const revealing = must(room, { type: "startReveal", playerId: "p0" });
    assert.equal(
      reason(revealing, { type: "finishReveal", playerId: "p1" }),
      "not_host",
    );
    assert.equal(
      must(revealing, { type: "finishReveal", playerId: "p0" }).phase,
      "play",
    );
  });
});

describe("reminders", () => {
  function playing(reminders: number): Room {
    let room = submitted("Cher", "Prince");
    room = must(room, {
      type: "updateSettings",
      playerId: "p0",
      settings: { reminders },
    });
    room = must(room, { type: "startReveal", playerId: "p0" });
    return must(room, { type: "finishReveal", playerId: "p0" });
  }

  it("replays the reveal and uses one up", () => {
    const room = must(playing(1), { type: "remind", playerId: "p0" });
    assert.equal(room.phase, "reveal");
    assert.equal(room.remindersLeft, 0);
    assert.deepEqual([...(room.revealOrder ?? [])].sort(), ["Cher", "Prince"]);
  });

  it("runs out", () => {
    let room = must(playing(1), { type: "remind", playerId: "p0" });
    room = must(room, { type: "finishReveal", playerId: "p0" });
    assert.equal(
      reason(room, { type: "remind", playerId: "p0" }),
      "no_reminders_left",
    );
    assert.equal(
      reason(playing(0), { type: "remind", playerId: "p0" }),
      "no_reminders_left",
    );
  });

  it("only happens during play", () => {
    assert.equal(
      reason(submitted("Cher", "Prince"), { type: "remind", playerId: "p0" }),
      "wrong_phase",
    );
  });
});

describe("viewFor", () => {
  it("never shows another player's name", () => {
    const view = viewFor(submitted("Cher", "Prince"), "p1");
    assert.equal(view.you.submittedName, "Prince");
    assert.deepEqual(
      view.players.map((p) => p.submitted),
      [true, true],
    );
    assert.equal(JSON.stringify(view).includes("Cher"), false);
  });

  it("shows the shuffled names only to the host, only during the reveal", () => {
    const revealing = must(submitted("Cher", "Prince"), {
      type: "startReveal",
      playerId: "p0",
    });
    assert.deepEqual(viewFor(revealing, "p0").names, ["Cher", "Prince"]);
    assert.equal(viewFor(revealing, "p1").names, null);
    const playing = must(revealing, { type: "finishReveal", playerId: "p0" });
    assert.equal(viewFor(playing, "p0").names, null);
  });

  it("never exposes session tokens", () => {
    assert.equal(
      JSON.stringify(viewFor(lobby("Sam", "Alex"), "p0")).includes("t1"),
      false,
    );
  });
});

describe("normalizeName", () => {
  it("ignores case, accents, and extra spacing", () => {
    assert.equal(normalizeName("  Beyoncé   Knowles "), "beyonce knowles");
  });
});
