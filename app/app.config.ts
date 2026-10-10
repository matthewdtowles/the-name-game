import { execSync } from "node:child_process";

import type { ConfigContext, ExpoConfig } from "expo/config";

// The app's version is the highest SemVer git tag, which CI cuts from each
// merged PR's title, so it never lives in app.json to drift. eas-cli evaluates
// this locally, where the tags exist; the ship workflow sets APP_VERSION.
function resolveVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const tag = execSync("git tag --list --sort=-v:refname", {
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /^\d+\.\d+\.\d+$/.test(line));
    if (tag) return tag;
  } catch {
    // No git or no tags, as in a shallow checkout.
  }
  return "0.0.0";
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  version: resolveVersion(),
});
