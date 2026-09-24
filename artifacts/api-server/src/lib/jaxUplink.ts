import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const JAX_SAL_CODES = {
  exec: "2:EXEC",
  audit: "4:AUDIT",
  patch: "6:PATCH",
  verify: "8:VERIFY",
} as const;

export type JaxSalCode = typeof JAX_SAL_CODES[keyof typeof JAX_SAL_CODES];

const MAX_ENTRY_BYTES = 256;
const MAX_DETAIL_CHARS = 120;
const workspaceRoot = (() => {
  let current = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml")) || existsSync(path.join(current, ".git"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return process.cwd();
})();
const UPLINK_PATH = path.join(workspaceRoot, ".jax_uplink.json");

let writeChain = Promise.resolve();

function clip(value: unknown, maxChars: number): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text || "").replace(/\s+/g, " ").slice(0, maxChars);
}

function boundedEntry(code: JaxSalCode, event: string, detail: unknown): Record<string, string> {
  const entry = {
    sal: code,
    event: clip(event, 48),
    detail: clip(detail, MAX_DETAIL_CHARS),
    at: new Date().toISOString(),
  };
  let serialized = JSON.stringify(entry);
  while (Buffer.byteLength(serialized, "utf8") > MAX_ENTRY_BYTES && entry.detail.length > 0) {
    entry.detail = entry.detail.slice(0, Math.max(0, entry.detail.length - 8));
    serialized = JSON.stringify(entry);
  }
  while (Buffer.byteLength(serialized, "utf8") > MAX_ENTRY_BYTES && entry.event.length > 0) {
    entry.event = entry.event.slice(0, Math.max(0, entry.event.length - 8));
    serialized = JSON.stringify(entry);
  }
  if (Buffer.byteLength(serialized, "utf8") <= MAX_ENTRY_BYTES) return entry;
  return { sal: code, event: "uplink", detail: "", at: entry.at };
}

async function appendEntry(entry: Record<string, string>): Promise<void> {
  let entries: unknown[] = [];
  try {
    const raw = await readFile(UPLINK_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) entries = parsed;
  } catch {
    // A missing or interrupted ledger is repaired on the next append.
  }
  entries.push(entry);
  await writeFile(UPLINK_PATH, `${JSON.stringify(entries)}\n`, "utf8");
}

/**
 * Best-effort local telemetry. Logging must never take down a request or
 * expose credentials; the serialized entry itself is hard-bounded.
 */
export function appendJaxUplink(code: JaxSalCode, event: string, detail?: unknown): Promise<void> {
  const entry = boundedEntry(code, event, detail);
  const next = writeChain.then(() => appendEntry(entry)).catch(() => undefined);
  writeChain = next;
  return next;
}

export function jaxUplinkPath(): string {
  return UPLINK_PATH;
}