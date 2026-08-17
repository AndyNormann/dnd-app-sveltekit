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

## Monster library + quick encounters

> Manage reusable monster templates alongside player characters and build
> encounters from them in seconds.

- [x] **37. Monster library**
      A persisted `monsters` table (name, color, speed, init bonus, max HP) with
      DM-only CRUD routes (`/c/[id]/monsters`, `/c/[id]/monsters/[id]`) and a
      Monsters panel on the combat page (add / edit / delete, ⚔ add-to-board),
      broadcast via a new `monsters-updated` SSE event.
- [x] **38. Quick encounter setup**
      An "Add encounter" picker in the setup area: select a monster template + a
      count, spawns that many enemy tokens on the board (full HP, staggered
      positions) via a new `add-monster` action on `/combat/units`; spawning
      names multiples "Monster 1/2/3" and copies the template's stats.
- [x] **39. Roster page for character/monster management**
      Character and monster creation/editing moved off the Combat page onto a
      dedicated DM-only **Roster** page (`/c/[id]/combat/roster`, reached via a
      Roster tab on the DM Notes + Combat pages) with add/edit/delete for both
      and per-character player links. The Combat page keeps the board + setup:
      roll initiative, quick-add a player via a picker, the encounter picker,
      manual add-enemy, and clear board.
- [x] **40. Combat sidebar layout**
      The DM and player-portal combat pages are now three columns: initiative
      tracker as the left sidebar, the board (with setup/quick-adds for the DM)
      in the center, and the combat log as the right sidebar. Rails are sticky
      with independent scroll and collapse to a single column under 72rem.
- [x] **41. Remove manual initiative add**
      The DM add form in the initiative tracker is gone — combatants now enter
      the tracker only as combat units (via the player picker, the encounter
      picker, or manual add-enemy on the board, then Roll initiative). The dead
      `add` action was removed from the initiative route.
- [x] **42. Realtime pings on maps + combat board**
      GM and players can ping a spot on the notes-view maps and on the combat
      board; pings relay live via SSE (`map-ping` / `combat-ping`), auto-fade
      after ~2s as a pulsing ripple ring, and are coloured per user — golden for the GM
      (`#f0c040`), the character's token colour for portal players, a neutral
      blue for anonymous spectators. Notes map: DM uses a 📌 Ping toolbar mode
      and players just click the read-only map. Combat board: a 📌 Ping tool on
      both DM and player toolbars.
- [x] **43. Player identity on portal rolls**
      Rolls made from a player portal (`/p/<token>`) now carry the character's
      name as the roller (via a `roller` prop on RenderedDoc), so the DM and
      others see who rolled instead of “Anonymous”. Pings already used the
      character name/colour.
- [x] **44. Connection resilience for the DM editor**
      The DM save path now notices when the client is offline: a failed save
      while offline is queued (with an “Offline · will save when back” /
      “Queued…” indicator) and auto-flushed on reconnect (`navigator.onLine`
      listeners + SSE reopen), instead of firing a misleading “Save failed”
      toast or losing the edit.
- [x] **45. Attack + damage helper on the combat board**
      The DM HP popover gained an attack section: roll d20+Atk bonus vs a target
      AC (logged to the combat log as Hit/Miss/Crit/Fumble), and a damage helper
      that rolls a dice expression and applies it to the token's HP (via the
      hp action, which logs the damage).
- [x] **46. Conditions / status markers on combat tokens**
      `combat_units` gained a `conditions` text field; the DM HP popover has a
      conditions editor (quick chips: Concentrating/Prone/Grappled/Stunned/
      Restrained/Blinded + custom comma-separated input, saved to the unit),
      and condition badges render on the tokens with per-condition colours.

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

## Combat + UX batch (2, 4, 5, 6, 9, 10, 11)

> Seven improvements implemented in one pass: encounter save/load, player ready
> signalling, in-campaign find, board drawing undo, restore-from-backup, realtime
> aria-live, and a mobile-friendly (zoom/pan) combat board.

- [x] **E1. Monster collections (roster → combat board)**
      Replaces the save-board "encounters" with reusable monster groups. On the
      Roster page the DM creates a collection (name) and adds monster templates
      with counts. On the Combat page they pick one collection and drop the whole
      group onto the board in one step (`add-collection` on the units route).
      `collections` table (name + items JSON), DM-only route
      `/c/[id]/combat/collections`, and a `CollectionCard` component on the roster.
- [x] **E2. Player "done / ready" signalling**
      A player marks their unit ready on the combat page; the DM sees how many /
      which players are ready. Ready is in-memory per campaign, reset whenever the
      turn advances or initiative is rolled. SSE `combat-ready` event + DM-only
      status line; player button on the portal combat page.
- [x] **E3. In-campaign "find in notes"**
      A Find box on the DM notes page searches the live document, lists matching
      sections, and clicking a result scrolls the Milkdown editor to that heading.
- [x] **E4. Combat board drawing undo**
      One "Undo" for the last stroke on the DM board toolbar: POST
      `{action:'undo'}` to the drawings route (deletes the most recent drawing,
      broadcasts the remaining list).
- [x] **E5. Restore-from-backup UI**
      Home page (DM only) lists dated backups with Download + Restore. Restore
      snapshots the current DB, swaps the live DB file for the chosen backup, and
      hot-reopens the connection (`conn.ts` gains `reopenDb`), then the page
      reloads.
- [x] **E6. Real-time aria-live**
      A small `A11yLive` component (polite `role=status` + assertive
      `role=alert` regions) mounted on the DM/player notes and combat pages;
      important SSE events (handout, roll, combat log, turn change, ready) are
      announced to screen readers.
- [x] **E7. Mobile combat board (zoom/pan)**
      The board sits in a scrollable, touch-pannable viewport with +/−/fit zoom
      controls. Coordinate math is refactored to derive cell size from the board's
      bounding rect so it stays correct at any zoom.

## Document model (Bear-like notes) — restructuring

> The campaign keeps a set of **documents** instead of one content blob. The DM
> notes page becomes a document list (sidebar) + editor; the player portal shows
> shared documents read-only. Per-heading share/collapse and the section-highlight
> box are removed. Sharing is per-document, one shared set for all players, hidden
> by default.

- [x] **F1. Documents data model + migration**
      New `documents` table (id, campaign_id, title, content, position, shared,
      created_at, updated_at, rev) + CRUD module (list/get/create/update/
      rename/delete/reorder/setShared). `createCampaign` seeds one empty
      document; existing campaigns with content but no documents migrate to a
      single document (title = campaign title or "Notes", shared=0). Export/
      import bundle documents.
- [x] **F2. DM notes page → document list + editor**
      Left sidebar = `DocumentList` (all docs): `+` create, drag-to-reorder,
      delete-with-confirm, select. Middle = Milkdown editor for the selected
      document; title field renames. Right rail = campaign roll log (unchanged).
      Tabs Notes|Combat|Roster unchanged. Realtime events carry the document id.
- [x] **F3. Per-document sharing + player portal**
      DM toggles each document Shared/Hidden (sidebar). Player portal `/p/<token>`
      shows shared documents read-only; remove the anonymous `/c/[id]/play` and
      `/c/[id]/play/combat` spectator views. Document-share changes broadcast.
- [x] **F4. Editor cleanup + wiki links + maps**
      Remove heading share/collapse controls and the section-highlight box (keep
      editable `#` markers + dice pills). Wiki links `[[Doc]]` / `[[Doc#Heading]]`
      open the document (scroll to heading). `/map` gains "pick existing or upload
      new".
- [x] **F5. Export/backup + tests**
      Export/backup/restore cover all documents. Update/rewrite unit + e2e tests
      for the document model (share, hierarchy, section-highlight, wysiwyg,
      find-in-notes, combat-flow) and mark TASKS.md [x] + commit.

## Improvements batch (suggested slice)

> Ten items from the "more suggestions" pass. Several were already satisfied by
> earlier work; the rest were implemented in one commit.

- [x] **1. Player portal notes rolling dead-end** — `/p/[token]` notes now has a
      rolls rail (`RollLog`, player mode) plus `roll`/`rolls-cleared`/
      `rolls-restored` SSE handling, and RenderedDoc gets `onroll`, so inline
      dice on the player portal give live feedback.
- [x] **2. Combat board grid labels** — axis letters (A…) across the top and row
      numbers (1…) down the left, drawn on the board canvas for voice call-outs.
- [x] **3. Add-map input keyboard accessibility** — the header "Add map" file
      input is now visually-hidden-but-focusable (no more `display:none`), so
      keyboard users can reach it. (Heading-controls a11y is moot: those
      controls were removed in the document-model rewrite.)
- [x] **4. Manual initiative reorder + re-roll one combatant** — per-entry ▲/▼
      buttons swap adjacent combatants (by exchanging init values, keeping the
      init-sort), and a ⟳ button re-rolls a single entry's initiative (d20 +
      unit bonus). New `rerollCombatant` / `moveInitiativeEntry` in combat.ts,
      `init` accepted by `updateInitiative`.
- [x] **5. Conditions on board tokens** — already present (condition chips
      render under each token).
- [x] **6. Turn clock** — a `⏱ mm:ss` elapsed readout (DM + player toolbars)
      that resets whenever the active turn changes.
- [x] **7. Wiki-link autocomplete** — typing `[[` opens a popup listing matching
      documents; Arrow keys / Enter complete the `[[Doc]]` link, Escape closes.
      New `wikiAutocomplete.ts` `$prose` plugin + `.dnd-wiki-pop` CSS.
- [x] **8. Mobile pass for DM notes** — already present (`.layout` collapses to
      a single column at 56rem).
- [x] **9. Share a single document** — already present via per-document Shared
      toggles in the document model (F3).
- [x] **10. Stale `# Heading` hint copy** — the empty-state hint now notes that
      headings come from the `/` menu (H1/H2/H3) and that typing `#` stays plain
      text.

## Current playability QoL batch

- [x] **P1. Player notes rolling UX** — keep RollLog and inline dice rolling fully live in the fixed-link player Notes portal.
- [x] **P2. Destructive-action safety** — confirmations for clear board, clear initiative, and character deletion; do not optimistically claim success before the request succeeds.
- [x] **P3. Combat accessibility** — keyboard/focus access for combat controls and tokens, readable labels, and live status announcements.
- [x] **P4. Combat conditions and map zones** — maintain token conditions and allow persistent full-cover, half-cover, and difficult-terrain markings on the combat board, visible to players and DM.

## Sleek notes-app overhaul (drop the War Table / stylized look)

Pivot the whole visual identity from the dark aged-oak "War Table" (wood grain,
candlelight vignette, brass gold, wax seals, torn deckle edges, ornaments) to a
clean, flat, light Bear-like notes app. One light palette, hairline borders, one
warm accent, system-ui chrome + serif editor prose. The document model (F1-F5) is
untouched — this is visual + copy only.

- [x] **T1. Retarget theme tokens (the single lever)** — in `+layout.svelte`,
      keep every `--var` name but change its value: `--parchment`→light app bg,
      `--parchment-deep/--parchment-light`→surface tiers, `--ink`/`--ink-soft`→
      near-black text/muted, `--rule`→hairline border, `--accent`/`--gold`→the
      warm accent (user: warmer), `--danger`/`--success` retuned for light. This
      recolors all ~192 refs automatically. Delete the `data-type`/`data-size`
      font-preset blocks.
- [x] **T2. Strip decorative classes** — remove from `+layout.svelte`:
      `--wood-grain`, `--paper-grain`, `--ink-divider`, the body candlelight
      gradients + `body::after` vignette, `.deckle`, `.dogear`, `.filigree`,
      `.ornament`, `.btn-wax`; rebuild `.sheet` as a plain white card. Body is a
      flat light background. Fonts: drop Cinzel/Garamond/Crimson/Lora/EB-Garamond
      imports, keep one serif (Source Serif 4) for editor prose; UI = system-ui.
- [x] **T3. Remove TypeSwitcher** — delete `TypeSwitcher.svelte`, its import +
      render in the 6 routes, and its `data-type`/`data-size` CSS. Typography is
      now fixed (sans chrome, serif editor). Rewrite `typography.e2e.ts`.
- [x] **T4. De-fancier the pages** — home (`+page.svelte`): drop the leather
      `.table` rim, compass-rose `::before`, stitched `::after`, `crest-band`
      glow, `.ornament` ✦, `Seal`, `btn-wax "Seal & Create"`→plain
      "Create campaign", `.card` rotation/shadow piles, `sheet-ink-*` classes →
      flat cards. Login: `panel sheet deckle`, "The DM's Seal", ornament, `btn-wax
      "Unseal"` → plain centered card + "Log in". DM/player/combat/roster pages:
      strip `TypeSwitcher`, `Seal`, `paper-grain` backgrounds, hardcoded gold
      borders; switch `--gold`→accent. Delete `Seal.svelte`.
- [x] **T5. Component + test sweep** — in the ~14 components replace hardcoded
      gold/wood hexes (`#7a5c14`, `#3a2a1a`, `rgba(...gold)` etc.) with
      `var(--accent)`/`var(--border)`; ensure CombatBoard/MapView grid + token
      colors read on light. Rewrite `theme.e2e.ts` for light surfaces. Run
      `bun run check` + full e2e, then commit.
