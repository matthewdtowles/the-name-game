import type { PlayerView } from "@tng/shared";

import { bystanders, teamName, teamsOf } from "../lib/teams";

const player = (
  id: string,
  team: string | null,
  name: string | null = null,
): PlayerView => ({
  id,
  displayName: id.toUpperCase(),
  connected: true,
  submitted: team !== null,
  team,
  name,
});

it("groups players by leader, leaders first, in seat order", () => {
  const players = [
    player("sam", "jo", "Cher"),
    player("alex", "alex"),
    player("jo", "jo"),
    player("kim", null),
  ];
  const teams = teamsOf(players);
  expect(teams.map((t) => t.leader.id)).toEqual(["alex", "jo"]);
  expect(teams[1]!.members.map((p) => p.id)).toEqual(["jo", "sam"]);
  expect(bystanders(players).map((p) => p.id)).toEqual(["kim"]);
});

it("counts a team whose leader left as out", () => {
  const players = [player("sam", "jo", "Cher"), player("alex", "alex")];
  expect(teamsOf(players).map((t) => t.leader.id)).toEqual(["alex"]);
  expect(bystanders(players).map((p) => p.id)).toEqual(["sam"]);
});

it("names your own team as yours", () => {
  const [team] = teamsOf([player("jo", "jo"), player("sam", "jo")]);
  expect(teamName(team!, "sam")).toBe("Your team");
  expect(teamName(team!, "alex")).toBe("JO’s team");
});
