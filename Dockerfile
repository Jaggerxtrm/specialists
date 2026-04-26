FROM oven/bun:1.3.5 AS builder
WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json vitest.config.ts ./
COPY src ./src
COPY .gitignore ./.gitignore

RUN bun install --frozen-lockfile
RUN bun run build

FROM node:lts-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOME=/home/specialists

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates sqlite3 npm \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --uid 1000 --create-home --home-dir /home/specialists --shell /usr/sbin/nologin specialists \
  && npm install -g @mariozechner/pi-coding-agent

COPY --from=builder /app/dist ./dist

RUN printf '#!/bin/sh\nexec node /app/dist/index.js "$@"\n' > /usr/local/bin/sp \
  && chmod +x /usr/local/bin/sp \
  && ln -s /usr/local/bin/sp /usr/local/bin/specialists

LABEL org.specialists.uid="1000"

USER specialists:specialists
ENTRYPOINT ["sp", "serve"]
CMD ["--port", "8000"]
