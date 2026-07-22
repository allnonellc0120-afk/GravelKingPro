# GravelKing Pro — Enterprise API Core
# Multi-stage build for a defensible, auditable production image.

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Stage: dependencies ─────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY lib/db/package.json ./lib/db/package.json
COPY lib/authorship/package.json ./lib/authorship/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Stage: build ────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=deps /app/lib/db/node_modules ./lib/db/node_modules
COPY --from=deps /app/lib/authorship/node_modules ./lib/authorship/node_modules
COPY . .
RUN pnpm --filter @workspace/db run build || true
RUN pnpm --filter @workspace/api-server run build

# ── Stage: production ───────────────────────────────────────────────────────
FROM base AS production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY --from=build /app/lib/db ./lib/db
COPY --from=build /app/lib/authorship ./lib/authorship
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Health check for orchestrators
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
