# TASKS.md

## D&D Campaign Notes — Roadmap (remote co-op)

**Product model:** Remote co-op. Single DM (you), anonymous players. One always-on
instance. SQLite + `svelte-adapter-bun`. **No collaborative editing.**

> Resolved during build: dice operators `kh`/`kl`/`dh`/`dl`; export = JSON
> bundle (`.dndcampaign.json`); handout reveal = 📢 button per heading + scroll/flash.

---

## Foundation hardening (do first)

- [x] **1. Env-driven DB path**
      Make `src/lib/server/db.ts` read the DB path from an env var (default:
      `data/app.db`). Prerequisite for safe deploys and test isolation.
- [x] **2. DM auth (single global passcode)**
      Hash the passcode; issue a DM session cookie. Enforce role checks on every
      POST route. Unauthenticated = player role. Block `/content`, `/title`,
      `/share`, `/collapse`, `/maps`, `/reveal`; hide secret rolls from players.
- [x] **3. SSE snapshot-on-connect**
      On `/events` connect, send current doc HTML + full roll log + map reveal ops
      before streaming deltas, so reconnects self-heal.
- [x] **4. Deploy**
      Single always-on host (Fly.io / Railway / VPS) with persistent volume for
      SQLite + `static/uploads`.

## M1 — Remote-play features

- [x] **5. Export & backup**
      Bundle a campaign (markdown + maps + reveals) to a file; restore it.
- [x] **6. Dice upgrades**
      Advantage/disadvantage, drop-lowest, named rolls, crit highlighting.
      Extend `src/lib/dice.ts`.
- [x] **7. Handout reveal**
      "Reveal this section to players now" on the existing heading-share model via
      `share-changed` broadcast + small UI affordance.

## M2 — Session workhorse

- [x] **8. Initiative tracker**
      Broadcast panel: combatants, initiative order, turn markers, HP.
- [x] **9. Full-text search**
      Across all campaigns/notes.
- [x] **10. Map upgrades**
      Grid + snapping, DM tokens, multiple reveal layers.

## Quality

- [x] **11. Pragmatic tests**
      Unit tests for `src/lib/dice.ts` + `src/lib/markdown.ts`; e2e for auth
      enforcement (unauthenticated can't edit/upload/see secrets) + one core flow;
      separate `data/test.db`.

---

## Explicitly out of scope

- Collaborative editing (CRDT/OT)
- Version history / cross-session undo
- Per-player identity features (private notes, player character sheets) — need accounts first
