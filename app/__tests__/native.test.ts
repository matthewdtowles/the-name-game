import { buzzFor, type Moment } from "../lib/haptics";
import { codeFromScan } from "../lib/invite";

const moment = (over: Partial<Moment> = {}): Moment => ({
  team: "jo",
  teamSize: 1,
  yourTurn: false,
  guessedAtYou: false,
  ...over,
});

describe("buzzFor", () => {
  it("buzzes when your team's turn starts", () => {
    expect(buzzFor(moment(), moment({ yourTurn: true }))).toBe("turn");
  });

  it("buzzes when someone guesses your name", () => {
    expect(buzzFor(moment(), moment({ guessedAtYou: true }))).toBe("guessed");
  });

  it("buzzes when your team grows, even as your turn goes on", () => {
    expect(
      buzzFor(
        moment({ yourTurn: false }),
        moment({ teamSize: 2, yourTurn: true }),
      ),
    ).toBe("grew");
  });

  it("buzzes when you're pulled onto another team", () => {
    expect(
      buzzFor(
        moment({ guessedAtYou: true }),
        moment({ team: "sam", teamSize: 2 }),
      ),
    ).toBe("captured");
  });

  it("stays quiet on a first view and when nothing changed", () => {
    expect(buzzFor(null, moment({ yourTurn: true }))).toBeNull();
    expect(
      buzzFor(moment({ yourTurn: true }), moment({ yourTurn: true })),
    ).toBeNull();
    expect(buzzFor(moment({ yourTurn: true }), null)).toBeNull();
  });
});

describe("codeFromScan", () => {
  it("reads the code from a join link", () => {
    expect(codeFromScan("https://whosename.app/j/ABCD")).toBe("ABCD");
    expect(codeFromScan("https://staging.whosename.app/j/wxyz?x=1")).toBe(
      "WXYZ",
    );
  });

  it("ignores anything that isn't a join link", () => {
    expect(codeFromScan("https://whosename.app/tv/ABCD")).toBeNull();
    expect(codeFromScan("https://whosename.app/j/AB1D")).toBeNull();
    expect(codeFromScan("ABCD")).toBeNull();
  });
});
