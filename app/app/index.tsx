import { ROOM_CODE_LENGTH } from "@tng/shared";
import { Link, Redirect, router } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Screen } from "../components/Screen";
import { useGame } from "../lib/game/GameContext";
import { colors, space, type } from "../lib/theme";

export default function Home() {
  const game = useGame();
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");

  if (game.room) return <Redirect href={`/room/${game.room.code}`} />;

  const ready = game.status === "open" && displayName.trim().length > 0;

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>Whose Name?</Text>
        <Text style={styles.lede}>
          Everyone puts a name in the hat. Nobody can tell whose handwriting it
          is.
        </Text>
      </View>

      {game.session && game.status !== "open" ? (
        <Banner tone="info" message="Getting you back into your game…" />
      ) : null}
      {game.error ? <Banner message={game.error.message} /> : null}

      <Field
        label="Your name"
        placeholder="What should everyone call you?"
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        autoComplete="name"
        maxLength={20}
        returnKeyType="done"
      />

      <Button
        label="Host a game"
        disabled={!ready}
        onPress={() => game.send({ type: "create", displayName })}
      />

      <View style={styles.join}>
        <Field
          label="Or join with a code"
          placeholder="ABCD"
          value={code}
          onChangeText={(text) => setCode(text.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={ROOM_CODE_LENGTH}
        />
        <Button
          label="Join game"
          variant="secondary"
          disabled={!ready || code.length !== ROOM_CODE_LENGTH}
          onPress={() => game.send({ type: "join", code, displayName })}
        />
        {Platform.OS !== "web" ? (
          <Button
            label="Scan a code"
            variant="quiet"
            onPress={() => router.push("/scan")}
          />
        ) : null}
      </View>

      <Link href="/privacy" style={styles.privacy}>
        Privacy
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.md, paddingTop: space.xxl },
  title: { ...type.display, color: colors.paper },
  lede: { ...type.body, color: colors.dusk, maxWidth: 360 },
  join: { gap: space.md, paddingTop: space.lg },
  privacy: { ...type.small, color: colors.dusk, paddingVertical: space.md },
});
