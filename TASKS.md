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

## Core reliability hardening (before more features)

- [x] **12. Automatic backups + WAL checkpointing**
      Scheduled SQLite checkpoint + `VACUUM INTO` snapshot to `data/backups`
      (retain N), so the whole campaign survives a crash / volume loss.
- [x] **13. Content revision guard (concurrency)**
      Per-campaign `rev`; the content POST carries its base `rev` and returns
      409 on a stale write so two open editor tabs can't silently clobber each
      other.
- [x] **14. SSE heartbeat + reconnect race fix**
      Periodic `: ping` keeps connections alive through proxies; build the
      snapshot *after* subscribing so no event is missed on connect.
- [x] **15. Realtime e2e tests**
      e2e proving DM note edits reach an open player page, reconnecting players
      get a fresh snapshot, and secret rolls never reach players.

## Core-flow polish (the four flows in active use)

- [x] **16. Map reveal undo + clear layer**
      Undo the last reveal/hide op (and clear a whole layer's fog) per map, so
      an accidental reveal is recoverable.
- [x] **17. Initiative round counter**
      Track the combat round; "Next" auto-increments it when wrapping from last
      to first. Shown in the panel.
- [x] **18. Reveal a secret roll to players**
      DM can deliberately show a previously-secret roll to players.

## DM editor: markdown-native WYSIWYG (edit-what-you-see)

> Goal: the DM editor and the rendered output are the same surface — type
> markdown, see it live-rendered. Markdown stays the canonical stored / exported
> / shared form (DB, export, share, sanitize, player view all unchanged).
> Built on Milkdown (ProseMirror-based, markdown-native) mounted client-side like
> CodeMirror is today.

- [x] **19. WYSIWYG core swap**
      Replace `Editor.svelte` with a Milkdown editor as the DM editing surface.
      Live-render headings (keep `<!--id:…-->` markers in stored markdown via a
      heading-node `id` attribute, serialized back out; server `ensureHeadingIds`
      backstops new headings) with the DM controls attached inline (share /
      collapse / 📢 handout, parity with today's preview); dice expressions as
      click-to-roll pills (arrow-in or delete to edit); `[[Wiki Link]]` as
      click-to-jump anchors. Keep the raw CodeMirror editor behind the existing
      "source" toggle (Ctrl+\) as a fallback for the round-trip risk. Save flow
      unchanged (Milkdown emits markdown → debounced POST + revision guard).
- [ ] **20. Map embed via `/map` + interactive canvas in-editor**
      `/map` slash command opens the image picker, uploads, and inserts a
      full-width map block at the caret (one upload per embed; keep the header
      "Add map" too). The block is an interactive canvas in the editor with the
      DM fog / grid / token / layer tools — parity with the player-facing map.
      The stored form stays `::map{id=…}`.

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
