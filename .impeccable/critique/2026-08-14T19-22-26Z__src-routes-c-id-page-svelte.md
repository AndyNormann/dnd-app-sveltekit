---
target: DM notes cockpit (src/routes/c/[id]/+page.svelte)
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-14T19-22-26Z
slug: src-routes-c-id-page-svelte
---
# Design Critique — D&D Campaign Notes · DM Notes Cockpit

Target: `src/routes/c/[id]/+page.svelte`. Slug `src-routes-c-id-page-svelte`. No ignore file.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:---:|-----------|
| 1 | Visibility of System Status | 4 | Excellent save/offline/conflict machine — but the realtime connection (most critical live-session status) is a 0.6rem unlabeled dot that vanishes below 900px |
| 2 | Match System / Real World | 4 | Tabletop-native throughout (`2d6+3`, d20, 🗺); only `2d20kh1` keep/drop grammar is assumed jargon |
| 3 | User Control and Freedom | 3 | Escape/undo/resizable rails — but rolls rail can't be dismissed (asymmetric with outline) and clear-undo is a fixed 12s |
| 4 | Consistency and Standards | 3 | 👁 means "reveal" in rolls but "shared" in the doc list; emoji clash with the crafted Cinzel/gold glyph world |
| 5 | Error Prevention | 3 | Conflicts caught, beacon flush — but `revealRoll` clears the secret flag even when the server errors, and "Keep mine" overwrites blind |
| 6 | Recognition Rather Than Recall | 3 | Shortcuts documented only in the empty-hint, which dies with the first character |
| 7 | Flexibility and Efficiency | 4 | Resizable+persisted rails, shortcuts, drag-reorder — but the slash menu is static and mouse-only |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely disciplined parchment/gold material — but one header row carries 13 targets in ~6 hairline groups |
| 9 | Error Recovery | 3 | Conflict UI exemplary; but offline dice clicks and no-match wiki links fail silently |
| 10 | Help and Documentation | 2 | The empty-hint cheat sheet is the only help in the app; it disappears with the first character |
| **Total** | | **32/40** | **Good** |

## Design Specificity Verdict

**Specific — authored for a TTRPG DM, not category-interchangeable.** The chrome could be lifted into any notes app, but the behavioral surface cannot: inline dice pills, wiki autocomplete, fog-of-war map embeds with live tokens/reveal layers, a `/` menu whose first item is 🗺 Map, the secret/reveal/undo-clear rolls machine, crit/fumble 🎉/💀, and Cinzel-display-over-serif "tome" type are all GM verbs. Removing the D&D layer deletes the product. One leak: the TypeSwitcher (7 pairings × 3 sizes, cycle-only) is a writing-app taste feature in a session tool.

Detector: 4 warnings (exit 2), all `slop` — `side-tab` ×2 and `border-accent-on-rounded` ×2 (gold table-edge borders on Initiative/CombatLog cards, toast 4px success border, transient inset-gold stripe in the roll-land keyframe). Two are likely false positives at the static level (toast carries `role="status"`, which the browser engine exempts; the roll-land stripe resolves to `box-shadow:none` at 100%). Aggregate signal: the same `3px solid var(--gold)` edge repeats at 4+ spots and the 4px toast border at 3 spots.

Visual overlays: none — browser automation unavailable in this harness; static source inspection used as the fallback signal.

## Overall Impression

A real tabletop instrument with superb invisible-fidelity (save, conflict, offline, undo) and a genuinely D&D-native editor. Its biggest gap is the social axis: who's connected, what players currently see, whether a secret is armed — treated as a files problem, not a table problem. The DM runs a table they cannot see.

## What's Working

1. Save/conflict/offline machine engineered against the DM's #1 fear (losing prep): debounce, sendBeacon flush, offline queue, 409 flow with Reload/Keep-mine, aria-live.
2. Editor augmentation is TTRPG-native and markdown-lossless — dice pills, wiki autocomplete, fog embeds, `/` menu are decoration plugins over canonical markdown.
3. The rolls sidebar is crafted — gold "table edge", roll-land animation, per-roll reveal, undoable clear — inside a coherent parchment-dark/indigo/gold language with focus rings and reduced-motion support.

## Priority Issues

- **[P0] Reveal can silently diverge from player truth.** `RollLog.revealRoll` ignores the fetch result; on non-2xx it still flips the roll public locally. Core trust promise breaks silently mid-session. Fix: only clear the secret flag on `res.ok`; keep secret + toast on failure; confirm "shown to players". ($impeccable harden)
- **[P1] Secret-armed state is invisible after commit.** The 🤫 checkbox (emoji-only) persists across rolls; forgetting to uncheck leaks hidden rolls. Fix: persistent "Secret rolls ON" armed indicator; confirm reveals on large/long-held secrets. ($impeccable clarify / colorize)
- **[P1] The header is a 13-target flat row with no hierarchy.** "Add map" as loud as the title; Find buried in collapsed details; write surface least promoted. Fix: three zones, demote Add map, give Find a shortcut. ($impeccable layout)
- **[P2] Silent affordance failures.** Offline dice click → nothing; no-match wiki → nothing; dead map → "[missing map]" with no repair path. Fix: toast on roll failure, offer "create this document", replace "[missing map]" with re-upload/remove. ($impeccable polish)
- **[P3] TypeSwitcher choice overload.** 7 pairings × 3 sizes, blind cycling, in ⋮. Fix: cut to 2-3 pairings with a direct picker or move to settings. ($impeccable distill)

## Persona Red Flags

- **Alex (power user):** slash menu has no arrow-key nav/filtering/hotkeys; only Ctrl+\ and Ctrl+. exist and are undocumented outside the empty-hint; no keyboard path between documents; a font in ⋮ costs up to 6 clicks.
- **Riley (stress tester):** reveal divergence (server error → UI lies), blind "Keep mine" overwrite with no diff, silent wiki dead-end, mode-dependent map placement (WYSIWYG inserts at caret, source appends at end — same button, different promise).
- **Sam (accessibility):** connection status conveyed by color/border alone (title tooltip only); connection/save/conflict changes not announced; drag-reorder and resize handles mouse-only; find input no aria-label; reveal 👁 relies on `title`. Contrast itself is solid.

## Minor Observations

- `.tabs` hardcodes `class:active={true}` on Notes.
- Find scrolls to the section, not the match; match never highlighted.
- Map uploads show no progress.
- The empty-hint is the only shortcut/wiki-syntax documentation and dies with the first character.
- `--font-ui` is a serif; dense button rows read slower than a sans UI face.
- 8px resize handles are hover-only.
- Title rename fails silently.

## Questions to Consider

1. If the rolls rail is "the table's edge," why does the table never tell the DM who's at it — show player presence and what players currently see?
2. The save machine is over-engineered for a solo writer and under-engineered for a live table — which is the product, and does the hierarchy admit it?
3. Should dice be rollable inline where the story is, rather than a separate form in another column?
