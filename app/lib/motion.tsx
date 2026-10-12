import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors } from "./theme";

// The game's few moving moments: a slip unfolding in the reveal, a team
// lighting up as a guessed player joins it, and the winners arriving. With
// reduce motion on, each is a plain fade.

const useNativeDriver = Platform.OS !== "web";

let reduced = false;
let watching = false;
const listeners = new Set<() => void>();
const setReduced = (on: boolean) => {
  reduced = on;
  listeners.forEach((l) => l());
};

function subscribe(listener: () => void) {
  if (!watching) {
    watching = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduced)
      .catch(() => {});
    AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => reduced,
    () => reduced,
  );
}

// Runs once when mounted, from 0 to 1.
function useEntrance(duration: number, easing: (t: number) => number) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.timing(t, {
      toValue: 1,
      duration,
      easing,
      useNativeDriver,
    });
    anim.start();
    return () => anim.stop();
  }, [t, duration, easing]);
  return t;
}

const fadeIn = (t: Animated.Value) =>
  t.interpolate({
    inputRange: [0, 0.4],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

const unfoldEasing = Easing.out(Easing.back(1.6));

// A slip coming out of the hat: it opens from a sliver and settles into place.
// Key it on what it shows, so each new name unfolds.
export function Unfold({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const still = useReducedMotion();
  const t = useEntrance(450, unfoldEasing);
  const motion = still
    ? []
    : [
        {
          translateY: t.interpolate({
            inputRange: [0, 1],
            outputRange: [40, 0],
          }),
        },
        {
          scaleY: t.interpolate({
            inputRange: [0, 1],
            outputRange: [0.15, 1],
          }),
        },
        {
          rotate: t.interpolate({
            inputRange: [0, 1],
            outputRange: ["-6deg", "0deg"],
          }),
        },
      ];
  return (
    <Animated.View style={[style, { opacity: fadeIn(t), transform: motion }]}>
      {children}
    </Animated.View>
  );
}

const popEasing = Easing.out(Easing.back(2.2));

// The winners' moment: their title springs up from small.
export function Pop({ children }: { children: ReactNode }) {
  const still = useReducedMotion();
  const t = useEntrance(600, popEasing);
  const motion = still
    ? []
    : [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }];
  return (
    <Animated.View style={{ opacity: fadeIn(t), transform: motion }}>
      {children}
    </Animated.View>
  );
}

// Whether the team around a row was already on screen when the row mounted:
// a row that arrives later is a player who just joined that team.
const Settled = createContext<RefObject<boolean>>({ current: false });

// A team that lights up when it grows. `radius` matches the card's corners.
export function Grows({
  count,
  radius,
  style,
  children,
}: {
  count: number;
  radius: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const still = useReducedMotion();
  const settled = useRef(false);
  const last = useRef(count);
  const [glow] = useState(() => new Animated.Value(0));
  useEffect(() => {
    settled.current = true;
  }, []);
  useEffect(() => {
    const grew = count > last.current;
    last.current = count;
    if (!grew) return;
    glow.setValue(1);
    const anim = Animated.timing(glow, {
      toValue: 0,
      duration: 1100,
      easing: Easing.in(Easing.quad),
      useNativeDriver,
    });
    anim.start();
    return () => anim.stop();
  }, [count, glow]);
  const swell = still
    ? []
    : [
        {
          scale: glow.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.03],
          }),
        },
      ];
  const opacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.3],
  });
  return (
    <Settled value={settled}>
      <Animated.View style={[style, { transform: swell }]}>
        <Animated.View
          style={[styles.glow, { borderRadius: radius, opacity }]}
        />
        {children}
      </Animated.View>
    </Settled>
  );
}

// A row inside `Grows` that slides in when it joins after the team was shown.
export function Arrive({ children }: { children: ReactNode }) {
  const still = useReducedMotion();
  const settled = useContext(Settled);
  const [t] = useState(() => new Animated.Value(1));
  // Before paint, so an arriving row never flashes in place first.
  useLayoutEffect(() => {
    if (!settled.current) return;
    t.setValue(0);
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    });
    anim.start();
    return () => anim.stop();
  }, [settled, t]);
  const motion = still
    ? []
    : [
        {
          translateX: t.interpolate({
            inputRange: [0, 1],
            outputRange: [-24, 0],
          }),
        },
      ];
  return (
    <Animated.View style={{ opacity: fadeIn(t), transform: motion }}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.felt,
    pointerEvents: "none",
  },
});
