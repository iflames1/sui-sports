# Sui Sports

> Direct, monetizable, real-time access between fans and athletes — settled on Sui.

Sui Sports is a creator platform built for sports. Verified athletes run their
own membership economy: tiered subscriptions priced in SUI, paywalled posts and
clips, and live video rooms with chat — all tied to a wallet, with no email or
sign-up flow. Fans pay on-chain in SUI, get an entitlement object back, and the
app unlocks the corresponding tier of access.

This is the monorepo: a Rust/Axum API, a Next.js PWA, the Move package that
handles on-chain payments and membership receipts, and a shared TypeScript/Zod
schema package that keeps both ends honest.

---

## Hackathon pitch

**The problem.** Athletes own the relationship with fans, but they don't own the
distribution. Web2 fan platforms take a cut, hold the payouts, and decide who
gets verified. Push notifications, paywalls, and live chat live in five
different apps that don't talk to each other.

**The product.** Sui Sports is one place where:

- Athletes get an admin-verified profile, set membership tiers priced in SUI,
  publish free or tier-gated content, and go live with chat — without
  middlemen on the payouts.
- Fans connect a Sui wallet, follow athletes, subscribe in SUI, watch live
  rooms, and install the app to receive web push notifications when a creator
  they follow goes live or drops new content.
- Settlement happens on Sui. Membership purchases mint a `Membership` object
  to the fan and emit a `MembershipPurchased` event; the API verifies the tx
  digest before unlocking access in the app.

**Why Sui.** Object ownership is the right abstraction for memberships:
each entitlement is an addressable object the fan holds, not a row in a
provider's database. SUI-native pricing keeps it native to the ecosystem,
and Sui's fast finality + low fees make per-tier purchases practical.

**What's built.** End-to-end working flow: wallet auth → fan/athlete roles →
admin verification queue → tiered subscriptions paid in SUI → tier-gated
posts and live rooms → real-time chat with history → notifications with
PWA push and one-tap install. The Move package, the API, and the web app
are all in this repo.

**Short blurb (for submission forms):**

> Sui Sports gives athletes their own monetization stack on Sui — verified
> profiles, SUI-priced membership tiers, paywalled posts, and live rooms with
> chat — and gives fans a single installable app to pay creators directly,
> unlock tier-gated content, and get notified the moment their favorite
> athlete goes live.

---

## Features

- **Wallet-first auth.** Connect a Sui wallet, get a JWT-backed session.
  No separate sign-up, no passwords.
- **Athlete profiles + admin verification.** Self-claim is a request; the
  verified badge is granted by an admin.
- **Follow system.** Discover athletes, follow, see their content and live
  schedule in your feed and notifications.
- **Subscription tiers in SUI.** Athletes set a name, price (SUI), and
  renewal period. Fans pay on-chain; the app confirms the digest before
  unlocking.
- **Paywalled content.** Free, tier-gated, or live-replay rules per item.
  The feed only returns what the requester is entitled to.
- **Live sessions + chat.** LiveKit-powered video room with a WebSocket
  chat room that ships history on connect. Hosts can end sessions, and
  rooms can be tier-gated.
- **Notifications + installable PWA.** New follower, new subscriber, new
  content, live scheduled, verification approved. Service worker handles
  the install prompt and web push.

---

## Architecture

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  apps/web (Next.js PWA) │        │  Sui blockchain (Move)   │
│  - shadcn/ui + zustand  │        │  contracts/move/sui_sports│
│  - @mysten/dapp-kit     │◀──────▶│  - Membership { ... }    │
│  - LiveKit client       │  SUI   │  - purchase_or_extend()  │
│  - Service worker (PWA) │  pay   │  - MembershipPurchased   │
└──────────┬──────────────┘        └──────────────────────────┘
           │ JSON / WS / fetch                  ▲
           ▼                                    │ verify tx digest
┌─────────────────────────┐                     │
│  apps/api (Axum, Rust)  │─────────────────────┘
│  - JWT sessions         │
│  - sqlx + Postgres      │
│  - WebSocket chat hub   │
│  - LiveKit token mint   │
│  - Web push (VAPID)     │
└──────────┬──────────────┘
           │
           ▼
   ┌────────────────┐
   │   Postgres     │
   │   (+ Redis)    │
   └────────────────┘
```

### Repo layout

```
apps/
  api/        Rust + Axum backend (sqlx, tokio, jsonwebtoken)
  web/        Next.js 16 app (TypeScript, Tailwind, shadcn/ui, dapp-kit)
contracts/
  move/sui_sports/   Sui Move package — Membership object + purchase flow
packages/
  shared/     TS + Zod schemas shared between api/ and web/
docker-compose.yml   Local Postgres (5433) + Redis (6380)
render.yaml          Render Blueprint for the API
```

---

## Tech stack

- **On-chain:** Sui Move (`Membership` object, `purchase_or_extend`).
- **Backend:** Rust, Axum 0.8, Tokio, sqlx (Postgres), JWT sessions,
  WebSocket chat, LiveKit token minting, web-push (VAPID).
- **Frontend:** Next.js 16, React 19, Tailwind v4, shadcn/ui, TanStack
  Query, Zustand, `@mysten/dapp-kit`, livekit-client, PWA via service
  worker + manifest.
- **Schema-first:** Zod schemas in `packages/shared` keep the API and the
  UI strictly typed against the same shapes.

---

## Run it locally

Prereqs: `pnpm`, `cargo` (stable), Docker for the local DB.

```bash
# 1. Start Postgres + Redis (host ports 5433 / 6380).
docker compose up -d

# 2. API.
cp apps/api/.env.example apps/api/.env
cargo run -p sui-sports-api          # listens on :8080

# 3. Web.
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm --filter web dev                # http://localhost:3000
```

Open the app, click **Connect wallet**, and you're in. Visit `/start` for
the onboarding walkthrough or `/athlete` to upgrade to an athlete account.

### Bootstrapping an admin

Set `BOOTSTRAP_ADMIN_ZKLOGIN_SUBJECT` in `apps/api/.env` to your wallet
subject (printed in the API logs after first wallet auth, format
`wallet:0x…`). Reconnect; your role is now `admin` and `/admin` unlocks
the verification queue.

### Optional integrations

- **LiveKit** — set `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`
  in the API env to enable real video. Without them, chat-only rooms still
  work end-to-end.
- **Web push** — generate a VAPID keypair and set `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. The frontend's "Enable push"
  button picks them up automatically.

---

## Deploy

- **API** → Render (Rust runtime). The included `render.yaml` is a
  Blueprint that provisions a Postgres database and the web service in
  one step. `cargo build --release --bin sui-sports-api` is the build
  command, `./target/release/sui-sports-api` is the start command.
  Migrations are embedded into the binary at compile time and run on
  first connect.
- **Web** → Vercel. Set the project's Root Directory to `apps/web`. The
  included `apps/web/vercel.json` handles install/build for the pnpm
  workspace. Set `NEXT_PUBLIC_API_URL` to the Render URL, then add the
  Vercel domain to `CORS_ORIGINS` on the API.

---

## On-chain (Sui Move)

`contracts/move/sui_sports` contains two modules:

- `subscription` — `purchase_or_extend(payment, tier_id, valid_until_ms,
  athlete, ctx)`. Transfers SUI to the athlete, mints a `Membership`
  object owned by the fan, and emits `MembershipPurchased`.
- `athlete_registry` — lightweight registration record so on-chain code
  can attest to which addresses are athlete recipients.

After a fan signs the PTB client-side, they POST `{ txDigest, tierId }`
to `/subscriptions/sui/confirm`. The API verifies the digest against the
configured Sui RPC and writes the active subscription row.

---

## API surface (selected)

```
POST /auth/wallet/session              wallet → JWT
GET  /me                               session info
GET  /athletes?q=&verified=&sport=     discover athletes
GET  /athletes/{id}                    public profile
GET  /athletes/{id}/stats              followers / subs / posts / your status
POST /athletes/{id}/follow             follow / unfollow
POST /athletes/me/request-verification ask admin to verify
POST /admin/athletes/{id}/verify       admin grants verified
GET  /athletes/{id}/tiers              membership tiers
POST /tiers                            athlete creates tier
POST /subscriptions/sui/confirm        confirm a paid subscription on-chain
GET  /subscriptions/me                 fan's active passes
GET  /content/feed                     entitlement-aware feed
POST /content                          publish a (gated) post
GET  /live-sessions                    list live + scheduled + replays
POST /live-sessions                    schedule a live room
POST /live-sessions/{id}/join-token    LiveKit token + room URL
GET  /notifications                    inbox
POST /notifications/push-subscribe     register a web push subscription
WS   /ws/sessions/{id}/chat            real-time chat room
```

---

## License

MIT.
