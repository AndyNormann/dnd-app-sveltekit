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
- [ ] **20. Map embed via `/map` + interactive canvas in-editor** — in-editor canvas DONE (custom mapBlock node mounts MapView; header "Add map" embeds at end). Remaining: the `/map` slash command (upload at the caret).
      `/map` slash command opens the image picker, uploads, and inserts a
      full-width map block at the caret (one upload per embed; keep the header
      "Add map" too). The block is an interactive canvas in the editor with the
      DM fog / grid / token / layer tools — parity with the player-facing map.
      The stored form stays `::map{id=…}`.

## Design & UX pass

> Goal: make the two surfaces (DM editor + player page) feel trustworthy and
> easy to read during a live session, without touching the data model.

- [x] **20. `/` slash menu (incl. `/map` at the caret)**
      Typing `/` opens a small command menu near the caret: **Map** (opens the
      image picker, uploads, and inserts a full-width map block at the caret),
      **Heading 1/2/3** (set block type), **Wiki link** (insert `[[Name]]`),
      **Divider**. The header "Add map" stays too. The inserted map is pushed
      into the live `data.maps` list before the node mounts so it never shows
      "[missing map]".
- [x] **21. Realtime connection indicator**
      A small status dot in the DM header and on the player page reflecting the
      SSE EventSource state (live / connecting / offline), so a silent disconnect
      during a session is visible.
- [x] **22. Save feedback toast**
      Auto-dismissing toast on save success / failure (the header text is easy to
      miss). Conflict keeps its non-dismissing reload banner.
- [x] **23. Copy player link confirmation**
      Toast "Player link copied" instead of silent copy.
- [x] **24. Empty states**
      New/empty campaign editor shows a writing hint (headings, `/map`, dice,
      wiki links); player page with nothing shared says so instead of blank.

## Notes + Combat pages (layout restructure)

> Each campaign gets two views: **Notes** (the editor / reading surface) and
> **Combat** (initiative + combat tools). Rolls stop floating over text.

- [x] **25. Rolls → right sidebar**
      Convert the floating RollLog panel into an in-flow right sidebar on the
      Notes page (outline | content | rolls), so it never covers the text.
- [x] **26. Combat page for initiative**
      Move the Initiative tracker off the floating panel into its own full page:
      DM `/c/[id]/combat` and player `/c/[id]/play/combat` (both live via SSE).
      Remove it from the Notes pages.
- [x] **27. Notes/Combat tab navigation**
      A Notes | Combat tab bar on both the DM and player pages, so the two
      surfaces of a campaign are one click apart.


## Combat board (pen-and-paper grid)

> Players get fixed per-character links; a blank 5-ft grid the DM draws on;
> auto-rolled initiative; turn-gated, speed-budgeted token movement; measure tool.

- [x] **28. Characters + player links**
      `characters` table (name, player name, speed, init bonus, color, HP/max HP,
      secret link token); DM roster CRUD with a "copy player link" button; player
      portal at `/p/<token>` (Notes + Combat tabs) that sets a signed player cookie.
- [x] **29. Combat board**
      Blank grid canvas (5-ft cells) on the Combat page with DM draw/erase tools +
      color palette, place/move tokens, Clear board; persists + realtime via SSE.
- [x] **30. Auto-rolled initiative**
      "Roll initiative" rolls d20 + init bonus for every board unit (players and
      enemies) into the turn-order tracker; active combatant gates movement.
- [x] **31. Movement + speed budget**
      Players move their own token on their turn within `speed / 5` cells, reset
      each turn; server-enforced with a DM override to move anything freely.
- [x] **32. Measure + HP**
      Drag-to-measure tool showing distance in feet/cells (DM + players); players
      see the turn order and their own HP/max HP, enemy HP is hidden.

## Combat: run-a-fight flow (improvements)

> Round out the combat board so a real encounter can be run end-to-end: damage
> applied on the board, dead units dropped from the turn wheel, players know when
> it is their turn, and a running feed of what just happened.

- [x] **33. Board HP application with floating feedback**
      DM (and optionally the unit's own player) can apply damage/heal straight on
      the board: click/select a token → a small input or −N/+N stepper → HP
      updates, a floating "+6" / "−8" chip rises from the token and fades. Should
      reuse the existing `/combat/units/[id]` HP endpoint and broadcast, so the
      initiative panel and every open board stay in sync.
- [x] **34. Death + skip-dead in turn order**
      When a unit's HP hits 0 (or ≤ 0) it is marked **down**: visually greyed /
      dropped on the board, an `alive`/`dead` flag persisted, and the initiative
      "Next" **skips** dead combatants instead of giving them turns. Recovering
      HP above 0 clears the flag.
- [x] **35. "Whose turn" prominence for players**
      The active combatant's name is already in the panel, but the player portal
      should make it unmistakable: a banner in the player combat view ("It's
      **Aria**'s turn — you're up!") when it's the viewer's character, plus a
      clear "waiting on X" otherwise.
- [x] **36. Combat log / action feed**
      A scrollback feed (in the combat sidebar or above the board) recording
      events as they happen — HP changes ("Goblin 2 takes 6 → 12"), turns started,
      rolls, deaths — broadcast via SSE to DM and players, so everyone can
      reconstruct the fight without staring at HP numbers.

## Hardening pass (5 rounds of polish)

> A repeated propose → implement → self-review → commit loop on the current
> state: UX, design, performance and small features. Each round is one commit.

- [x] **R1. DM editor data-safety + save feedback**
      Flush a pending debounced save on tab close via `navigator.sendBeacon`
      (`pagehide`), so edits aren't lost if the tab is closed mid-debounce. Show
      a transient "Saved ✓" state in the header after a successful save.
- [x] **R2. Home dashboard depth**
      Campaign cards show last-edited time + roll/map counts; a DM auth indicator
      on the home page ("Logged in as DM" / log in) instead of only logging out
      from inside a campaign.
- [x] **R3. Player live UX**
      A live "updated just now" stamp on player Notes/Combat that refreshes on
      any SSE activity, and a "New from the DM" banner when a handout is revealed.
- [x] **R4. Combat ergonomics**
      Space/N advances the turn; Escape/click-away closes the HP popover; the
      active round + whose-turn readout is more prominent.
- [x] **R5. Accessibility + performance**
      `aria-label`s on icon-only buttons, respect `prefers-reduced-motion` for
      toast/floating animations, and a visible SSE reconnect state.

## Quality

- [x] **11. Pragmatic tests**
      Unit tests for `src/lib/dice.ts` + `src/lib/markdown.ts`; e2e for auth
      enforcement (unauthenticated can't edit/upload/see secrets) + one core flow;
      separate `data/test.db`.

---

## Explicitly out of scope

- Collaborative editing (CRDT/OT)
- Version history / cross-session undo
- Private notes / player character sheets — not yet (player identity via fixed links is in)
