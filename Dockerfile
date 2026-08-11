# Multi-stage build for svelte-adapter-bun (Fly.io / Railway / VPS)
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1
WORKDIR /app
COPY --from=build /app/build ./build
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile
ENV NODE_ENV=production
# mount volumes at /data (SQLite) and /uploads (map images)
RUN mkdir -p /data /uploads
EXPOSE 3000
CMD ["bun", "./build/index.js"]
