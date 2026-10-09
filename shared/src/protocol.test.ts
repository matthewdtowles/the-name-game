import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ClientMessage,
  DISPLAY_NAME_MAX,
  MAX_REMINDERS,
  MAX_REVEAL_SECONDS,
  MIN_REVEAL_SECONDS,
  RoomCode,
  ServerMessage,
  type RoomView,
} from "./protocol";

describe("RoomCode", () => {
  it("normalizes case and surrounding whitespace", () => {
    assert.equal(RoomCode.parse(" abcd "), "ABCD");
  });

  it("rejects the ambiguous letters I, L and O", () => {
    for (const code of ["ABCI", "ABCL", "ABCO"]) {
      assert.equal(RoomCode.safeParse(code).success, false, code);
    }
  });

  it("rejects digits and the wrong length", () => {
    for (const code of ["ABC1", "ABC", "ABCDE", ""]) {
      assert.equal(RoomCode.safeParse(code).success, false, code);
    }
  });
});

describe("ClientMessage", () => {
  it("accepts every intent", () => {
    const messages = [
      { type: "create", displayName: "Sam" },
      { type: "join", code: "WXYZ", displayName: "Sam" },
      { type: "resume", code: "WXYZ", sessionToken: "token" },
      { type: "submitName", name: "Dolly Parton" },
      {
        type: "updateSettings",
        settings: { reminders: 0, revealSeconds: null },
      },
      { type: "kick", playerId: "p1" },
      { type: "startReveal" },
      { type: "finishReveal" },
      { type: "remind" },
      { type: "leave" },
      { type: "revealTo", index: 2 },
      { type: "revealAll", all: true },
      { type: "display" },
      { type: "display", code: "WXYZ" },
      { type: "moveSeat", playerId: "p2", to: 0 },
      { type: "guess", playerId: "p2" },
      { type: "answerGuess", correct: true },
      { type: "cancelGuess" },
      { type: "endRound" },
      { type: "undo" },
      { type: "playAgain" },
      { type: "ping" },
    ];
    for (const message of messages) {
      assert.equal(
        ClientMessage.safeParse(message).success,
        true,
        message.type,
      );
    }
  });

  it("rejects an unknown type", () => {
    assert.equal(ClientMessage.safeParse({ type: "peek" }).success, false);
  });

  it("trims names and rejects blank ones", () => {
    assert.deepEqual(
      ClientMessage.parse({ type: "submitName", name: "  Cher " }),
      {
        type: "submitName",
        name: "Cher",
      },
    );
    assert.equal(
      ClientMessage.safeParse({ type: "submitName", name: "   " }).success,
      false,
    );
  });

  it("caps display name length", () => {
    const displayName = "x".repeat(DISPLAY_NAME_MAX + 1);
    assert.equal(
      ClientMessage.safeParse({ type: "create", displayName }).success,
      false,
    );
  });

  it("bounds reminders to whole numbers from 0 to the max", () => {
    for (const reminders of [-1, MAX_REMINDERS + 1, 1.5]) {
      const message = {
        type: "updateSettings",
        settings: { reminders, revealSeconds: null },
      };
      assert.equal(
        ClientMessage.safeParse(message).success,
        false,
        String(reminders),
      );
    }
  });
});

describe("ServerMessage", () => {
  it("round-trips a room view", () => {
    const room: RoomView = {
      code: "WXYZ",
      phase: "reveal",
      tier: "free",
      settings: { reminders: 1, revealSeconds: null },
      hostId: "p1",
      players: [
        {
          id: "p1",
          displayName: "Sam",
          connected: true,
          submitted: true,
          team: "p1",
          name: null,
        },
        {
          id: "p2",
          displayName: "Alex",
          connected: false,
          submitted: true,
          team: "p1",
          name: "Cher",
        },
      ],
      you: { playerId: "p1", submittedName: "Dolly Parton" },
      remindersLeft: 1,
      reveal: {
        index: 0,
        total: 2,
        all: false,
        names: ["Cher", "Dolly Parton"],
      },
      tv: false,
      game: {
        turn: "p1",
        pending: { by: "p1", team: "p1", target: "p2" },
        winners: null,
        canUndo: true,
      },
    };
    const message = { type: "room", room };
    assert.deepEqual(
      ServerMessage.parse(JSON.parse(JSON.stringify(message))),
      message,
    );
  });

  it("round-trips a TV screen", () => {
    const message = {
      type: "screen",
      screen: {
        code: "WXYZ",
        phase: "reveal",
        hostId: null,
        players: [],
        remindersLeft: 0,
        reveal: { index: 1, total: 3, slips: ["Cher"] },
        game: null,
      },
    };
    assert.deepEqual(
      ServerMessage.parse(JSON.parse(JSON.stringify(message))),
      message,
    );
  });

  it("bounds the seconds per name", () => {
    for (const revealSeconds of [
      MIN_REVEAL_SECONDS - 1,
      MAX_REVEAL_SECONDS + 1,
    ]) {
      const message = {
        type: "updateSettings",
        settings: { reminders: 1, revealSeconds },
      };
      assert.equal(
        ClientMessage.safeParse(message).success,
        false,
        String(revealSeconds),
      );
    }
  });

  it("rejects an unknown error reason", () => {
    const message = { type: "error", reason: "oops", message: "" };
    assert.equal(ServerMessage.safeParse(message).success, false);
  });
});
