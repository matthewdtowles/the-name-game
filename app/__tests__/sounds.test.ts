import { cueFor, type Scene } from "../lib/sounds";

jest.mock("expo-audio", () => ({}));

const play: Scene = {
  phase: "play",
  slip: null,
  turn: "p1",
  pending: false,
  named: 1,
  players: 4,
  winners: false,
  timed: true,
};

describe("cueFor", () => {
  it("stays quiet on the first view", () => {
    expect(cueFor(null, play)).toBeNull();
  });

  it("plays a slip for each name in the reveal, including the first", () => {
    const reveal = { ...play, phase: "reveal" as const, slip: 0 };
    expect(cueFor({ ...play, phase: "lobby" }, reveal)).toBe("slip");
    expect(cueFor(reveal, { ...reveal, slip: 1 })).toBe("slip");
    expect(cueFor(reveal, reveal)).toBeNull();
  });

  it("chimes when a name is guessed", () => {
    expect(cueFor({ ...play, pending: true }, { ...play, named: 2 })).toBe(
      "correct",
    );
  });

  it("buzzes when the clock passes the turn, but not for a wrong guess", () => {
    expect(cueFor(play, { ...play, turn: "p3" })).toBe("timeUp");
    expect(cueFor({ ...play, pending: true }, { ...play, turn: "p3" })).toBe(
      null,
    );
    expect(cueFor(play, { ...play, turn: "p3", timed: false })).toBeNull();
  });

  it("stays quiet when someone leaves and the turn moves on", () => {
    expect(cueFor(play, { ...play, turn: "p3", players: 3 })).toBeNull();
  });

  it("stays quiet when the host undoes a right guess", () => {
    expect(cueFor(play, { ...play, named: 0, pending: true })).toBeNull();
  });

  it("plays the winners in once, when the game ends with a winner", () => {
    const over = { ...play, phase: "over" as const, winners: true };
    expect(cueFor(play, over)).toBe("winners");
    expect(cueFor(over, over)).toBeNull();
    expect(cueFor(play, { ...over, winners: false })).toBeNull();
  });
});
