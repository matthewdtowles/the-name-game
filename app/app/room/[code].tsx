import { Redirect } from "expo-router";

import { Banner } from "../../components/Banner";
import { Lobby } from "../../components/Lobby";
import { Play } from "../../components/Play";
import { Reveal } from "../../components/Reveal";
import { Screen } from "../../components/Screen";
import { useGame } from "../../lib/game/GameContext";

export default function Room() {
  const game = useGame();

  // No session: never joined, left, or was removed.
  if (!game.session) return <Redirect href="/" />;
  if (!game.room) {
    return (
      <Screen>
        <Banner tone="info" message="Getting you back into your game…" />
      </Screen>
    );
  }

  switch (game.room.phase) {
    case "lobby":
      return <Lobby room={game.room} />;
    case "reveal":
      return <Reveal room={game.room} />;
    case "play":
      return <Play room={game.room} />;
  }
}
