import { RoomCode } from "@tng/shared";
import { Redirect, useLocalSearchParams } from "expo-router";

import { Tv } from "../../components/Tv";

// whosename.app/tv/ABCD: show a game that was started on a phone.
export default function TvForGame() {
  const params = useLocalSearchParams<{ code: string }>();
  const parsed = RoomCode.safeParse(params.code);
  if (!parsed.success) return <Redirect href="/tv" />;
  return <Tv code={parsed.data} />;
}
