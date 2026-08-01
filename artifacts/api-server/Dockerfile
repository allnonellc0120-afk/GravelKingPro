FROM node:20-slim AS base
RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip python3-numpy python3-scipy && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

WORKDIR /app

# Workspace manifests
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Shared libs the API server depends on
COPY lib/api-zod ./lib/api-zod
COPY lib/authorship ./lib/authorship
COPY lib/db ./lib/db
COPY lib/api-spec ./lib/api-spec

# API server
COPY artifacts/api-server/package.json ./artifacts/api-server/

RUN pnpm install --frozen-lockfile

COPY artifacts/api-server/ ./artifacts/api-server/

RUN cd artifacts/api-server && pnpm run build

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip python3-numpy python3-scipy && rm -rf /var/lib/apt/lists/*
# Numba accelerates the kernel's envelope follower 10-50x; the kernel falls
# back to pure Python gracefully if this install ever fails.
RUN pip3 install --no-cache-dir --break-system-packages numba || true

WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/lib ./lib
COPY --from=base /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=base /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=base /app/artifacts/api-server/python ./artifacts/api-server/python

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "--max-old-space-size=2048", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
