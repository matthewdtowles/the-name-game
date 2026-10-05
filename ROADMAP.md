# Roadmap

The single source of truth for what we're building, the decisions behind it, and the
progress made. Tick boxes as work merges.

## The game

1. Everyone secretly writes one name: a famous person or someone everyone in the room knows.
2. The names are read aloud in shuffled order. Nobody knows who wrote which.
3. Players take turns. On your turn, pick a player whose name hasn't been guessed yet
   and guess which name they wrote.
   - **Right:** they join your team and help you. You keep guessing.
   - **Wrong:** your turn ends.
4. Once a team has formed, its only unguessed member is its leader. Guessing the
   leader correctly brings the **whole team** over to you.
5. The first team to hold everyone wins.

The paper version's flaw is that the reader recognizes handwriting. The app fixes that:
it collects the names privately and reveals them shuffled, with no link to who wrote
each one.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Clients | One **Expo** codebase (SDK 56, expo-router, TypeScript) builds the iOS app, the Android app, and the **web** version | Guests can join from a browser without installing anything. The TV view is just another web route. The stack and patterns come from `i-want-my-mtg-mobile`. |
| Backend | **Serverless on AWS**: API Gateway WebSocket API → one Lambda (Node, arm64) → DynamoDB (on-demand, TTL) | Costs about $0 when idle and pennies per thousand games. There's no server to patch or keep alive. Multi-AZ by default, and it scales if the game takes off. Game state survives deploys and phones going to sleep. |
| Web hosting | Expo static web export in **S3 + CloudFront**, with Route 53 DNS | Same CloudFront setup as `i-want-my-mtg`. The same domain serves the universal-link files. |
| Infra as code | **AWS CDK (TypeScript)** in `infra/`. A separate stack, and ideally a separate AWS account under your Organization | Kept apart from the MTG infra (that was the requirement). Billing is clear, and the blast radius stays contained. |
| Repo layout | **npm-workspaces monorepo**: `app/` `server/` `shared/` `infra/` | The client and server share one typed protocol and one pure game-rules engine. |
| Identity | No accounts. Joining issues a `playerId` and a secret `sessionToken`, kept in SecureStore or localStorage so a player can reconnect. Display names last for one game. | Matches the "no long-term identity" goal. The App Store privacy label can say "Data Not Collected". |
| Authority | **Server-authoritative.** The server holds the full state and sends each client a redacted view. Authorship stays hidden until the game ends. | Nobody can read who wrote what from network traffic. |
| Retention | Rooms expire through DynamoDB TTL **24h** after their last activity | Ephemeral by design. Nothing is kept. |
| CI/CD | GitHub Actions with **OIDC → AWS role** (no long-lived keys). Version comes from the PR title (`feat:` → minor, `!` → major, else patch), as in the MTG repos. EAS `ship` workflow for the stores. | A proven pipeline you already run. |

### Rejected alternatives

- **Node WebSocket server on its own Lightsail box.** Simple, but costs $5+/mo even when
  idle, is a single point of failure, drops in-progress games on deploy, and has to be
  re-architected if the game grows.
- **Firebase, PartyKit, Ably, or another hosted realtime service.** Fast to build, but
  it's not AWS and adds another vendor bill.
- **App-only, with no web client.** At a party, "everyone install this app first" kills
  the game.

## Architecture

```
 phones (app or browser) ─┐                    ┌─ DynamoDB (single table, TTL)
 TV browser / Cast ───────┼─ wss ─ API Gateway ┤
                          │       WebSocket    └─ Lambda (game handler)
 https://<domain> ────────┴─ CloudFront ─ S3 (Expo web export, AASA, assetlinks)
```

- **Protocol:** JSON messages `{ type, ... }`, validated with zod schemas in `shared/`.
  Clients send intents such as `create`, `join`, `submitName`, `startReveal`,
  `guess`, and so on. After each change, the server pushes each recipient its own view
  of the room.
- **Rules engine:** `shared/game.ts` is a pure `apply(state, action) → state | error`
  function. It's unit-tested exhaustively and has no I/O. The Lambda loads the room,
  applies the action, does a conditional write on a `version` attribute (optimistic
  concurrency), then fans the result out.
- **DynamoDB:** single table. `pk = ROOM#<code>` holds the room item (state blob +
  version + TTL). `pk = CONN#<connectionId>` maps a connection to its room and player.
- **Local dev:** `server/dev.ts` runs the same handler behind a plain `ws` server
  with an in-memory store, so `npm run dev` starts the server and Expo web with no AWS
  involved.
- **Reconnects:** API Gateway closes idle sockets after 10 minutes and caps a
  connection at 2 hours, and phones sleep. Clients send a heartbeat and reconnect with
  `sessionToken`, then the server sends a fresh snapshot.
- **Room codes:** 4 characters from an unambiguous alphabet (no `0/O/1/I/L`). Join URL:
  `https://<domain>/j/ABCD`. The QR code encodes that URL. It opens the app if
  installed, otherwise the browser.
- **Routes:** `/` (Host or Join), `/j/[code]` (join), `/room/[code]` (lobby → submit →
  reveal → play, driven by phase), `/tv` and `/tv/[code]` (display).

## Phases

### Phase 0: Foundations
- [x] Create the GitHub repo
- [ ] Buy the domain (Route 53). See the open questions.
- [ ] Set up the AWS account or stack boundary, a $5/mo **AWS Budget** alarm, and the GitHub OIDC deploy role
- [ ] Scaffold the monorepo: workspaces, TypeScript, ESLint, Prettier, `node --test` for `shared/` and `server/`, Jest for components
- [ ] Add `shared/` protocol schemas and room or player types
- [ ] CI: typecheck, lint, and test on PRs; versioning from PR titles on main
- [ ] Add a CLAUDE.md with dev commands and conventions

### Phase 1: MVP, collect and reveal names (web first)
The goal is to play at a real party using only phone browsers. It ships to the web
first, which skips app-store review and gets real-world feedback fastest.
- [ ] Rules engine: lobby → submitting → revealing phases, host flag, host transfer when the host leaves
- [ ] Host creates a room → code + QR code + share link
- [ ] Join with a code or link; choose a display name (unique within the room)
- [ ] Submit a secret name, editable until the reveal; others see only "✓ submitted"
- [ ] Duplicate detection (case, accent, and whitespace normalized): the later submitter is privately asked to pick another name
- [ ] Host sees submission progress. The reveal starts when everyone has submitted, or early if the host forces it.
- [ ] Reveal on the host's phone: shuffled with `crypto` randomness, one at a time or as a full list, large type
- [ ] Host can kick a player; room locks once the reveal starts
- [ ] Reconnect and rejoin with the session token
- [ ] Lambda + API Gateway WS + DynamoDB via CDK; staging and prod stages
- [ ] Web export to S3/CloudFront; deploy workflow on merge
- [ ] Privacy page (no data collected, rooms deleted within 24h)
- [ ] Playtest at a real game night 🎉

### Phase 2: TV display (web)
- [ ] `/tv` route: shows a fresh code and QR code; phones join *that* room; the TV attaches as a non-playing **display** client
- [ ] 10-foot UI: huge type, high contrast, works on TV browsers and when casting a Chrome tab or mirroring over AirPlay
- [ ] Host phone becomes the remote: next, previous, show all, hide
- [ ] Reveal settings: show each name for N seconds, how many times through the list, then the list disappears (it's a memory game)
- [ ] Lobby on the TV: who has joined, who has submitted

### Phase 3: Native apps
- [ ] App icon, splash screen, theme tokens, and dark mode (port `lib/theme` from `i-want-my-mtg-mobile`)
- [ ] Universal links (iOS AASA) and App Links (Android `assetlinks.json`) for `/j/*`
- [ ] Haptics, keep-awake during the reveal, share sheet for the invite link
- [ ] In-app QR scanner (optional, since the system camera already handles links)
- [ ] EAS build profiles and the `ship` workflow (copy from `i-want-my-mtg-mobile`)
- [ ] TestFlight + Play internal testing → public on both stores

### Phase 4: Run the whole game in the app
- [ ] Turn tracking: whose turn it is, shown on every phone and the TV
- [ ] Guess flow: the guesser picks a target, says the name aloud, and the **target** confirms "correct" or "wrong" on their own phone
- [ ] Team merges: a correct guess on a leader pulls in their whole team
- [ ] Live team board on the TV and phones; names stay visible to teammates (shared info)
- [ ] Win detection, then the end-of-game "who wrote what" reveal
- [ ] Undo the last action (host), for wrong taps
- [ ] House-rule settings for the open rule questions below
- [ ] "Play again" keeps the room and players and clears the names

### Phase 5: One-tap TV casting
- [ ] Google Cast **custom Web Receiver**: the `/tv` page doubles as the receiver (register a Cast developer account, $5 one-time)
- [ ] Cast button on the host's phone (`react-native-google-cast` via a config plugin and a dev build)
- [ ] AirPlay: research external-display support beyond mirroring
- [ ] (Maybe) native Android TV, Fire TV, or tvOS apps. Only if the web TV view falls short.

### Phase 6: Polish
- [ ] Sounds and animations for the reveal and team merges
- [ ] Optional turn timer
- [ ] Fuzzy duplicate detection ("Tom Hanks" vs "tom hanx")
- [ ] Category prompts ("only cartoon characters", "only people in this room")
- [ ] Accessibility pass (screen readers, dynamic type, contrast)
- [ ] Localization groundwork

### Phase 7: Monetization (designed for now, built later)
The core game stays free forever. Paid features belong to the **host**: one purchase
covers the whole room, and guests never pay.
- [ ] Rooms carry a `tier` from day one, and the server enforces limits per tier, so adding paid tiers later doesn't need a protocol change
- [ ] **Host Pass** one-time in-app purchase via **RevenueCat** using anonymous app user IDs, which keeps the no-accounts design. The server verifies the entitlement with RevenueCat when a room is created.
- [ ] Candidate Host Pass perks: TV themes, reveal animations and sounds, category packs, larger rooms, saved player lists on the host's device
- [ ] Web purchases via Stripe (Apple requires in-app purchase for digital unlocks *inside* the iOS app)
- [ ] Optional tip jar
- [ ] Avoid ads. They clash with a fast party game and with the privacy story.

### Ongoing operations
- [ ] CloudWatch alarms on Lambda errors and throttles; API Gateway throttling to cap runaway cost
- [ ] Per-connection message rate limit; room-code brute-force protection (rooms lock after the reveal starts)
- [ ] Track rough usage: games created per day, in aggregate, with no per-user data

## Expected cost

| Item | Estimate |
|---|---|
| API Gateway WebSocket | $1 per million messages + $0.25 per million connection-minutes. About **$0.0003 per 8-player game**. |
| Lambda + DynamoDB | Free tier, then pennies |
| S3 + CloudFront | Pennies |
| Route 53 | $0.50/mo hosted zone + about $15/yr domain |
| **Total at hobby scale** | **About $1–2/mo** |

## Open questions

- **Domain and store name.** "The Name Game" is a common phrase (and a song). We need a
  domain and possibly a more distinctive store name. Check App Store and Play Store
  conflicts before committing.
- **Turn order after a wrong guess.** Does play move to the next player in seat order,
  or to the person you guessed wrong? This becomes a house-rule setting.
- **Reveal rules.** How many times are the names read through? Can anyone ask to hear
  the list again later?
- **Captured players.** Do players on a team still take their own turns, or does only
  the leader guess?
- **Room size.** What's the largest realistic group? This sets the free-tier cap, if any.
- **Separate AWS account or just a separate stack?** A separate account is cleaner. A
  separate stack is fewer steps.
