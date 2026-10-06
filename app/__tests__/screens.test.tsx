import type { RoomView } from "@tng/shared";
import { fireEvent, render, screen } from "@testing-library/react-native";

import Home from "../app/index";
import { Lobby } from "../components/Lobby";
import { Play } from "../components/Play";
import { Reveal } from "../components/Reveal";
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
jest.mock("expo-router", () => ({ Redirect: () => null }));

function room(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: "WXYZ",
    phase: "lobby",
    tier: "free",
    settings: { reminders: 1 },
    hostId: "p1",
    players: [
      { id: "p1", displayName: "Sam", connected: true, submitted: true },
      { id: "p2", displayName: "Alex", connected: true, submitted: true },
      { id: "p3", displayName: "Jo", connected: true, submitted: false },
    ],
    you: { playerId: "p1", submittedName: "Cher" },
    remindersLeft: 1,
    names: null,
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
      settings: { reminders: 2 },
    });
  });
});

describe("Reveal", () => {
  it("walks the host through the names one at a time", async () => {
    await render(
      <Reveal room={room({ phase: "reveal", names: ["Cher", "Prince"] })} />,
    );
    expect(screen.getByText("Cher")).toBeTruthy();
    expect(screen.queryByText("Prince")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Next name" }));
    expect(screen.getByText("Prince")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Done reading" }));
    expect(mockGame.send).toHaveBeenCalledWith({ type: "finishReveal" });
  });

  it("tells everyone else to listen", async () => {
    await render(
      <Reveal
        room={room({
          phase: "reveal",
          you: { playerId: "p2", submittedName: "x" },
        })}
      />,
    );
    expect(screen.getByText("Listen up")).toBeTruthy();
  });
});

describe("Play", () => {
  it("lets the host use a reminder", async () => {
    await render(<Play room={room({ phase: "play" })} />);
    await fireEvent.press(
      screen.getByRole("button", { name: "Read the names again" }),
    );
    expect(mockGame.send).toHaveBeenCalledWith({ type: "remind" });
  });

  it("disables reminders once they're used up", async () => {
    await render(<Play room={room({ phase: "play", remindersLeft: 0 })} />);
    expect(
      screen.getByRole("button", { name: "No reminders left" }),
    ).toBeDisabled();
  });
});
