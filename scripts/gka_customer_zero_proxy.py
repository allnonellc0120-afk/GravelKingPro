"""Local OpenAI-compatible GKA proxy for Customer Zero verification.

The proxy keeps the existing Morris Law Kernel service untouched on port 8080.
It carves older chat context locally, forwards the optimized prompt to the
configured live Gemini provider, and returns OpenAI-compatible JSON plus GKA
telemetry headers.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import perf_counter
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import GKA_CORE, gemini_dispatch


def estimate_tokens(value: str) -> int:
    normalized = value.strip()
    return 0 if not normalized else math.ceil(len(normalized) / 4)


def content_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        )
    return json.dumps(content, separators=(",", ":"), ensure_ascii=False)


def normalize_message(message: object) -> dict[str, str]:
    if not isinstance(message, dict):
        raise ValueError("each message must be an object")
    role = message.get("role")
    if role not in {"system", "developer", "user", "assistant", "tool"}:
        raise ValueError("message role must be system, developer, user, assistant, or tool")
    return {"role": role, "content": content_text(message.get("content", ""))}


def carve_context(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """Preserve instructions and the active turn while carving stale history."""
    if len(messages) <= 2:
        return messages

    protected: list[dict[str, str]] = []
    seen_instruction_text: set[str] = set()
    for message in messages:
        if message["role"] not in {"system", "developer"}:
            continue
        normalized = " ".join(message["content"].split())
        if normalized and normalized not in seen_instruction_text:
            protected.append({"role": message["role"], "content": normalized})
            seen_instruction_text.add(normalized)

    # Starting on Turn 2, discard historical assistant turns and duplicate
    # user context. The active user turn is the only conversational slice
    # needed for this audit proxy; the full history remains in the baseline.
    active = next(
        (message for message in reversed(messages) if message["role"] not in {"system", "developer"}),
        None,
    )
    if active is None:
        return protected
    return protected + [{
        "role": active["role"],
        "content": " ".join(active["content"].split()),
    }]


def raw_prompt(messages: list[dict[str, str]]) -> str:
    return "\n".join(f"{message['role'].upper()}: {message['content']}" for message in messages)


def compact_prompt(messages: list[dict[str, str]]) -> str:
    return "\n".join(
        f"{message['role'].upper()}: {' '.join(message['content'].split())}"
        for message in messages
    )


def live_provider_dispatch(prompt: str) -> str:
    """Use the project's Vertex path when configured; retain legacy fallback."""
    if os.environ.get("GCP_SERVICE_ACCOUNT"):
        bridge = r"""
import fs from "node:fs";
import { generateVertexText } from "./src/geminiVertex.ts";
const input = JSON.parse(fs.readFileSync(0, "utf8"));
(async () => {
  const text = await generateVertexText(input.prompt, {
    maxOutputTokens: 512,
    temperature: 0.4,
    thinkingConfig: { thinkingBudget: 0 },
  });
  console.log(JSON.stringify({ text }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""
        result = subprocess.run(
            ["pnpm", "--dir", "artifacts/api-server", "exec", "tsx", "--eval", bridge],
            input=json.dumps({"prompt": prompt}),
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip()[-500:])
        try:
            response = json.loads(result.stdout.strip().splitlines()[-1])
        except (json.JSONDecodeError, IndexError) as error:
            raise RuntimeError("Vertex bridge returned invalid JSON") from error
        text = response.get("text")
        if not isinstance(text, str) or not text.strip():
            raise RuntimeError("Vertex returned no generated content")
        return text.strip()
    return gemini_dispatch(prompt, {"provided": False})


class CustomerZeroHandler(BaseHTTPRequestHandler):
    server_version = "GKA-CustomerZero/2.0"

    def send_json(self, status: int, payload: dict[str, object], headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self.send_json(200, {
                "status": "ok",
                "kernel": "Morris Law Kernel V2",
                "gka": GKA_CORE.verify_parity(),
            })
            return
        self.send_error(404, "Not Found")

    def do_POST(self) -> None:
        if self.path != "/v1/chat/completions":
            self.send_error(404, "Not Found")
            return

        started = perf_counter()
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 2_000_000:
                raise ValueError("JSON request body is required and must be under 2 MB")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict) or not isinstance(payload.get("messages"), list):
                raise ValueError("messages must be an array")

            messages = [normalize_message(message) for message in payload["messages"]]
            carved_messages = carve_context(messages)
            response_schema = payload.get("response_format")
            schema_context = (
                f"\nRESPONSE_FORMAT: {json.dumps(response_schema, separators=(',', ':'), ensure_ascii=False)}"
                if response_schema is not None
                else ""
            )
            raw_prompt_text = raw_prompt(messages)
            raw_context = raw_prompt_text + schema_context
            carved_prompt = compact_prompt(carved_messages) + schema_context
            baseline_tokens = estimate_tokens(raw_context)
            processed_tokens = estimate_tokens(carved_prompt)
            suppressed_tokens = max(0, baseline_tokens - processed_tokens)
            suppression_rate = (
                (suppressed_tokens / baseline_tokens) * 100
                if baseline_tokens else 0.0
            )
            overhead_ms = (perf_counter() - started) * 1000

            provider_prompt = (
                "You are the live Customer Zero response engine behind a GKA "
                "OpenAI-compatible proxy. Answer the active user request directly "
                "and concisely. Do not mention internal telemetry.\n\n"
                f"{carved_prompt}"
            )
            completion = live_provider_dispatch(provider_prompt)
            completion_tokens = estimate_tokens(completion)

            telemetry_headers = {
                "X-GKA-Baseline-Tokens": str(baseline_tokens),
                "X-GKA-Processed-Tokens": str(processed_tokens),
                "X-GKA-Tokens-Suppressed": str(suppressed_tokens),
                "X-GKA-Suppression-Rate": f"{suppression_rate:.2f}%",
                "X-GKA-Latency-Overhead-MS": f"{overhead_ms:.4f}",
            }
            self.send_json(200, {
                "id": f"chatcmpl-gka-{uuid4().hex[:16]}",
                "object": "chat.completion",
                "created": int(__import__("time").time()),
                "model": payload.get("model", "gka-gemini-live"),
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": completion},
                    "finish_reason": "stop",
                }],
                "usage": {
                    "prompt_tokens": processed_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": processed_tokens + completion_tokens,
                },
                "gka": {
                    "baseline_tokens": baseline_tokens,
                    "processed_tokens": processed_tokens,
                    "tokens_suppressed": suppressed_tokens,
                    "suppression_rate": round(suppression_rate, 2),
                    "latency_overhead_ms": round(overhead_ms, 4),
                    "parity": GKA_CORE.verify_parity(),
                },
            }, telemetry_headers)
        except ValueError as error:
            self.send_json(400, {"error": {"type": "invalid_request_error", "message": str(error)}})
        except Exception as error:
            print(f"[gka-customer-zero] provider failure: {error}", flush=True)
            self.send_json(502, {"error": {"type": "upstream_error", "message": "Live provider request failed."}})

    def log_message(self, format: str, *args: object) -> None:
        print(f"[gka-customer-zero] {format % args}", flush=True)


if __name__ == "__main__":
    port = int(os.environ.get("GKA_PROXY_PORT", "8090"))
    server = ThreadingHTTPServer(("127.0.0.1", port), CustomerZeroHandler)
    print(f"GKA Customer Zero proxy listening on http://127.0.0.1:{port}", flush=True)
    server.serve_forever()