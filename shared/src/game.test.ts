import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apply,
  createRoom,
  screenFor,
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
      settings: { reminders: 3, revealSeconds: null },
    });
    assert.equal(room.remindersLeft, 3);
  });

  it("is host-only and lobby-only", () => {
    const settings = { reminders: 0, revealSeconds: null };
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
    assert.deepEqual(room.reveal?.order, ["Cher", "Prince"]);
  });

  it("shuffles the names", () => {
    const room = submitted("Cher", "Prince", "Madonna");
    const result = apply(
      room,
      { type: "startReveal", playerId: "p0" },
      () => 0,
    );
    assert.ok(result.ok);
    assert.deepEqual(result.room.reveal?.order, ["Prince", "Madonna", "Cher"]);
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
      settings: { reminders, revealSeconds: null },
    });
    room = must(room, { type: "startReveal", playerId: "p0" });
    return must(room, { type: "finishReveal", playerId: "p0" });
  }

  it("replays the reveal and uses one up", () => {
    const room = must(playing(1), { type: "remind", playerId: "p0" });
    assert.equal(room.phase, "reveal");
    assert.equal(room.remindersLeft, 0);
    assert.deepEqual([...(room.reveal?.order ?? [])].sort(), [
      "Cher",
      "Prince",
    ]);
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
    assert.deepEqual(viewFor(revealing, "p0").reveal?.names, [
      "Cher",
      "Prince",
    ]);
    assert.equal(viewFor(revealing, "p1").reveal?.names, null);
    const playing = must(revealing, { type: "finishReveal", playerId: "p0" });
    assert.equal(viewFor(playing, "p0").reveal, null);
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

describe("TVs", () => {
  const tvRoom = () =>
    must(createRoom({ code: "WXYZ", tier: "free" }), { type: "attachDisplay" });

  it("lets a TV open a room that its first player hosts", () => {
    let room = tvRoom();
    assert.equal(room.hostId, null);
    assert.equal(room.displays, 1);
    room = must(room, {
      type: "join",
      playerId: "p1",
      sessionToken: "t1",
      displayName: "Sam",
    });
    room = must(room, {
      type: "join",
      playerId: "p2",
      sessionToken: "t2",
      displayName: "Alex",
    });
    assert.equal(room.hostId, "p1");
  });

  it("leaves the room hostless when its last player goes", () => {
    let room = must(tvRoom(), {
      type: "join",
      playerId: "p1",
      sessionToken: "t1",
      displayName: "Sam",
    });
    room = must(room, { type: "leave", playerId: "p1" });
    assert.equal(room.hostId, null);
    assert.equal(room.displays, 1);
  });

  it("counts TVs coming and going, never below zero", () => {
    let room = must(tvRoom(), { type: "attachDisplay" });
    room = must(room, { type: "detachDisplay" });
    room = must(room, { type: "detachDisplay" });
    room = must(room, { type: "detachDisplay" });
    assert.equal(room.displays, 0);
  });

  it("moves the names off the host's phone while a TV is attached", () => {
    let room = must(submitted("Cher", "Prince"), { type: "attachDisplay" });
    room = must(room, { type: "startReveal", playerId: "p0" });
    const host = viewFor(room, "p0");
    assert.equal(host.tv, true);
    assert.equal(host.reveal?.names, null);
    assert.equal(host.reveal?.total, 2);
  });

  it("shows only the current slip, or every slip when asked", () => {
    let room = must(submitted("Cher", "Prince", "Madonna"), {
      type: "startReveal",
      playerId: "p0",
    });
    assert.deepEqual(screenFor(room).reveal?.slips, ["Cher"]);
    room = must(room, { type: "revealTo", playerId: "p0", index: 2 });
    assert.deepEqual(screenFor(room).reveal, {
      index: 2,
      total: 3,
      slips: ["Madonna"],
    });
    room = must(room, { type: "revealAll", playerId: "p0", all: true });
    assert.deepEqual(screenFor(room).reveal?.slips, [
      "Cher",
      "Prince",
      "Madonna",
    ]);
  });

  it("never shows a submitted name outside the reveal", () => {
    const lobbyRoom = submitted("Cher", "Prince");
    assert.equal(JSON.stringify(screenFor(lobbyRoom)).includes("Cher"), false);
    let room = must(lobbyRoom, { type: "startReveal", playerId: "p0" });
    room = must(room, { type: "finishReveal", playerId: "p0" });
    assert.equal(screenFor(room).reveal, null);
    assert.equal(JSON.stringify(screenFor(room)).includes("Cher"), false);
  });
});

describe("stepping through the reveal", () => {
  const revealing = () =>
    must(submitted("Cher", "Prince"), { type: "startReveal", playerId: "p0" });

  it("is the host's to drive", () => {
    assert.equal(
      reason(revealing(), { type: "revealTo", playerId: "p1", index: 1 }),
      "not_host",
    );
    assert.equal(
      reason(revealing(), { type: "revealAll", playerId: "p1", all: true }),
      "not_host",
    );
  });

  it("goes to a slip by position and stays in range", () => {
    const room = must(revealing(), {
      type: "revealTo",
      playerId: "p0",
      index: 1,
    });
    assert.equal(room.reveal?.index, 1);
    assert.equal(
      reason(revealing(), { type: "revealTo", playerId: "p0", index: 2 }),
      "invalid_message",
    );
  });

  it("only happens during the reveal", () => {
    assert.equal(
      reason(submitted("Cher", "Prince"), {
        type: "revealTo",
        playerId: "p0",
        index: 0,
      }),
      "wrong_phase",
    );
  });

  it("starts each reminder from the first slip", () => {
    let room = must(revealing(), {
      type: "revealTo",
      playerId: "p0",
      index: 1,
    });
    room = must(room, { type: "revealAll", playerId: "p0", all: true });
    room = must(room, { type: "finishReveal", playerId: "p0" });
    room = must(room, { type: "remind", playerId: "p0" });
    assert.equal(room.reveal?.index, 0);
    assert.equal(room.reveal?.all, false);
  });
});

describe("the guessing game", () => {
  // Sam (p0, host), Alex (p1), Jo (p2), Kim (p3), with names in the hat, past
  // the reveal and playing.
  function playing(count = 4, reminders = 1): Room {
    const names = ["Cher", "Prince", "Madonna", "Bono"].slice(0, count);
    let room = submitted(...names);
    room = must(room, {
      type: "updateSettings",
      playerId: "p0",
      settings: { reminders, revealSeconds: null },
    });
    room = must(room, { type: "startReveal", playerId: "p0" });
    return must(room, { type: "finishReveal", playerId: "p0" });
  }
  const guess = (room: Room, by: string, target: string) =>
    must(room, { type: "guess", playerId: by, targetId: target });
  const answer = (room: Room, by: string, correct: boolean) =>
    must(room, { type: "answerGuess", playerId: by, correct });
  const teamOf = (room: Room, id: string) => room.game?.teams[id];

  it("starts everyone with a name as a team of one, first seat first", () => {
    let room = lobby("Sam", "Alex", "Jo");
    room = must(room, { type: "submitName", playerId: "p0", name: "Cher" });
    room = must(room, { type: "submitName", playerId: "p2", name: "Prince" });
    room = must(room, { type: "startReveal", playerId: "p0" });
    assert.deepEqual(room.game?.teams, { p0: "p0", p2: "p2" });
    assert.equal(room.game?.turn, "p0");
    // Alex put no name in, so watches.
    assert.equal(viewFor(room, "p1").players[1]!.team, null);
  });

  it("lets only the team whose turn it is guess another team's leader", () => {
    const room = playing();
    assert.equal(
      reason(room, { type: "guess", playerId: "p1", targetId: "p2" }),
      "not_your_turn",
    );
    assert.equal(
      reason(room, { type: "guess", playerId: "p0", targetId: "p0" }),
      "invalid_target",
    );
    const pending = guess(room, "p0", "p2");
    assert.deepEqual(pending.game?.pending, {
      by: "p0",
      team: "p0",
      target: "p2",
    });
    assert.equal(
      reason(pending, { type: "guess", playerId: "p0", targetId: "p1" }),
      "guess_pending",
    );
  });

  it("takes the answer from the guessed player or the host", () => {
    const room = guess(playing(), "p0", "p2");
    assert.equal(
      reason(room, { type: "answerGuess", playerId: "p1", correct: true }),
      "not_your_turn",
    );
    assert.equal(
      reason(room, { type: "answerGuess", playerId: "p2", correct: true }),
      null,
    );
    assert.equal(
      reason(room, { type: "answerGuess", playerId: "p0", correct: true }),
      null,
    );
  });

  it("brings a correctly guessed player onto the team, which goes again", () => {
    const room = answer(guess(playing(), "p0", "p2"), "p2", true);
    assert.equal(teamOf(room, "p2"), "p0");
    assert.equal(room.game?.turn, "p0");
    // Their name was said out loud, so it's public now.
    assert.equal(viewFor(room, "p3").players[2]!.name, "Madonna");
    assert.equal(viewFor(room, "p3").players[1]!.name, null);
    // Any member of the team may guess on its turn.
    assert.equal(guess(room, "p2", "p1").game?.pending?.team, "p0");
  });

  it("passes the turn to the next team in seat order on a wrong guess", () => {
    let room = answer(guess(playing(), "p0", "p2"), "p2", false);
    assert.equal(room.game?.turn, "p1");
    room = answer(guess(room, "p1", "p3"), "p3", false);
    room = answer(guess(room, "p2", "p0"), "p0", false);
    room = answer(guess(room, "p3", "p0"), "p0", false);
    assert.equal(room.game?.turn, "p0", "wraps around");
  });

  it("brings a whole team over by guessing its leader, keeping the guesser's seat", () => {
    // Jo's team takes Kim; then Sam takes Jo and with her, Kim.
    let room = answer(guess(playing(), "p0", "p1"), "p1", false);
    room = answer(guess(room, "p1", "p2"), "p2", false);
    room = answer(guess(room, "p2", "p3"), "p3", true);
    room = answer(guess(room, "p3", "p1"), "p1", false);
    assert.equal(room.game?.turn, "p0");
    room = answer(guess(room, "p0", "p2"), "p2", true);
    assert.equal(teamOf(room, "p2"), "p0");
    assert.equal(teamOf(room, "p3"), "p0");
    // A wrong guess from Sam's team now skips Jo and Kim, who are on it.
    room = answer(guess(room, "p0", "p1"), "p1", false);
    assert.equal(room.game?.turn, "p1");
  });

  it("ends when one team holds everyone, and then shows who wrote what", () => {
    let room = answer(guess(playing(3), "p0", "p1"), "p1", true);
    assert.equal(room.phase, "play");
    room = answer(guess(room, "p0", "p2"), "p2", true);
    assert.equal(room.phase, "over");
    assert.deepEqual(room.game?.winners, ["p0"]);
    assert.deepEqual(
      viewFor(room, "p1").players.map((p) => p.name),
      ["Cher", "Prince", "Madonna"],
    );
  });

  it("lets the guessing team or the host take back a guess", () => {
    const room = guess(playing(), "p0", "p2");
    assert.equal(
      reason(room, { type: "cancelGuess", playerId: "p1" }),
      "not_your_turn",
    );
    const cancelled = must(room, { type: "cancelGuess", playerId: "p0" });
    assert.equal(cancelled.game?.pending, null);
  });

  it("lets the host end the round once no reminders are left", () => {
    let room = answer(guess(playing(4, 0), "p0", "p1"), "p1", true);
    room = answer(guess(room, "p0", "p2"), "p2", false);
    assert.equal(
      reason(room, { type: "endRound", playerId: "p1" }),
      "not_host",
    );
    room = must(room, { type: "endRound", playerId: "p0" });
    assert.equal(room.phase, "over");
    assert.deepEqual(room.game?.winners, ["p0"]);
  });

  it("shares the win between the largest teams on a tie", () => {
    let room = answer(guess(playing(4, 0), "p0", "p1"), "p1", true);
    room = answer(guess(room, "p0", "p2"), "p2", false);
    room = answer(guess(room, "p2", "p3"), "p3", true);
    room = must(room, { type: "endRound", playerId: "p0" });
    assert.deepEqual(room.game?.winners, ["p0", "p2"]);
  });

  it("won't end the round while reminders are left", () => {
    assert.equal(
      reason(playing(4, 1), { type: "endRound", playerId: "p0" }),
      "reminders_left",
    );
  });

  it("lets the host undo answers, even after the game ended", () => {
    const before = guess(playing(2), "p0", "p1");
    const won = answer(before, "p1", true);
    assert.equal(won.phase, "over");
    const undone = must(won, { type: "undo", playerId: "p0" });
    assert.equal(undone.phase, "play");
    assert.deepEqual(undone.game, before.game);
    assert.equal(
      reason(undone, { type: "undo", playerId: "p0" }),
      "nothing_to_undo",
    );
  });

  it("starts a new game with the same players and seats", () => {
    const won = answer(guess(playing(2), "p0", "p1"), "p1", true);
    const again = must(won, { type: "playAgain", playerId: "p0" });
    assert.equal(again.phase, "lobby");
    assert.equal(again.game, null);
    assert.deepEqual(
      again.players.map((p) => [p.id, p.name]),
      [
        ["p0", null],
        ["p1", null],
      ],
    );
  });

  it("drops a team whose leader leaves, passing the turn on", () => {
    let room = answer(guess(playing(3), "p0", "p1"), "p1", false);
    assert.equal(room.game?.turn, "p1");
    room = must(room, { type: "leave", playerId: "p1" });
    assert.equal(room.game?.turn, "p2");
    room = must(room, { type: "leave", playerId: "p2" });
    assert.equal(room.phase, "over");
    assert.deepEqual(room.game?.winners, ["p0"]);
  });

  it("keeps the game through a reminder", () => {
    let room = answer(guess(playing(), "p0", "p1"), "p1", true);
    room = must(room, { type: "remind", playerId: "p0" });
    room = must(room, { type: "finishReveal", playerId: "p0" });
    assert.equal(teamOf(room, "p1"), "p0");
  });
});

describe("seats", () => {
  it("lets the host move players around the lobby", () => {
    const room = must(lobby("Sam", "Alex", "Jo"), {
      type: "moveSeat",
      playerId: "p0",
      targetId: "p2",
      to: 0,
    });
    assert.deepEqual(
      room.players.map((p) => p.displayName),
      ["Jo", "Sam", "Alex"],
    );
    assert.equal(
      reason(lobby("Sam", "Alex"), {
        type: "moveSeat",
        playerId: "p1",
        targetId: "p0",
        to: 1,
      }),
      "not_host",
    );
  });
});
