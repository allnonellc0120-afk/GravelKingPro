#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Sync MorrisLawKernel/ to the private GitHub repo (allnonellc0120-afk/MorrisLawKernel)
# via the Replit GitHub connector. One retry for transient GitHub API blips.
if ! node scripts/push-mlk-repo.mjs; then
  echo "MLK GitHub sync failed — retrying in 10s..."
  sleep 10
  node scripts/push-mlk-repo.mjs
fi
