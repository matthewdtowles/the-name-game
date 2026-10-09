import { MAX_REMINDERS, type RoomView } from "@tng/shared";
import { useState } from "react";
import QRCode from "react-native-qrcode-svg";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useGame } from "../lib/game/GameContext";
import { joinUrl, shareInvite, tvUrl } from "../lib/invite";
import { colors, fonts, space, type } from "../lib/theme";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { ConfirmButton } from "./ConfirmButton";
import { Field } from "./Field";
import { PlayerList } from "./PlayerList";
import { Screen } from "./Screen";
import { Slip } from "./Slip";

export function Lobby({ room }: { room: RoomView }) {
  const game = useGame();
  const isHost = room.you.playerId === room.hostId;
  const host = room.players.find((p) => p.id === room.hostId);
  const namesIn = room.players.filter((p) => p.submitted).length;
  const waitingOn = room.players.length - namesIn;

  return (
    <Screen
      footer={
        isHost ? (
          <>
            {namesIn < 2 ? (
              <Button label="Read the names" disabled onPress={() => {}} />
            ) : waitingOn > 0 ? (
              <ConfirmButton
                variant="primary"
                label={`Read the names (${namesIn} of ${room.players.length} in)`}
                confirmLabel={`Start without ${waitingOn === 1 ? "1 player" : `${waitingOn} players`}?`}
                onConfirm={() => game.send({ type: "startReveal" })}
              />
            ) : (
              <Button
                label="Read the names"
                onPress={() => game.send({ type: "startReveal" })}
              />
            )}
            {namesIn < 2 ? (
              <Text style={styles.hint}>
                At least 2 names are needed to start.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.hint}>
            {host?.displayName ?? "The host"} will{" "}
            {room.tv ? "put the names on the TV" : "read the names"} once
            everyone’s in.
          </Text>
        )
      }
    >
      <Invite code={room.code} />
      {room.tv ? (
        <Text style={[styles.hint, styles.onTv]}>✓ Showing on a TV</Text>
      ) : isHost ? (
        <Text style={styles.hint}>
          Have a TV? Open {tvUrl(room.code)} in its web browser.
        </Text>
      ) : null}
      {game.status !== "open" ? (
        <Banner tone="info" message="Reconnecting…" />
      ) : null}
      <YourSlip submittedName={room.you.submittedName} />
      {isHost ? (
        <View style={styles.section}>
          <Text style={styles.heading}>Game settings</Text>
          <Reminders room={room} />
          <RevealPace room={room} />
        </View>
      ) : null}
      <View style={styles.section}>
        <Text style={styles.heading}>Players, in seat order</Text>
        <PlayerList
          room={room}
          onRemove={
            isHost
              ? (playerId) => game.send({ type: "kick", playerId })
              : undefined
          }
          onMove={
            isHost
              ? (playerId, to) => game.send({ type: "moveSeat", playerId, to })
              : undefined
          }
        />
      </View>
      <ConfirmButton
        label="Leave game"
        confirmLabel="Tap again to leave"
        onConfirm={() => game.send({ type: "leave" })}
      />
    </Screen>
  );
}

function Invite({ code }: { code: string }) {
  const [showQr, setShowQr] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  return (
    <View style={styles.invite}>
      <Text style={styles.heading}>Invite players with this code</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showQr ? "Hide QR code" : "Show QR code"}
        onPress={() => setShowQr((v) => !v)}
        style={styles.codeSlipWrap}
      >
        <Slip tilt={-2}>
          {showQr ? (
            <QRCode
              value={joinUrl(code)}
              size={200}
              color={colors.ink}
              backgroundColor={colors.paper}
            />
          ) : (
            <Text style={styles.code}>{code}</Text>
          )}
        </Slip>
      </Pressable>
      <View style={styles.inviteActions}>
        <Button
          label="Share link"
          variant="secondary"
          onPress={async () => {
            const result = await shareInvite(code);
            setNote(
              result === "copied"
                ? "Link copied."
                : result === "failed"
                  ? joinUrl(code)
                  : null,
            );
          }}
        />
        <Button
          label={showQr ? "Show code" : "Show QR code"}
          variant="quiet"
          onPress={() => setShowQr((v) => !v)}
        />
      </View>
      {note ? <Text style={styles.hint}>{note}</Text> : null}
    </View>
  );
}

function YourSlip({ submittedName }: { submittedName: string | null }) {
  const game = useGame();
  const [changing, setChanging] = useState(false);
  const [draft, setDraft] = useState("");
  // The name last sent. The send clears any error, so an error now means the
  // server turned this name down (a duplicate) and the player can try again.
  const [pending, setPending] = useState<string | null>(null);
  const confirmed = pending !== null && submittedName === pending;
  const awaiting = pending !== null && !confirmed && !game.error;
  const editing = submittedName === null || (changing && !confirmed);

  const submit = () => {
    const name = draft.trim();
    if (!name || !game.send({ type: "submitName", name })) return;
    setPending(name);
  };

  if (!editing) {
    return (
      <View style={styles.section}>
        <Text style={styles.heading}>Your slip</Text>
        <Slip tilt={1.5}>
          <Text style={styles.slipName}>{submittedName}</Text>
        </Slip>
        <Text style={styles.hint}>Only you can see this.</Text>
        <Button
          label="Change name"
          variant="quiet"
          onPress={() => {
            setDraft(submittedName ?? "");
            setPending(null);
            setChanging(true);
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Field
        label="Who’s on your slip?"
        onSlip
        placeholder="A famous person, or someone we all know"
        value={draft}
        onChangeText={setDraft}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={submit}
        error={
          game.error?.reason === "duplicate_name" ? game.error.message : null
        }
      />
      <Button
        label="Put it in the hat"
        variant="secondary"
        disabled={draft.trim().length === 0 || awaiting}
        onPress={submit}
      />
      {changing ? (
        <Button
          label="Keep my name"
          variant="quiet"
          onPress={() => setChanging(false)}
        />
      ) : null}
    </View>
  );
}

function Reminders({ room }: { room: RoomView }) {
  const game = useGame();
  const count = room.settings.reminders;
  const set = (reminders: number) =>
    game.send({
      type: "updateSettings",
      settings: { ...room.settings, reminders },
    });
  return (
    <View style={styles.reminders}>
      <View style={styles.remindersText}>
        <Text style={styles.strong}>Reminders</Text>
        <Text style={styles.hint}>
          {count === 0
            ? "Names are read once."
            : `Names can be read again ${count === 1 ? "once" : `${count} times`}.`}
        </Text>
      </View>
      <Stepper
        label="Fewer reminders"
        symbol="−"
        disabled={count === 0}
        onPress={() => set(count - 1)}
      />
      <Text style={styles.count}>{count}</Text>
      <Stepper
        label="More reminders"
        symbol="+"
        disabled={count === MAX_REMINDERS}
        onPress={() => set(count + 1)}
      />
    </View>
  );
}

const PACES = [null, 5, 8, 12] as const;

// How the reveal moves: by the host's hand, or by itself every few seconds.
function RevealPace({ room }: { room: RoomView }) {
  const game = useGame();
  const seconds = room.settings.revealSeconds;
  return (
    <View style={styles.pace}>
      <Text style={styles.strong}>Reveal pace</Text>
      <Text style={styles.hint}>
        {seconds === null
          ? "You move on to the next name."
          : `Each name stays up for ${seconds} seconds.`}
      </Text>
      <View style={styles.chips}>
        {PACES.map((pace) => {
          const selected = pace === seconds;
          return (
            <Pressable
              key={pace ?? "hand"}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() =>
                game.send({
                  type: "updateSettings",
                  settings: { ...room.settings, revealSeconds: pace },
                })
              }
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {pace === null ? "By hand" : `${pace} s`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Stepper(props: {
  label: string;
  symbol: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.stepper, props.disabled && styles.stepperDisabled]}
    >
      <Text style={styles.stepperText}>{props.symbol}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  invite: { gap: space.lg, paddingTop: space.lg },
  codeSlipWrap: { alignSelf: "flex-start" },
  code: {
    fontFamily: fonts.heavy,
    fontSize: 56,
    letterSpacing: 12,
    color: colors.ink,
  },
  inviteActions: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  section: { gap: space.md },
  heading: { ...type.strong, color: colors.paper },
  strong: { ...type.strong, color: colors.paper },
  hint: { ...type.small, color: colors.dusk },
  slipName: {
    fontFamily: fonts.heavy,
    fontSize: 30,
    lineHeight: 34,
    color: colors.ink,
  },
  reminders: { flexDirection: "row", alignItems: "center", gap: space.md },
  remindersText: { flex: 1 },
  count: {
    ...type.title,
    color: colors.paper,
    minWidth: 24,
    textAlign: "center",
  },
  stepper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperDisabled: { opacity: 0.3 },
  onTv: { color: colors.felt },
  pace: { gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.lg,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.line,
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: colors.paper, borderColor: colors.paper },
  chipText: { ...type.strong, color: colors.paper },
  chipTextSelected: { color: colors.ink },
  stepperText: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    lineHeight: 26,
    color: colors.paper,
  },
});
