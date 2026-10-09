import { Link } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Screen } from "../components/Screen";
import { colors, space, type } from "../lib/theme";

// Written to match what the code does: names live in DynamoDB until TTL removes
// the room a day after its last activity, logs expire after two weeks, and
// there are no accounts, analytics or ads. Update it whenever that changes.
export default function Privacy() {
  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>Privacy</Text>
        <Text style={styles.lede}>
          Whose Name? has no accounts, ads, or analytics. It keeps only what a
          game needs, only while the game lasts.
        </Text>
      </View>

      <Section title="What’s stored while you play">
        <Item>
          The name you go by, the name you put in the hat, and which game you’re
          in. These are stored on our server so everyone’s phone sees the same
          game.
        </Item>
        <Item>
          All of it is deleted automatically a day after the game’s last
          activity. Leaving a game removes you right away.
        </Item>
        <Item>
          Your phone or browser keeps a session key so you can rejoin if your
          connection drops. Leaving the game deletes it.
        </Item>
      </Section>

      <Section title="Who sees what">
        <Item>
          Other players see the name you go by and whether your name is in the
          hat.
        </Item>
        <Item>
          Nobody else sees the name you put in the hat until the host reads the
          names out, shuffled, with nothing linking a name to the player who
          wrote it.
        </Item>
      </Section>

      <Section title="What we don’t do">
        <Item>No accounts, ads, analytics, or tracking cookies.</Item>
        <Item>We never sell or share anything you enter.</Item>
      </Section>

      <Section title="Behind the scenes">
        <Item>
          The game runs on Amazon Web Services. Like any website, AWS sees your
          IP address to deliver it to you.
        </Item>
        <Item>
          Server error logs help us fix problems. They don’t contain game
          content and are deleted after two weeks.
        </Item>
      </Section>

      <Text style={styles.small}>
        Questions? Open an issue at github.com/matthewdtowles/the-name-game.
        Last updated October 9, 2026.
      </Text>
      <Link href="/" style={styles.back}>
        Back to the game
      </Link>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  );
}

function Item({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

const styles = StyleSheet.create({
  intro: { gap: space.md, paddingTop: space.xxl },
  title: { ...type.display, color: colors.paper },
  lede: { ...type.body, color: colors.paper },
  section: { gap: space.sm },
  heading: { ...type.strong, color: colors.paper },
  body: { ...type.body, color: colors.dusk },
  small: { ...type.small, color: colors.dusk },
  back: { ...type.strong, color: colors.paper, paddingVertical: space.md },
});
