#!/bin/bash
cd artifacts/gravelkingpro-promo
PORT=8000 BASE_PATH=/gravelkingpro-promo/ EXPORT_PORT=5010 nix-shell -p chromium --run "node scripts/export-mp4.mjs public/videos/gravelkingpro_lyrics_generator_59s_16x9.mp4" > /tmp/export_16x9.log 2>&1 &
echo $! > /tmp/export_16x9.pid

PORT=8000 BASE_PATH=/gravelkingpro-promo/ EXPORT_PORT=5011 nix-shell -p chromium --run "node scripts/export-mp4.mjs public/videos/gravelkingpro_lyrics_generator_59s_9x16.mp4 vertical" > /tmp/export_9x16.log 2>&1 &
echo $! > /tmp/export_9x16.pid
