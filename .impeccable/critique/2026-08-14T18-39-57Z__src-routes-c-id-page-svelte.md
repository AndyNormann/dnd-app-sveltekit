---
target: DM notes surface (visual identity focus)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-14T18-39-57Z
slug: src-routes-c-id-page-svelte
---
# Design Critique — D&D Campaign Notes · DM Notes Surface

Target: `src/routes/c/[id]/+page.svelte` (DM notes WYSIWYG cockpit). Slug `src-routes-c-id-page-svelte`.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Save/offline/queued/conflict states excellent; connection dot is a 0.6rem hollow circle, never announced |
| 2 | Match System / Real World | 3 | Dice/wiki idiom is perfect D&D; placeholder-only labels + "H1/H2/H3" are jargon |
| 3 | User Control and Freedom | 2 | Roll-clear has undo; no content history/undo, no cancel path for most destructive ops |
| 4 | Consistency and Standards | 2 | "Add map" appends at doc end vs slash-map at caret; 👁 means two things; Notes tab hardcoded active |
| 5 | Error Prevention | 3 | Confirms, 409 guard, offline queue, movement clamps; "Keep mine" silently discards remote |
| 6 | Recognition Rather Than Recall | 2 | Dice syntax + shortcuts must be memorized; only transient empty hint teaches |
| 7 | Flexibility and Efficiency | 3 | Ctrl shortcuts, source mode, persisted resizable rails, find-in-doc |
| 8 | Aesthetic and Minimalist Design | 2 | Clean editor, but a flat ~12-control header crowds the bar |
| 9 | Error Recovery | 2 | Terse "Invalid expression"/"Save failed"/"Could not apply" with no remedy; conflict recovery is the exception |
| 10 | Help and Documentation | 1 | No help system; shortcuts only in tooltips and the disappearing empty hint |
| **Total** | | **23/40** | **Acceptable** |

All ten heuristics apply; max 40.

## Design Specificity Verdict

Grounded in interactions, generic in skin. Specificity lives in the grammar and copy (dice pills, wiki links, secret/reveal, fog-of-war map embeds, hand-drawn d20, gold table-edge + roll-land). A screenshot of the editor pane alone would not identify this as a tabletop tool: theme is flat #161616/#222222 dark-SaaS, tokens named --parchment/--ink/--rule promise a material never rendered, default type is Source Serif (book face) with fantasy faces hidden behind a 7-font TypeSwitcher.

Deterministic scan: 4 findings, all false positives (toast status stripe at +page.svelte:792; two deliberate 3px gold header accents CombatLog:49 + Initiative:120; RollLog:314 is an @keyframes roll-land entry animation). Detector added nothing new.

Visual overlays: unavailable (no browser tool in this harness); deterministic scan only.

## Overall Impression

A genuinely thoughtful operate tool whose craft is in states and copy more than look. Biggest opportunity: stop hiding the strongest diegetic asset (rolls feed, dice, parchment promise) behind a conservative dark-SaaS skin — and stop deleting the rails entirely on mobile.

## What's Working
1. Save/offline/conflict state machine (Saving…/Saved ✓/Queued…/Offline/Out of sync → Reload|Keep mine).
2. Rolls rail as a live diegetic feed (d20 header, roll-land, 🤫/👁 reveal, gold table edge).
3. Empty-state teaching of the product's own grammar.

## Priority Issues
- P1 — Screen-reader users never hear dice results (a11y announce omits total). Fix: announce "…rolled 2d6+3 → 9". -> audit
- P1 — Slash menu mouse-only (no arrows/Enter, inconsistent with wikiAutocomplete). Fix: arrow-key selection + Enter. -> audit
- P1 — Resize handles not keyboard-operable (role=separator but mousedown-only). Fix: ArrowLeft/Right splitter. -> audit
- P2 — "Add map" appends at end of doc, not the caret (uploadMap = content + insert, vs slash-map at caret). Fix: insert at current selection. -> polish
- P2 — Header is an ungrouped ~12-control cluster (back, conn, crumb, ☰, ✎, title, 3 tabs, save-state, Add map, ⋮, TypeSwitcher, Logout). Fix: group into nav+title / doc-actions / session; fold TypeSwitcher+Add map into ⋮. -> layout
- P3 — Mobile deletes the rails entirely (≤56rem .rail,.rh display:none); ≤900px save-state + conn dot vanish. Fix: bottom-sheet rails or persistent mini rolls feed. -> adapt

## Persona Red Flags
- Alex (power): tiny undocumented shortcut set, no doc-list keyboard nav, slash menu mouse-only, 7-font blind TypeSwitcher.
- Jordan (first-timer): no toolbar invites clicks, empty-hint disappears after first char, icon-only buttons rely on hover titles, "Add map" looks like a button then misplaces the map.
- Sam (a11y/keyboard): slash menu + splitter mouse-only, dice results omitted from aria-live, emoji-only status outside live regions, placeholder-only labels, drag-reorder with no keyboard path. (Gold :focus-visible ring and reduced-motion are good.)

## Minor Observations
- Notes tab hardcoded class:active={true}.
- Find-in-document queries .mdx-host .ProseMirror — silently no-ops in source mode.
- .more menu holds a single item (Export).
- .bar a[target] fragile selector.
- 12s server undo after Clear is good — replicate for delete-document.
- 2d20kh1 keep/drop has zero discoverability.
- Editor bottom 30vh padding good; keep.

## Questions to Consider
1. Should the rolls feed be the persistent surface, with the editor recessed around it?
2. Is the WYSIWYG teaching syntax or hiding it — should syntax surface contextually?
3. Should connectivity be a session ritual (visible "table is live", reconnect fanfare) instead of a status LED?
