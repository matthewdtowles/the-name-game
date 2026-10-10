import type { GameView, RoomView, ScreenView } from "@tng/shared";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import Home from "../app/index";
import Privacy from "../app/privacy";
import { Lobby } from "../components/Lobby";
import { Over } from "../components/Over";
import { Play } from "../components/Play";
import { Reveal } from "../components/Reveal";
import { TvView } from "../components/Tv";
import type { GameState } from "../lib/game/client";

const mockGame: GameState & { send: jest.Mock; clearError: jest.Mock } = {
  status: "open",
  session: null,
  room: null,
  error: null,
  send: jest.fn(() => true),
  clearError: jest.fn(),
};

jest.mock("../lib/game/GameContext", () => ({ useGame: () => mockGame }));
// Link renders its label as Text, like the real one.
jest.mock("expo-router", () => ({
  Redirect: () => null,
  Link: ({ children }: { children: string }) =>
    require("react").createElement(
      require("react-native").Text,
      null,
      children,
    ),
}));

function room(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: "WXYZ",
    phase: "lobby",
    tier: "free",
    settings: { reminders: 1, revealSeconds: null },
    hostId: "p1",
    players: [
      {
        id: "p1",
        displayName: "Sam",
        connected: true,
        submitted: true,
        team: null,
        name: null,
      },
      {
        id: "p2",
        displayName: "Alex",
        connected: true,
        submitted: true,
        team: null,
        name: null,
      },
      {
        id: "p3",
        displayName: "Jo",
        connected: true,
        submitted: false,
        team: null,
        name: null,
      },
    ],
    you: { playerId: "p1", submittedName: "Cher" },
    remindersLeft: 1,
    reveal: null,
    tv: false,
    game: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockGame.send.mockClear();
  mockGame.status = "open";
  mockGame.error = null;
});

describe("Home", () => {
  it("hosts a game once you've given a name", async () => {
    await render(<Home />);
    const host = screen.getByRole("button", { name: "Host a game" });
    expect(host).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Your name"), "Sam");
    await fireEvent.press(screen.getByRole("button", { name: "Host a game" }));
    expect(mockGame.send).toHaveBeenCalledWith({
      type: "create",
      displayName: "Sam",
    });
  });

  it("joins with a typed code, uppercased", async () => {
    await render(<Home />);
    await fireEvent.changeText(screen.getByLabelText("Your name"), "Alex");
    await fireEvent.changeText(
      screen.getByLabelText("Or join with a code"),
      "wxyz",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Join game" }));
    expect(mockGame.send).toHaveBeenCalledWith({
      type: "join",
      code: "WXYZ",
      displayName: "Alex",
    });
  });

  it("waits for the connection", async () => {
    mockGame.status = "connecting";
    await render(<Home />);
    await fireEvent.changeText(screen.getByLabelText("Your name"), "Sam");
    expect(screen.getByRole("button", { name: "Host a game" })).toBeDisabled();
  });
});

describe("Privacy", () => {
  it("links from home", async () => {
    await render(<Home />);
    expect(screen.getByText("Privacy")).toBeTruthy();
  });

  it("states the retention promise", async () => {
    await render(<Privacy />);
    expect(screen.getByText(/deleted automatically a day after/)).toBeTruthy();
    expect(
      screen.getByText("No accounts, ads, analytics, or tracking cookies."),
    ).toBeTruthy();
  });
});

describe("Lobby", () => {
  it("shows who's in without showing anyone else's name", async () => {
    await render(
      <Lobby
        room={room({ you: { playerId: "p2", submittedName: "Prince" } })}
      />,
    );
    expect(screen.getByText("Prince")).toBeTruthy();
    expect(screen.queryByText("Cher")).toBeNull();
    expect(screen.getAllByText("✓ name in")).toHaveLength(2);
    expect(screen.getByText("writing")).toBeTruthy();
  });

  it("asks the host to confirm starting before everyone's in", async () => {
    await render(<Lobby room={room()} />);
    await fireEvent.press(
      screen.getByRole("button", { name: "Read the names (2 of 3 in)" }),
    );
    expect(mockGame.send).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole("button", { name: "Start without 1 player?" }),
    );
    expect(mockGame.send).toHaveBeenCalledWith({ type: "startReveal" });
  });

  it("starts straight away once everyone's in", async () => {
    const everyone = room().players.map((p) => ({ ...p, submitted: true }));
    await render(<Lobby room={room({ players: everyone })} />);
    await fireEvent.press(
      screen.getByRole("button", { name: "Read the names" }),
    );
    expect(mockGame.send).toHaveBeenCalledWith({ type: "startReveal" });
  });

  it("gives players no host controls", async () => {
    await render(
      <Lobby room={room({ you: { playerId: "p2", submittedName: null } })} />,
    );
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByText("Reminders")).toBeNull();
    expect(
      screen.getByText("Sam will read the names once everyone’s in."),
    ).toBeTruthy();
  });

  it("submits a secret name and shows a duplicate as a field error", async () => {
    await render(
      <Lobby room={room({ you: { playerId: "p3", submittedName: null } })} />,
    );
    await fireEvent.changeText(
      screen.getByLabelText("Who’s on your slip?"),
      "  Prince ",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Put it in the hat" }),
    );
    expect(mockGame.send).toHaveBeenCalledWith({
      type: "submitName",
      name: "Prince",
    });

    mockGame.error = {
      reason: "duplicate_name",
      message: "Someone already picked that name.",
    };
    await render(
      <Lobby room={room({ you: { playerId: "p3", submittedName: null } })} />,
    );
    expect(screen.getByText("Someone already picked that name.")).toBeTruthy();
  });

  it("lets the host change the number of reminders", async () => {
    await render(<Lobby room={room()} />);
    await fireEvent.press(
      screen.getByRole("button", { name: "More reminders" }),
    );
    expect(mockGame.send).toHaveBeenCalledWith({
      type: "updateSettings",
      settings: { reminders: 2, revealSeconds: null },
    });
  });

  it("lets the host rearrange seats", async () => {
    await render(<Lobby room={room()} />);
    await fireEvent.press(screen.getByRole("button", { name: "Move Jo up" }));
    expect(mockGame.send).toHaveBeenCalledWith({
      type: "moveSeat",
      playerId: "p3",
      to: 1,
    });
    expect(screen.getByRole("button", { name: "Move Sam up" })).toBeDisabled();
  });

  it("lets the host set the reveal's pace", async () => {
    await render(<Lobby room={room()} />);
    await fireEvent.press(screen.getByRole("button", { name: "8 s" }));
    expect(mockGame.send).toHaveBeenCalledWith({
      type: "updateSettings",
      settings: { reminders: 1, revealSeconds: 8 },
    });
  });

  it("points the host at the TV page, and says when a TV is on", async () => {
    await render(<Lobby room={room()} />);
    expect(screen.getByText(/Have a TV\? Open .*\/tv\/WXYZ/)).toBeTruthy();
    await render(<Lobby room={room({ tv: true })} />);
    expect(screen.getByText("✓ Showing on a TV")).toBeTruthy();
  });
});

describe("Reveal", () => {
  const reveal = (
    index: number,
    names: string[] | null = ["Cher", "Prince"],
  ) => ({
    index,
    total: 2,
    all: false,
    names,
  });

  it("walks the host through the names one at a time", async () => {
    await render(
      <Reveal room={room({ phase: "reveal", reveal: reveal(0) })} />,
    );
    expect(screen.getByText("Cher")).toBeTruthy();
    expect(screen.queryByText("Prince")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Next name" }));
    expect(mockGame.send).toHaveBeenCalledWith({ type: "revealTo", index: 1 });

    await render(
      <Reveal room={room({ phase: "reveal", reveal: reveal(1) })} />,
    );
    expect(screen.getByText("Prince")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Done reading" }));
    expect(mockGame.send).toHaveBeenCalledWith({ type: "finishReveal" });
  });

  it("turns the host's phone into a remote while a TV shows the names", async () => {
    await render(
      <Reveal
        room={room({ phase: "reveal", tv: true, reveal: reveal(0, null) })}
      />,
    );
    expect(screen.getByText(/The names are on the TV/)).toBeTruthy();
    expect(screen.queryByText("Cher")).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Show all names" }),
    );
    expect(mockGame.send).toHaveBeenCalledWith({
      type: "revealAll",
      all: true,
    });
  });

  it("moves on by itself at the host's pace", async () => {
    jest.useFakeTimers();
    try {
      const settings = { reminders: 1, revealSeconds: 5 };
      await render(
        <Reveal
          room={room({ phase: "reveal", settings, reveal: reveal(0) })}
        />,
      );
      await act(() => jest.advanceTimersByTime(5000));
      expect(mockGame.send).toHaveBeenCalledWith({
        type: "revealTo",
        index: 1,
      });

      await render(
        <Reveal
          room={room({ phase: "reveal", settings, reveal: reveal(1) })}
        />,
      );
      await act(() => jest.advanceTimersByTime(5000));
      expect(mockGame.send).toHaveBeenCalledWith({ type: "finishReveal" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("tells everyone else where to look", async () => {
    const player = { playerId: "p2", submittedName: "x" };
    await render(<Reveal room={room({ phase: "reveal", you: player })} />);
    expect(screen.getByText("Listen up")).toBeTruthy();
    await render(
      <Reveal room={room({ phase: "reveal", you: player, tv: true })} />,
    );
    expect(screen.getByText("Eyes on the TV")).toBeTruthy();
  });
});

describe("TV", () => {
  const tvScreen = (overrides: Partial<ScreenView> = {}): ScreenView => ({
    code: "WXYZ",
    phase: "lobby",
    hostId: null,
    players: [],
    remindersLeft: 1,
    reveal: null,
    game: null,
    ...overrides,
  });

  it("invites players to a new game", async () => {
    await render(
      <TvView status="open" screen={tvScreen()} onNewGame={jest.fn()} />,
    );
    expect(screen.getByText("WXYZ")).toBeTruthy();
    expect(
      screen.getByText("The first player to join hosts the game."),
    ).toBeTruthy();
  });

  it("shows who's in without showing their names", async () => {
    const players = room().players;
    await render(
      <TvView
        status="open"
        screen={tvScreen({ hostId: "p1", players })}
        onNewGame={jest.fn()}
      />,
    );
    expect(screen.getByText(/Sam starts the reveal/)).toBeTruthy();
    expect(screen.getByText("✓ Alex")).toBeTruthy();
    expect(screen.getByText("Jo")).toBeTruthy();
  });

  it("shows the slip on screen during the reveal", async () => {
    const reveal = { index: 1, total: 3, slips: ["Prince"] };
    await render(
      <TvView
        status="open"
        screen={tvScreen({ phase: "reveal", reveal })}
        onNewGame={jest.fn()}
      />,
    );
    expect(screen.getByText("Name 2 of 3")).toBeTruthy();
    expect(screen.getByText("Prince")).toBeTruthy();
  });

  it("shows the teams and whose turn it is", async () => {
    const players = room().players.map((p, i) => ({
      ...p,
      team: i < 2 ? "p1" : "p3",
    }));
    players[1] = { ...players[1]!, name: "Prince" };
    const game = {
      turn: "p3",
      pending: { by: "p3", team: "p3", target: "p1" },
      winners: null,
      canUndo: false,
    };
    await render(
      <TvView
        status="open"
        screen={tvScreen({ phase: "play", players, game })}
        onNewGame={jest.fn()}
      />,
    );
    expect(screen.getByText("Jo’s team’s turn")).toBeTruthy();
    expect(screen.getByText(/Jo is guessing Sam/)).toBeTruthy();
    expect(screen.getByText("Prince")).toBeTruthy();
  });

  it("offers a new game once it's over", async () => {
    const onNewGame = jest.fn();
    const game = { turn: "p1", pending: null, winners: [], canUndo: false };
    await render(
      <TvView
        status="open"
        screen={tvScreen({ phase: "over", game })}
        onNewGame={onNewGame}
      />,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Start a new game" }),
    );
    expect(onNewGame).toHaveBeenCalled();
  });
});

describe("Play", () => {
  // Sam (host) has caught Alex, whose name is public now; Jo is a team of one.
  // It's Sam's team's turn.
  function playing(
    overrides: Partial<RoomView> = {},
    game: Partial<GameView> = {},
  ): RoomView {
    const base = room();
    return room({
      phase: "play",
      players: [
        { ...base.players[0]!, team: "p1" },
        { ...base.players[1]!, team: "p1", name: "Prince" },
        { ...base.players[2]!, team: "p3", submitted: true },
      ],
      game: {
        turn: "p1",
        pending: null,
        winners: null,
        canUndo: false,
        ...game,
      },
      ...overrides,
    });
  }

  it("shows the teams, with names public once guessed", async () => {
    await render(
      <Play
        room={playing({ you: { playerId: "p3", submittedName: "Madonna" } })}
      />,
    );
    expect(screen.getByText("Sam’s team’s turn")).toBeTruthy();
    expect(screen.getByText("Prince")).toBeTruthy();
    expect(screen.getByText("Madonna")).toBeTruthy();
    expect(screen.queryByText("Cher")).toBeNull();
  });

  it("lets your team guess another team's leader on its turn", async () => {
    await render(
      <Play
        room={playing({ you: { playerId: "p2", submittedName: "Prince" } })}
      />,
    );
    expect(screen.getByText("Your team’s turn")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Guess Jo" }));
    expect(mockGame.send).toHaveBeenCalledWith({
      type: "guess",
      playerId: "p3",
    });
  });

  it("offers no guesses off your turn", async () => {
    await render(
      <Play
        room={playing({ you: { playerId: "p3", submittedName: "Madonna" } })}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Guess / })).toBeNull();
  });

  it("asks the guessed player to answer", async () => {
    const pending = { by: "p2", team: "p1", target: "p3" };
    await render(
      <Play
        room={playing(
          { you: { playerId: "p3", submittedName: "Madonna" } },
          { pending },
        )}
      />,
    );
    expect(
      screen.getByText("Alex is guessing your name. Did they get it?"),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "They got me" }));
    expect(mockGame.send).toHaveBeenCalledWith({
      type: "answerGuess",
      correct: true,
    });
  });

  it("lets the host answer for the guessed player", async () => {
    const pending = { by: "p2", team: "p1", target: "p3" };
    await render(<Play room={playing({}, { pending })} />);
    expect(screen.getByText("Answer for Jo if they can’t.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Wrong" }));
    expect(mockGame.send).toHaveBeenCalledWith({
      type: "answerGuess",
      correct: false,
    });
  });

  it("lets the host use a reminder, then end the round once none are left", async () => {
    await render(<Play room={playing()} />);
    await fireEvent.press(
      screen.getByRole("button", { name: "Read the names again (1 left)" }),
    );
    expect(mockGame.send).toHaveBeenCalledWith({ type: "remind" });

    await render(<Play room={playing({ remindersLeft: 0 })} />);
    await fireEvent.press(
      screen.getByRole("button", { name: "End the round" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "End it? The biggest team wins" }),
    );
    expect(mockGame.send).toHaveBeenCalledWith({ type: "endRound" });
  });

  it("lets the host undo the last answer", async () => {
    await render(<Play room={playing({}, { canUndo: true })} />);
    await fireEvent.press(
      screen.getByRole("button", { name: "Undo last answer" }),
    );
    expect(mockGame.send).toHaveBeenCalledWith({ type: "undo" });
  });
});

describe("Over", () => {
  function over(winners: string[], you = "p1"): RoomView {
    const base = room();
    return room({
      phase: "over",
      you: { playerId: you, submittedName: null },
      players: [
        { ...base.players[0]!, team: "p1", name: "Cher" },
        { ...base.players[1]!, team: "p1", name: "Prince" },
        { ...base.players[2]!, team: "p3", name: "Madonna" },
      ],
      game: { turn: "p1", pending: null, winners, canUndo: true },
    });
  }

  it("names the winners and shows who wrote what", async () => {
    await render(<Over room={over(["p1"])} />);
    expect(screen.getByText("Sam’s team wins")).toBeTruthy();
    expect(screen.getByText("Sam, Alex")).toBeTruthy();
    expect(screen.getByText("Madonna")).toBeTruthy();
  });

  it("calls a tie", async () => {
    await render(<Over room={over(["p1", "p3"])} />);
    expect(screen.getByText("It’s a tie")).toBeTruthy();
  });

  it("lets the host play again with everyone", async () => {
    await render(<Over room={over(["p1"])} />);
    await fireEvent.press(screen.getByRole("button", { name: "Play again" }));
    expect(mockGame.send).toHaveBeenCalledWith({ type: "playAgain" });
    await render(<Over room={over(["p1"], "p2")} />);
    expect(screen.queryByRole("button", { name: "Play again" })).toBeNull();
  });
});
