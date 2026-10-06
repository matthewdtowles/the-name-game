import { RoomCode } from "@tng/shared";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Banner } from "../../components/Banner";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { Slip } from "../../components/Slip";
import { useGame } from "../../lib/game/GameContext";
import { colors, fonts, space, type } from "../../lib/theme";

// Where invite links and QR codes land: the code is already filled in.
export default function JoinByLink() {
  const game = useGame();
  const params = useLocalSearchParams<{ code: string }>();
  const parsed = RoomCode.safeParse(params.code);
  const [displayName, setDisplayName] = useState("");

  if (game.room) return <Redirect href={`/room/${game.room.code}`} />;
  if (!parsed.success) return <Redirect href="/" />;
  const code = parsed.data;

  return (
    <Screen
      footer={
        <Button
          label="Join game"
          disabled={game.status !== "open" || displayName.trim().length === 0}
          onPress={() => game.send({ type: "join", code, displayName })}
        />
      }
    >
      <View style={styles.intro}>
        <Text style={styles.title}>You’re invited to play</Text>
        <Slip tilt={-2} style={styles.codeSlip}>
          <Text style={styles.code}>{code}</Text>
        </Slip>
      </View>
      {game.error ? <Banner message={game.error.message} /> : null}
      <Field
        label="Your name"
        placeholder="What should everyone call you?"
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        autoComplete="name"
        autoFocus
        maxLength={20}
        returnKeyType="join"
        onSubmitEditing={() => {
          if (displayName.trim())
            game.send({ type: "join", code, displayName });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.xl, paddingTop: space.xxl },
  title: { ...type.title, color: colors.paper },
  codeSlip: { alignSelf: "flex-start" },
  code: {
    fontFamily: fonts.heavy,
    fontSize: 48,
    letterSpacing: 10,
    color: colors.ink,
  },
});
