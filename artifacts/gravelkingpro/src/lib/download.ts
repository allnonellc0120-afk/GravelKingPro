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
  const nativeBridge = (window as Window & {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }).ReactNativeWebView;
  if (nativeBridge) {
    // The mobile shell cannot save a browser blob/object URL. Send the bytes
    // through the WebView bridge so the native app can open its Files/Share
    // sheet instead of navigating to a black download screen.
    void fetch(url, { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error(`Download failed (${response.status})`);
        return response.blob();
      })
      .then((blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          const comma = result.indexOf(",");
          if (comma < 0) reject(new Error("Could not read mastered audio"));
          else resolve(result.slice(comma + 1));
        };
        reader.onerror = () => reject(reader.error ?? new Error("Could not read mastered audio"));
        reader.readAsDataURL(blob);
      }))
      .then((base64) => nativeBridge.postMessage(JSON.stringify({
        type: "GK_DOWNLOAD",
        name,
        mimeType: blobMimeType(name),
        base64,
      })))
      .catch(() => {
        // Keep the browser fallback available if the native bridge fails.
        triggerBrowserDownload(url, name);
      });
    return;
  }
  triggerBrowserDownload(url, name);
}

function blobMimeType(name: string): string {
  return name.toLowerCase().endsWith(".wav") ? "audio/wav" : "application/octet-stream";
}

function triggerBrowserDownload(url: string, name: string): void {
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
