# D&D Campaign Notes

A realtime, remote-co-op campaign manager for Dungeon Masters and players. Built
with SvelteKit (runes), Bun, `bun:sqlite`, CodeMirror, and SSE.

## Features

- **Markdown campaign notes** with a live CodeMirror editor, outline sidebar,
  wiki-links (`[[Name]]`), collapsible headings, and stable heading ids.
- **Share sections with players** per heading (with ancestor inheritance) —
  players only ever see the sections you share.
- **Fog-of-war maps** with rectangular and freehand-brush reveal/erase, grid +
  snapping, DM-placed tokens, and multiple reveal layers.
- **Initiative tracker**, broadcast live to everyone.
- **Dice roller** with keep/drop modifiers (`2d20kh1`, `4d6dl1`), named rolls,
  crit/fumble detection, and inline rolls detected in note text.
- **Realtime** over SSE with snapshot-on-connect so reconnects self-heal.
- **Export / restore** campaign bundles (content + maps + reveals + rolls).
- **DM auth**: a single `DM_PASSCODE` gates DM-only actions.

## Development

```sh
bun install
bun run dev          # http://localhost:5174
bun run check        # type-check (svelte-check)
bun run test:unit    # bun unit tests for dice.ts and markdown.ts
bun run test:e2e     # Playwright e2e (auth + core flow, isolated test DB)
```

## Configuration (env vars)

| Var             | Default            | Purpose                                    |
| --------------- | ------------------ | ------------------------------------------ |
| `DM_PASSCODE`   | *(unset)*          | If set, protects DM actions. Unset = open. |
| `DB_PATH`       | `data/app.db`      | SQLite database file.                      |
| `UPLOAD_DIR`    | `static/uploads`   | Where map images are stored/served.        |
| `PORT`          | `3000`             | HTTP port for the built server.            |

> **Security:** without `DM_PASSCODE` the app is fully open (anyone with the URL
> can edit/upload). Set a strong passcode before exposing it beyond a trusted
> network. Set it at deploy time, not in the repo.

## Deployment

Single always-on instance (Fly.io / Railway / VPS). The app uses a persistent
disk for SQLite and uploads, so a long-running container is the right fit — not
ephemeral serverless.

```sh
# Fly.io example (edit fly.toml app name first)
fly launch
fly secrets set DM_PASSCODE='your-passcode'
fly volumes create dnd_data --size 1
fly volumes create dnd_uploads --size 1
fly deploy
```

`Dockerfile` builds the adapter-bun output. `fly.toml` mounts volumes at
`/data` (DB) and `/uploads` (map images).
