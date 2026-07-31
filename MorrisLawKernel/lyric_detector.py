"""
GravelKing Lyric Detector — Pre-Flight Copyright Scanner (LOCAL, advisory)

Three components:
  1. Pre-Flight Copyright Scanner — screen lyrics BEFORE stamping/release
     against the local vault of protected-lyric fingerprints.
  2. 3-Line N-Gram Hash Matcher   — sliding 3-line windows over canonicalized
     lines, one SHA-256 per window. Robust to casing/punctuation/spacing edits,
     and reports WHERE overlap sits (original line numbers of the scanned text).
  3. Local Vault + Sync           — fingerprints live in lyric_vault.json as
     hashes only (never raw lyrics). Optionally merges extra fingerprints from
     a GravelKing endpoint when GRAVELKING_VAULT_URL is set; sync failures are
     loud (VaultSyncError), never silent.

Honesty model (same philosophy as verification_api.py's split-key client):
  - This is ADVISORY screening, not legal clearance. A clean scan only means
    "no overlap with what this vault knows" — it can never prove originality.
  - Authoritative certification stays server-side.
  - Whole-text hashes use the EXACT normalization of the GravelKing IP Vault
    lyric stamp (CRLF→LF, strip trailing spaces/tabs per line, trim) so they
    line up 1:1 with server-issued `contentHash` values.

CLI:
  python lyric_detector.py add  song.txt --title "Song" --artist "Artist"
  python lyric_detector.py scan song.txt
  python lyric_detector.py sync
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

WINDOW_SIZE = 3  # lines per n-gram window — the "3-line rule of thumb"
DEFAULT_VAULT_PATH = Path(__file__).resolve().parent / "lyric_vault.json"

ADVISORY = (
    "ADVISORY ONLY: this pre-flight scan checks overlap against the local "
    "vault's fingerprints. A clean result means no overlap with what this "
    "vault knows — it is NOT proof of originality and NOT legal clearance. "
    "Authoritative IP certification remains server-side on GravelKing."
)


class VaultSyncError(RuntimeError):
    """Raised when a configured remote vault sync cannot complete. Sync
    failures are surfaced loudly — never silently treated as 'synced'."""


# ── Normalization ─────────────────────────────────────────────────────────────

# JS String.prototype.trim() character set: WhiteSpace (TAB VT FF SP NBSP
# ZWNBSP/BOM + Unicode Zs) + LineTerminator (LF CR LS PS). Python's bare
# str.strip() diverges (keeps U+FEFF, strips \x1c-\x1f and \x85), so the
# server's trim semantics are replicated explicitly.
_JS_TRIM_CHARS = (
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006"
    "\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)
# JS /[ \t]+$/gm — with /m, `$` sits before any LineTerminator (LF CR LS PS)
# and at end of string. Python re.MULTILINE anchors only at \n, so a lookahead
# reproduces the exact server behavior instead.
_TRAILING_WS = re.compile(r"[ \t]+(?=[\n\r\u2028\u2029]|$)")


def normalize_for_stamp(text: str) -> str:
    """EXACT mirror of the GravelKing server's lyric-stamp normalization:
    `text.replace(/\\r\\n/g,"\\n").replace(/[ \\t]+$/gm,"").trim()` — byte-for-
    byte, including BOM handling and JS multiline-anchor semantics. sha256 of
    this equals the server's stored contentHash for identical text."""
    body = _TRAILING_WS.sub("", (text or "").replace("\r\n", "\n"))
    return body.strip(_JS_TRIM_CHARS)


def stamp_content_hash(text: str) -> str:
    return hashlib.sha256(normalize_for_stamp(text).encode("utf-8")).hexdigest()


def canonicalize_line(line: str) -> str:
    """Matching canonicalization (deliberately looser than the stamp form):
    lowercase, drop punctuation except in-word apostrophes, collapse spaces.
    Makes the matcher robust to formatting edits without changing words."""
    lowered = line.lower().replace("\u2019", "'")
    stripped = re.sub(r"[^\w\s']", " ", lowered)
    return re.sub(r"\s+", " ", stripped).strip()


# ── 3-line n-gram hash matcher ────────────────────────────────────────────────

def window_hashes(text: str, window: int = WINDOW_SIZE) -> list[dict[str, Any]]:
    """Slide a `window`-line frame over the canonicalized, non-empty lines.
    Returns [{start, end, hash}] where start/end are 1-based line numbers in
    the ORIGINAL text, so matches point at real lines in the user's file."""
    lines = (text or "").replace("\r\n", "\n").split("\n")
    lyric_lines = [
        (idx + 1, canon)
        for idx, raw in enumerate(lines)
        if (canon := canonicalize_line(raw))
    ]
    out: list[dict[str, Any]] = []
    for i in range(len(lyric_lines) - window + 1):
        frame = lyric_lines[i : i + window]
        digest = hashlib.sha256("\n".join(c for _, c in frame).encode("utf-8")).hexdigest()
        out.append({"start": frame[0][0], "end": frame[-1][0], "hash": digest})
    return out


def _merge_ranges(ranges: list[tuple[int, int]]) -> list[list[int]]:
    """Merge overlapping/adjacent [start, end] line ranges for readability."""
    merged: list[list[int]] = []
    for start, end in sorted(ranges):
        if merged and start <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged


# ── Local vault ───────────────────────────────────────────────────────────────

def _vault_path(vault_path: str | Path | None = None) -> Path:
    return Path(vault_path or os.environ.get("GRAVELKING_VAULT_PATH") or DEFAULT_VAULT_PATH)


def load_vault(vault_path: str | Path | None = None) -> dict[str, Any]:
    path = _vault_path(vault_path)
    if not path.exists():
        return {"version": 1, "updated_at": None, "entries": []}
    vault = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(vault, dict) or not isinstance(vault.get("entries"), list):
        raise ValueError(f"Vault file {path} is malformed — refusing to guess.")
    return vault


def _save_vault(vault: dict[str, Any], vault_path: str | Path | None = None) -> Path:
    path = _vault_path(vault_path)
    vault["updated_at"] = datetime.now(timezone.utc).isoformat()
    path.write_text(json.dumps(vault, indent=2) + "\n", encoding="utf-8")
    return path


def add_to_vault(
    title: str,
    artist: str,
    lyrics: str,
    vault_path: str | Path | None = None,
) -> dict[str, Any]:
    """Fingerprint lyrics into the local vault. Stores HASHES ONLY — the raw
    lyrics never touch disk here, so the vault file is safe to share/commit."""
    content_hash = stamp_content_hash(lyrics)
    windows = window_hashes(lyrics)
    vault = load_vault(vault_path)
    existing = next((e for e in vault["entries"] if e.get("content_hash") == content_hash), None)
    if existing:
        return existing  # identical text already fingerprinted — no duplicate
    entry = {
        "id": str(uuid.uuid4()),
        "title": title,
        "artist": artist,
        "source": "local",
        "added_at": datetime.now(timezone.utc).isoformat(),
        "hash_algorithm": "sha256",
        "content_hash": content_hash,
        "window_size": WINDOW_SIZE,
        "window_hashes": [w["hash"] for w in windows],
    }
    vault["entries"].append(entry)
    _save_vault(vault, vault_path)
    return entry


def sync_vault(vault_path: str | Path | None = None) -> dict[str, Any]:
    """Merge remote fingerprints when GRAVELKING_VAULT_URL is configured.

    Contract: HTTP 200 JSON {"entries": [{"content_hash", "window_hashes",
    "title"?, "artist"?}, ...]}. Anything else raises VaultSyncError — a failed
    sync is reported as failed, never passed off as up-to-date.
    Without the env var this stays an explicit local-only vault (the
    GravelKing server does not expose users' lyric fingerprints publicly)."""
    url = os.environ.get("GRAVELKING_VAULT_URL")
    if not url:
        return {"synced": False, "mode": "local-only",
                "note": "GRAVELKING_VAULT_URL not set — vault contains local entries only."}
    try:
        resp = requests.get(url, timeout=30)
    except requests.RequestException as exc:
        raise VaultSyncError(f"Vault sync failed — server unreachable: {exc}") from exc
    if resp.status_code != 200:
        raise VaultSyncError(f"Vault sync failed — HTTP {resp.status_code} from {url}.")
    try:
        payload = resp.json()
    except ValueError as exc:
        raise VaultSyncError("Vault sync failed — non-JSON response.") from exc
    entries = payload.get("entries") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        raise VaultSyncError("Vault sync failed — response missing 'entries' list.")

    vault = load_vault(vault_path)
    known = {e.get("content_hash") for e in vault["entries"]}
    added = 0
    for remote in entries:
        if not isinstance(remote, dict):
            continue
        chash, whashes = remote.get("content_hash"), remote.get("window_hashes")
        if not isinstance(chash, str) or not isinstance(whashes, list) or chash in known:
            continue
        vault["entries"].append({
            "id": str(uuid.uuid4()),
            "title": remote.get("title") or "(remote)",
            "artist": remote.get("artist") or "(remote)",
            "source": "remote",
            "added_at": datetime.now(timezone.utc).isoformat(),
            "hash_algorithm": "sha256",
            "content_hash": chash,
            "window_size": WINDOW_SIZE,
            "window_hashes": [h for h in whashes if isinstance(h, str)],
        })
        known.add(chash)
        added += 1
    _save_vault(vault, vault_path)
    return {"synced": True, "mode": "remote+local", "remote_entries": len(entries),
            "added": added, "total_entries": len(vault["entries"])}


# ── Pre-flight copyright scanner ──────────────────────────────────────────────

def preflight_scan(lyrics: str, vault_path: str | Path | None = None) -> dict[str, Any]:
    """Scan lyrics against the vault. Returns an honest report:
    exact whole-text matches, per-entry 3-line window overlap with merged line
    ranges (line numbers in the scanned text), and an explicit advisory.

    Overlap uses MULTISET semantics: a window hash repeated N times in the
    vault entry and M times in the scanned text counts min(N, M) — repeated
    choruses can never inflate `windows_matched` or the overlap percentage."""
    windows = window_hashes(lyrics)
    scanned: dict[str, list[tuple[int, int]]] = {}
    for w in windows:
        scanned.setdefault(w["hash"], []).append((w["start"], w["end"]))

    vault = load_vault(vault_path)
    entries = vault["entries"]
    content_hash = stamp_content_hash(lyrics)

    exact_matches, window_matches = [], []
    for entry in entries:
        meta = {k: entry.get(k) for k in ("id", "title", "artist", "source")}
        if entry.get("content_hash") == content_hash:
            exact_matches.append(meta)
        entry_windows = entry.get("window_hashes") or []
        entry_counts = Counter(h for h in entry_windows if isinstance(h, str))
        matched = {h: min(n, len(scanned[h])) for h, n in entry_counts.items() if h in scanned}
        windows_matched = sum(matched.values())
        if windows_matched:
            ranges = [r for h in matched for r in scanned[h]]
            window_matches.append({
                **meta,
                "windows_matched": windows_matched,
                "entry_windows": len(entry_windows),
                "entry_overlap_pct": round(100 * windows_matched / max(1, len(entry_windows)), 1),
                "line_ranges": _merge_ranges(ranges),
            })

    notes = []
    if not entries:
        notes.append("VAULT EMPTY — nothing to screen against; no conclusion possible.")
    if not windows:
        notes.append(f"Text has fewer than {WINDOW_SIZE} lyric lines — no windows to match.")

    return {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "stamp_content_hash": content_hash,
        "windows_scanned": len(windows),
        "vault_entries_checked": len(entries),
        "matches_found": bool(exact_matches or window_matches),
        "exact_matches": exact_matches,
        "window_matches": sorted(window_matches, key=lambda m: -m["windows_matched"]),
        "notes": notes,
        "advisory": ADVISORY,
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

def _read_text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GravelKing pre-flight lyric copyright scanner")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_add = sub.add_parser("add", help="fingerprint a lyric file into the local vault (hashes only)")
    p_add.add_argument("file")
    p_add.add_argument("--title", required=True)
    p_add.add_argument("--artist", required=True)

    p_scan = sub.add_parser("scan", help="pre-flight scan a lyric file against the vault")
    p_scan.add_argument("file")

    sub.add_parser("sync", help="merge remote fingerprints (GRAVELKING_VAULT_URL) into the vault")

    args = parser.parse_args(argv)
    if args.cmd == "add":
        result: Any = add_to_vault(args.title, args.artist, _read_text(args.file))
    elif args.cmd == "scan":
        result = preflight_scan(_read_text(args.file))
    else:
        result = sync_vault()
    print(json.dumps(result, indent=2))
    if args.cmd == "scan" and result["matches_found"]:
        return 2  # let CI/pre-flight pipelines fail loudly on overlap
    return 0


if __name__ == "__main__":
    sys.exit(main())
