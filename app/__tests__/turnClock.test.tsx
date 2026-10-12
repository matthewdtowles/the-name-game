import type { GameView, PlayerView } from "@tng/shared";
import { act, renderHook } from "@testing-library/react-native";

import { clockText, useTurnClock } from "../lib/turnClock";

const player = (id: string, name: string | null = null): PlayerView => ({
  id,
  displayName: id,
  connected: true,
  submitted: true,
  team: id,
  name,
});
const game = (overrides: Partial<GameView> = {}): GameView => ({
  turn: "p1",
  pending: null,
  winners: null,
  canUndo: false,
  ...overrides,
});
const players = [player("p1"), player("p2"), player("p3")];

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function clock(initial: GameView, seconds: number | null = 30) {
  return renderHook(
    ({ g, ps }: { g: GameView; ps: PlayerView[] }) =>
      useTurnClock(g, ps, seconds),
    { initialProps: { g: initial, ps: players } },
  );
}

it("is off without a time set", async () => {
  const { result } = await clock(game(), null);
  expect(result.current).toBeNull();
});

it("counts down, and holds while a guess waits for an answer", async () => {
  const { result, rerender } = await clock(game());
  expect(result.current).toBe(30);
  await act(() => jest.advanceTimersByTime(10_000));
  expect(result.current).toBe(20);

  const pending = { by: "p1", team: "p1", target: "p2" };
  await rerender({ g: game({ pending }), ps: players });
  await act(() => jest.advanceTimersByTime(60_000));
  expect(result.current).toBe(20);

  // Taken back: it picks up where it was.
  await rerender({ g: game(), ps: players });
  await act(() => jest.advanceTimersByTime(5_000));
  expect(result.current).toBe(15);
  await act(() => jest.advanceTimersByTime(30_000));
  expect(result.current).toBe(0);
});

it("starts over when the turn passes or after a right guess", async () => {
  const { result, rerender } = await clock(game());
  await act(() => jest.advanceTimersByTime(30_000));
  expect(result.current).toBe(0);

  // A new turn shows the full time at once, never the last turn's 0.
  await rerender({ g: game({ turn: "p2" }), ps: players });
  expect(result.current).toBe(30);
  await act(() => jest.advanceTimersByTime(12_000));
  expect(result.current).toBe(18);

  const guessed = [player("p1"), player("p2"), player("p3", "Cher")];
  await rerender({ g: game({ turn: "p2" }), ps: guessed });
  expect(result.current).toBe(30);
});

it("reads as minutes and seconds", () => {
  expect(clockText(90)).toBe("1:30");
  expect(clockText(5)).toBe("0:05");
});
