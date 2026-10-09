import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/bricolage-grotesque";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { GameProvider } from "../lib/game/GameContext";
import { colors } from "../lib/theme";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_800ExtraBold,
  });

  const onTv = usePathname().startsWith("/tv");

  return (
    <SafeAreaProvider>
      <GameProvider enabled={!onTv}>
        <StatusBar style="light" />
        {fontsLoaded ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.table },
            }}
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.table }} />
        )}
      </GameProvider>
    </SafeAreaProvider>
  );
}
