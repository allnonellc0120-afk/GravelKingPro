/**
 * Cross-platform file download helpers.
 *
 * The `download` attribute on an anchor tells the browser to SAVE the file
 * instead of navigating to it. This is what stops iOS Safari from handing a
 * blob/object URL off to a third-party app — the old `window.open(url)` path
 * is exactly what triggered that external-app handoff (e.g. files opening in
 * Tully). With the download attribute, modern iOS Safari/Chrome routes to the
 * Files "Save to…" sheet, and desktop browsers save directly.
 *
 * These must be called from within a user gesture (e.g. a click handler).
 */

/** Save an existing (object or http) URL to the device. Does NOT revoke `url`. */
export function downloadUrl(url: string, name: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Save an in-memory Blob to the device: wraps it in an object URL, triggers the
 * save, then revokes the URL after the download has been handed off.
 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
