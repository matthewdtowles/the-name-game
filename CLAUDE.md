# CLAUDE.md

Guidance for working in this repository. The plan, the architecture decisions,
and the phase-by-phase work live in [ROADMAP.md](ROADMAP.md); progress is
tracked on the [project board](https://github.com/users/matthewdtowles/projects/2).

## Layout

An npm-workspaces monorepo. TypeScript everywhere, imported as source (no build
step between workspaces).

| Workspace | What it is |
|---|---|
| `shared/` (`@tng/shared`) | The wire protocol (`protocol.ts`, zod schemas) and the pure rules engine (`game.ts`). Imported by both the app and the server. |
| `server/` (`@tng/server`) | `handler.ts` turns socket events into rule actions behind `Store` and `Send` interfaces. `dev.ts` runs it over `ws` with `MemoryStore`. |
| `app/` (`@tng/app`) | Expo (SDK 56) + expo-router. One codebase for iOS, Android, and the web build that guests and TVs use. |
| `infra/` (`@tng/infra`) | AWS CDK, once the backend is deployed. Empty for now. |

## Commands

```bash
npm install                 # always from the root, with no -w (see Gotchas)
npm run dev                 # game server on ws://localhost:8787 (PORT to change)
npm run web -w @tng/app     # the app in a browser
npm run start -w @tng/app   # Expo dev server for a phone or simulator

npm test                    # every workspace: node:test for shared/server, Jest for app
npm run typecheck
npm run lint                # lint:fix to autofix
npm run format              # format:check in CI
npm test -w @tng/shared     # one workspace
```

## How the game is built

- **The server is authoritative.** Clients send intents (`ClientMessage`). The
  server applies them with `apply(room, action, random)` and sends every player
  their own `viewFor(room, playerId)`.
- **Redaction lives in `viewFor`.** Other players' secret names and session
  tokens never leave the server. The shuffled list goes only to the host, and
  only during the reveal. Every new field on `RoomView` needs that same
  thought, plus a test that it doesn't leak.
- **The rules engine is pure:** no I/O, no clock, no `Math.random`. The server
  supplies ids, tokens, and a crypto-backed random source, so tests can pass a
  deterministic one.
- **Adding an intent:** add the schema to `ClientMessage`, the `Action` and its
  rule in `game.ts`, the mapping in `handler.ts`'s `toAction`, and tests at
  both layers.
- **Rooms are written optimistically.** `mutate` re-reads and retries when the
  version moved. A room that empties is deleted.

## Conventions

- Every change goes through a PR into `main`, squash-merged. Direct pushes are
  blocked, and `typecheck`, `lint`, and `test` are required checks.
- **The PR title becomes the squash commit and sets the version:** `feat:`
  bumps minor, `!` bumps major, and anything else bumps patch
  (`.github/scripts/next-version.sh`). Each merge to `main` tags a release.
  `package.json` stays at `0.0.0-dev`; never bump it by hand.
- Prettier defaults (double quotes, 2 spaces). Markdown is not formatted.

## Gotchas

- **`legacy-peer-deps=true` (`.npmrc`) is load-bearing.** Without it, npm
  installs peers of `@testing-library/react-native` at the root, pulling in a
  second React and a newer react-native, which breaks hooks at runtime. Check
  `npm ls react` shows a single version after dependency changes. Use
  `npx expo install` in `app/` to pick SDK-compatible versions.
- **`npm install <pkg> -w <workspace>` installs only that workspace's tree**,
  and root dev tools (eslint, prettier, tsx) can go missing after a clean
  install. Run a plain `npm install` afterwards.
- **`crypto.randomInt(max)` requires `max < 2^48`.**
