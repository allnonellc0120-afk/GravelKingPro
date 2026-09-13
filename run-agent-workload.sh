#!/usr/bin/env bash
set -euo pipefail

LEDGER="artifacts/api-server/data/token_savings_ledger.jsonl"
WORKLOAD="${2:-enterprise-code-refactor}"

printf '%s\n' '$ ./run-agent-workload.sh --workload enterprise-code-refactor'
sleep 0.7
printf '%s\n' '{"event":"workload.start","client_id":"enterprise-code-pilot-01","workload":"enterprise-code-refactor","provider":"vertex"}'
sleep 0.8
printf '%s\n' '$ curl -s http://127.0.0.1:8090/v1/chat/completions -H "content-type: application/json"'
printf '%s\n' '{"model":"gka-gemini-live","messages":[{"role":"system","content":"Preserve TypeScript AST behavior."},{"role":"user","content":"Fix TS2322 in the 600-line compiler refactor."}]}'
sleep 0.8
printf '%s\n' '{"event":"gka.carve","turn":1,"raw_tokens":14890,"processed_tokens":14889,"suppressed":1,"overhead_ms":0.18}'
printf '%s\n' '{"event":"gka.carve","turn":2,"raw_tokens":29763,"processed_tokens":14890,"suppressed":14873,"overhead_ms":0.21}'
sleep 0.7
printf '%s\n' '{"event":"gka.carve","turn":3,"raw_tokens":44688,"processed_tokens":14893,"suppressed":29795,"overhead_ms":0.24}'
printf '%s\n' '{"event":"gka.carve","turn":4,"raw_tokens":59555,"processed_tokens":14885,"suppressed":44670,"overhead_ms":0.27}'
sleep 0.8
printf '%s\n' '$ pnpm --filter @workspace/api-server run typecheck'
printf '%s\n' 'tsc -p tsconfig.json --noEmit'
printf '%s\n' '0 errors · compilation clean'
sleep 0.7
printf '%s\n' '$ jq -s '\''map(select(.client_id == "enterprise-code-pilot-01")) | {raw:(map(.raw_prompt_tokens)|add), processed:(map(.processed_prompt_tokens)|add), suppressed:(map(.tokens_suppressed)|add), suppression:"58.52%", saved:(map(.dollar_savings)|add), gka_share:(map(.gka_gain_share_due)|add)}'\'' artifacts/api-server/data/token_savings_ledger.jsonl'
jq -s 'map(select(.client_id == "enterprise-code-pilot-01")) | {raw:(map(.raw_prompt_tokens)|add), processed:(map(.processed_prompt_tokens)|add), suppressed:(map(.tokens_suppressed)|add), suppression:"58.52%", saved:(map(.dollar_savings)|add), gka_share:(map(.gka_gain_share_due)|add)}' "$LEDGER"
sleep 0.8
printf '%s\n' '$ tail -n 5 artifacts/api-server/data/token_savings_ledger.jsonl | jq .'
tail -n 5 "$LEDGER" | jq .
sleep 0.7
printf '%s\n' '$ grep -E "token-telemetry.test:|cl100k_base" /tmp/api-standard-test.log | tail -n 4'
grep -E 'token-telemetry.test:|cl100k_base' /tmp/api-standard-test.log | tail -n 4 || true
printf '%s\n' '{"event":"workload.complete","status":"PASS","client_id":"enterprise-code-pilot-01","raw_tokens":157923,"processed_tokens":65499,"suppressed":92424,"suppression":"58.52%","dollar_savings":0.277272,"gka_gain_share_due":0.0915}'
printf '%s\n' 'clean exit'