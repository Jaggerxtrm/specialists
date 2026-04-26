FROM docker.io/oven/bun:1.3.5 AS builder
WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json vitest.config.ts ./
COPY src ./src
COPY .gitignore ./.gitignore

RUN bun install --frozen-lockfile
RUN bun run build

FROM docker.io/oven/bun:1.3.5-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOME=/home/specialists

# Runtime working directory is /work — the consumer's project root mount.
# /app holds the dist/ bundle; /work holds .specialists/ (specs + observability.db).
# Overridable via compose `working_dir:` if a consumer wants a different layout.

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates sqlite3 npm \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --uid 10001 --create-home --home-dir /home/specialists --shell /usr/sbin/nologin specialists \
  && npm install -g @mariozechner/pi-coding-agent@0.64.0

COPY --from=builder /app/dist ./dist

RUN printf '#!/bin/sh\nexec bun /app/dist/index.js "$@"\n' > /usr/local/bin/sp \
  && chmod +x /usr/local/bin/sp \
  && ln -s /usr/local/bin/sp /usr/local/bin/specialists

LABEL org.specialists.uid="10001"

USER specialists:specialists
WORKDIR /work
ENTRYPOINT ["sp", "serve"]
CMD ["--port", "8000"]
