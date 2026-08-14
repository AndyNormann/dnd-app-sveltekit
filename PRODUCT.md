# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary user — the Dungeon Master.** A single person who writes and curates
the campaign, reveals maps, and runs encounters. They are the only authenticated
role today (gated by one global `DM_PASSCODE`).

**Players.** The DM's group, invited per-character through secret links. Each
character link opens a player portal scoped to that character (their notes, and
their token in combat). There are no accounts; possessing a link is the identity.
The product is currently a personal tool for the DM and their group, with the
door open to broader use later.

## Product Purpose

Let a DM run a remote, co-op tabletop session from a single self-hosted web app:
keep the campaign notes, share them selectively, reveal and draw on maps, roll
dice, and run grid-based combat — all live in-session, with players seeing only
what the DM shares.

## Positioning

A realtime, self-hosted campaign manager where the DM's notes, maps, and combat
state stream to players over SSE (snapshot-on-connect so reconnects self-heal),
and players only ever see what the DM has shared — with a pen-and-paper-style
combat board (turn-gated movement, initiative, HP, conditions, dice) layered on
top of the notes. It is owned and run by the DM, not by a hosted service.

## Operating Context

- A session is a realtime collaboration: the DM edits, the players watch and act.
- The DM runs the app on one always-on instance (SQLite + in-memory SSE +
  `svelte-adapter-bun`); this stack deliberately targets a persistent instance,
  not serverless.
- Markdown is the canonical content form. The DM edits in a Milkdown WYSIWYG
  editor (real editable `#` headings, click-to-roll dice pills, clickable
  `[[wiki links]]`, in-editor map embeds, `/` command menu); a raw CodeMirror
  source toggle and the player view are read-only fallbacks.
- Players join through per-character secret links (`/p/<token>`) and move their
  own token on their own turn within a speed budget.

## Capabilities and Constraints

**Capabilities (current, from the code):**
- Per-document notes with Markdown/WYSIWYG editing, wiki links
  (`[[Doc]]` / `[[Doc#Heading]]`), and per-document share toggles.
- Fog-of-war map embeds: reveal/erase (rect + brush), grid + snapping,
  DM-placed tokens, multiple reveal layers, per-layer undo/clear, pings.
- Dice roller with keep/drop (`2d20kh1`, `4d6dl1`), named rolls, crit/fumble
  detection, inline rolls detected in note text, secret rolls (DM) revealable.
- Initiative tracker with auto-roll, manual reorder, per-combatant re-roll,
  round counter, skip-dead turn order.
- Combat board: pen-and-paper grid, draw/erase tools + colors, DM-created
  characters with secret player links, turn-gated speed-budgeted movement,
  drag-to-measure, HP/damage + conditions, whose-turn banner, combat log,
  player ready signalling, encounter save/load, zoom/pan.
- Realtime over SSE with role-aware broadcasts (secret content never sent to
  players), heartbeat + reconnect self-heal, aria-live announcements.
- Home dashboard with last-edited + counts, find-in-notes, export/backup/
  restore, DM auth pill, automatic DB backups.

**Constraints:**
- Auth: one global `DM_PASSCODE` for the DM; players authenticate only by
  possessing their secret character link. No accounts.
- Markdown stays canonical; the editor round-trips markdown losslessly.
- Self-hosted; no third-party services required to run.
- Theme is a single Indigo-on-Obsidian dark theme (not switchable at runtime).

## Brand Commitments

- Name: **D&D Campaign Notes** (package `dnd-app-sveltekit`).
- Voice: plain, tabletop-casual, direct.
- Visual identity: dark "Obsidian" base with indigo accents, D&D-flavored but
  subdued (Cinzel/Crimson Pro display+body fonts). Recorded from the current
  code; not an externally owned brand.

## Evidence on Hand

- The live codebase is the source of truth for current features (routes:
  home, DM notes/combat/roster, login, player portal notes/combat).
- 30 unit tests + 36 Playwright e2e tests cover core flows (auth, realtime,
  combat, share, WYSIWYG, theme).
- No marketing copy, testimonials, or third-party references exist; none should
  be fabricated.

## Product Principles

1. **The DM owns everything; players see only what's shared.** Secret content is
   never sent to players, even by accident.
2. **Realtime is the default.** State streams live and reconnects self-heal
   without a reload.
3. **Markdown is canonical.** The WYSIWYG editor is a surface over markdown, not
   a replacement for it.
4. **Self-hosted and self-contained.** It runs on one instance with no external
   service required.
5. **Hardening over feature sprawl.** The core flows (notes, maps, rolls,
   initiative, combat) get solid before new features are added.

## Accessibility & Inclusion

- Realtime events are announced via aria-live; icon-only buttons carry
  aria-labels; a visible keyboard focus ring and `prefers-reduced-motion`
  support are in place. No product-specific audience accessibility standard has
  been set beyond this baseline.
