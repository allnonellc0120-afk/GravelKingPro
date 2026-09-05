/**
 * GravelKing Protocol — lrclib.net integration
 * All N One LLC
 *
 * Fetches synced (LRC) and plain lyrics from lrclib.net public API.
 * No auth required. Rate-limit: be reasonable.
 */

export interface LrclibTrack {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface LrcLine {
  timeMs: number;
  text: string;
}

const BASE = "https://lrclib.net/api";

/** Search tracks by query string */
export async function searchLyrics(query: string): Promise<LrclibTrack[]> {
  const url = `${BASE}/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Lrclib-Client": "GravelKingPro/1.0 (gravelkingpro.com)" } });
  if (!res.ok) throw new Error(`lrclib search failed: ${res.status}`);
  return res.json();
}

/** Get a specific track by artist + title */
export async function getLyrics(artist: string, title: string): Promise<LrclibTrack | null> {
  const url = `${BASE}/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { "Lrclib-Client": "GravelKingPro/1.0 (gravelkingpro.com)" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`lrclib get failed: ${res.status}`);
  return res.json();
}

/**
 * Parse LRC format into timestamped lines.
 * LRC format: [mm:ss.xx] lyric text
 */
export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const raw of lrc.split("\n")) {
    const m = raw.match(/^\[(\d+):(\d+)\.(\d+)\]\s*(.*)/);
    if (!m) continue;
    const mins = parseInt(m[1]);
    const secs = parseInt(m[2]);
    const cents = parseInt(m[3].padEnd(2, "0").slice(0, 2));
    const timeMs = mins * 60_000 + secs * 1_000 + cents * 10;
    lines.push({ timeMs, text: m[4].trim() });
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
