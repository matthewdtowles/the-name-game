import { Redirect } from "expo-router";

import { Banner } from "../../components/Banner";
import { Lobby } from "../../components/Lobby";
import { Over } from "../../components/Over";
import { Play } from "../../components/Play";
import { Reveal } from "../../components/Reveal";
import { Screen } from "../../components/Screen";
import { useGame } from "../../lib/game/GameContext";
import { useGameBuzz } from "../../lib/haptics";
import { sceneOf, useGameSounds } from "../../lib/sounds";

export default function Room() {
  const game = useGame();
  useGameBuzz(game.room);
  const room = game.room;
  useGameSounds(
    sceneOf(room, room?.settings.turnSeconds ?? null),
    !!room &&
      room.you.playerId === room.hostId &&
      !room.tv &&
      room.settings.sounds,
  );

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
    case "over":
      return <Over room={game.room} />;
  }
}
