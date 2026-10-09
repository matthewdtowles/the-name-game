# Roadmap

What we're building and the decisions behind it. Work items are GitHub
issues, and progress is tracked on the [project board](https://github.com/users/matthewdtowles/projects/2).

## The game

1. Everyone secretly writes one name: a famous person or someone everyone in the room knows.
2. The names are read aloud once, in shuffled order. Nobody knows who wrote which.
3. Everyone starts as a **team of one**. Teams take turns in **seat order**: the order
   players joined, which the host can rearrange to match where people are sitting.
4. On your team's turn, pick any player whose name hasn't been guessed yet. That's
   always the leader of another team. Guess which name they wrote. Teammates share what
   they know and decide together.
   - **Right:** their whole team joins yours, and your team guesses again.
   - **Wrong:** the turn passes to the next team in seat order.
5. The first team to hold everyone wins.

**Reminders and ending early.** By default the names may be re-read once as a reminder.
The host can change the number of reminders, and 0 turns them off. Once no reminders
remain, the host can **End round**: the largest team wins, and tied teams share the win.

A merged team keeps the guessing leader's seat in the turn order.

The paper version's flaw is that the reader recognizes handwriting. The app fixes that:
it collects the names privately and reveals them shuffled, with no link to who wrote
each one.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Clients | One **Expo** codebase (SDK 56, expo-router, TypeScript) builds the iOS app, the Android app, and the **web** version | Guests can join from a browser without installing anything. The TV view is just another web route. The stack and patterns come from `i-want-my-mtg-mobile`. |
| Backend | **Serverless on AWS**: API Gateway WebSocket API → one Lambda (Node, arm64) → DynamoDB (on-demand, TTL) | Costs about $0 when idle and pennies per thousand games. There's no server to patch or keep alive. Multi-AZ by default, and it scales if the game takes off. Game state survives deploys and phones going to sleep. |
| Name | **Whose Name?** at **whosename.app** (`play.` for the game server, `staging.` for staging) | It names the guessing at the heart of the game, and no App Store app uses it, while "The Name Game", "Fishbowl" and "Celebrity" are crowded. Store listings can add "The Name Game" as a subtitle so generic searches still find it. |
| Web hosting | Expo static web export in **S3 + CloudFront**, with Route 53 DNS | Same CloudFront setup as `i-want-my-mtg`. The same domain serves the universal-link files. |
| Infra as code | **AWS CDK (TypeScript)** in `infra/`, as its own stack in the existing AWS account. It's bootstrapped with a separate qualifier (`tng`), and every resource is tagged `project=the-name-game`. | Kept apart from the iwmm infra without the overhead of a second account. Separate CDK roles keep its deploys from touching iwmm resources. The tag isolates its costs. |
| AWS access | A dedicated IAM user, `the-name-game-deployer` (local profile `the-name-game`), that can only assume the `cdk-tng-*` roles. CI uses a GitHub OIDC role scoped the same way. | Separate credentials from iwmm. No long-lived keys in GitHub. |
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

Each phase is a GitHub milestone. Status lives on the [project board](https://github.com/users/matthewdtowles/projects/2).

### Phase 0: Foundations
Accounts, AWS boundaries, monorepo scaffold, and CI.

- [#1](https://github.com/matthewdtowles/the-name-game/issues/1) Choose the store name and register the domain
- [#2](https://github.com/matthewdtowles/the-name-game/issues/2) Create the dedicated IAM user and local AWS profile
- [#3](https://github.com/matthewdtowles/the-name-game/issues/3) Bootstrap CDK with the tng qualifier and a scoped execution policy
- [#4](https://github.com/matthewdtowles/the-name-game/issues/4) Add an AWS Budget alarm for the project
- [#5](https://github.com/matthewdtowles/the-name-game/issues/5) Set up the GitHub OIDC deploy role
- [#6](https://github.com/matthewdtowles/the-name-game/issues/6) Scaffold the npm-workspaces monorepo
- [#7](https://github.com/matthewdtowles/the-name-game/issues/7) Define the shared protocol schemas and game types
- [#8](https://github.com/matthewdtowles/the-name-game/issues/8) Run typecheck, lint, and tests on every PR
- [#9](https://github.com/matthewdtowles/the-name-game/issues/9) Version releases from the PR title on main
- [#10](https://github.com/matthewdtowles/the-name-game/issues/10) Add a contributor guide with dev commands and conventions

### Phase 1: MVP
Collect names and reveal them. Web first, playable at a party with only phone browsers.

- [#11](https://github.com/matthewdtowles/the-name-game/issues/11) Build the rules engine for the lobby, submission, and reveal phases
- [#12](https://github.com/matthewdtowles/the-name-game/issues/12) Carry a room tier and enforce limits on the server
- [#13](https://github.com/matthewdtowles/the-name-game/issues/13) Implement the WebSocket Lambda handler and DynamoDB room store
- [#14](https://github.com/matthewdtowles/the-name-game/issues/14) Add a local dev server with an in-memory store
- [#15](https://github.com/matthewdtowles/the-name-game/issues/15) Create a room with a code, QR code, and share link
- [#16](https://github.com/matthewdtowles/the-name-game/issues/16) Join a room by code or link with a unique display name
- [#17](https://github.com/matthewdtowles/the-name-game/issues/17) Submit a secret name
- [#18](https://github.com/matthewdtowles/the-name-game/issues/18) Detect duplicate names and ask the later submitter to pick again
- [#19](https://github.com/matthewdtowles/the-name-game/issues/19) Show submission progress and let the host start the reveal
- [#20](https://github.com/matthewdtowles/the-name-game/issues/20) Reveal the shuffled names on the host's phone
- [#21](https://github.com/matthewdtowles/the-name-game/issues/21) Add configurable reveal reminders
- [#22](https://github.com/matthewdtowles/the-name-game/issues/22) Let the host kick players and lock the room at the reveal
- [#23](https://github.com/matthewdtowles/the-name-game/issues/23) Reconnect players with their session token
- [#24](https://github.com/matthewdtowles/the-name-game/issues/24) Deploy the backend stack with CDK
- [#25](https://github.com/matthewdtowles/the-name-game/issues/25) Host the web build on S3 and CloudFront with a deploy workflow
- [#26](https://github.com/matthewdtowles/the-name-game/issues/26) Publish the privacy page
- [#27](https://github.com/matthewdtowles/the-name-game/issues/27) Playtest at a real game night

### Phase 2: TV display
Any smart TV browser, cast Chrome tab, or AirPlay mirror shows the game.

- [#28](https://github.com/matthewdtowles/the-name-game/issues/28) Add the /tv display route
- [#29](https://github.com/matthewdtowles/the-name-game/issues/29) Design the 10-foot TV UI
- [#30](https://github.com/matthewdtowles/the-name-game/issues/30) Make the host's phone the reveal remote
- [#31](https://github.com/matthewdtowles/the-name-game/issues/31) Add a timed reveal to the TV
- [#32](https://github.com/matthewdtowles/the-name-game/issues/32) Show the lobby on the TV

### Phase 3: Native apps
iOS and Android apps in the public stores.

- [#33](https://github.com/matthewdtowles/the-name-game/issues/33) Port the theme tokens and dark mode, and add the app icon and splash screen
- [#34](https://github.com/matthewdtowles/the-name-game/issues/34) Add universal links and App Links for /j/*
- [#35](https://github.com/matthewdtowles/the-name-game/issues/35) Add haptics, keep-awake during the reveal, and a share sheet for the invite
- [#36](https://github.com/matthewdtowles/the-name-game/issues/36) Add an in-app QR scanner
- [#37](https://github.com/matthewdtowles/the-name-game/issues/37) Set up EAS build profiles and the ship workflow
- [#38](https://github.com/matthewdtowles/the-name-game/issues/38) Release to TestFlight and Play internal testing, then the public stores

### Phase 4: Full game
Run the turns, guesses, and team merges in the app.

- [#39](https://github.com/matthewdtowles/the-name-game/issues/39) Let the host arrange the seat order in the lobby
- [#40](https://github.com/matthewdtowles/the-name-game/issues/40) Track team turns in seat order
- [#41](https://github.com/matthewdtowles/the-name-game/issues/41) Build the guess flow with confirmation from the target
- [#42](https://github.com/matthewdtowles/the-name-game/issues/42) Merge teams on a correct guess
- [#43](https://github.com/matthewdtowles/the-name-game/issues/43) Show the live team board on phones and the TV
- [#44](https://github.com/matthewdtowles/the-name-game/issues/44) Add End round once no reminders remain
- [#45](https://github.com/matthewdtowles/the-name-game/issues/45) Detect the winner and reveal who wrote what
- [#46](https://github.com/matthewdtowles/the-name-game/issues/46) Let the host undo the last action
- [#47](https://github.com/matthewdtowles/the-name-game/issues/47) Add Play again that keeps the room and players

### Phase 5: Casting
One tap from the host's phone to the TV.

- [#48](https://github.com/matthewdtowles/the-name-game/issues/48) Build a Google Cast custom Web Receiver from the /tv page
- [#49](https://github.com/matthewdtowles/the-name-game/issues/49) Add the Cast button to the host's phone
- [#50](https://github.com/matthewdtowles/the-name-game/issues/50) Research AirPlay external display beyond mirroring
- [#51](https://github.com/matthewdtowles/the-name-game/issues/51) Evaluate native Android TV, Fire TV, or tvOS apps

### Phase 6: Polish
Make it delightful.

- [#52](https://github.com/matthewdtowles/the-name-game/issues/52) Add sounds and animations for the reveal and team merges
- [#53](https://github.com/matthewdtowles/the-name-game/issues/53) Add an optional turn timer
- [#54](https://github.com/matthewdtowles/the-name-game/issues/54) Add fuzzy duplicate detection
- [#55](https://github.com/matthewdtowles/the-name-game/issues/55) Add category prompts
- [#56](https://github.com/matthewdtowles/the-name-game/issues/56) Do an accessibility pass
- [#57](https://github.com/matthewdtowles/the-name-game/issues/57) Lay the groundwork for localization

### Phase 7: Monetization
The core game stays free. Paid features belong to the host, and guests never pay.

- [#58](https://github.com/matthewdtowles/the-name-game/issues/58) Decide the Host Pass perks and price
- [#59](https://github.com/matthewdtowles/the-name-game/issues/59) Sell the Host Pass in-app through RevenueCat
- [#60](https://github.com/matthewdtowles/the-name-game/issues/60) Sell the Host Pass on the web through Stripe
- [#61](https://github.com/matthewdtowles/the-name-game/issues/61) Add an optional tip jar

### Operations
Keep it running, cheap, and safe.

- [#62](https://github.com/matthewdtowles/the-name-game/issues/62) Add CloudWatch alarms for Lambda errors and throttles
- [#63](https://github.com/matthewdtowles/the-name-game/issues/63) Throttle API Gateway and rate-limit each connection
- [#64](https://github.com/matthewdtowles/the-name-game/issues/64) Track aggregate usage

## Expected cost

| Item | Estimate |
|---|---|
| API Gateway WebSocket | $1 per million messages + $0.25 per million connection-minutes. About **$0.0003 per 8-player game**. |
| Lambda + DynamoDB | Free tier, then pennies |
| S3 + CloudFront | Pennies |
| Route 53 | $0.50/mo hosted zone + $20/yr for whosename.app |
| **Total at hobby scale** | **About $1–2/mo** |

## Open questions

- **Room size.** What's the largest realistic group? This sets the free-tier cap, if any.
