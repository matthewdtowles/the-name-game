import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { GameProvider } from "../lib/game/GameContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GameProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </GameProvider>
    </SafeAreaProvider>
  );
}
