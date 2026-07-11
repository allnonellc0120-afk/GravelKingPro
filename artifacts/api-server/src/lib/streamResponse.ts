import { Readable } from "stream";
import type { Response } from "express";

/**
 * Send a Buffer to the client using chunked transfer-encoding (no Content-Length).
 *
 * Cloud Run's frontend (Google Frontend) rejects any buffered response whose
 * Content-Length header exceeds 32 MiB with an immediate `500` (empty body,
 * `server: Google Frontend`). In the browser this surfaces as a generic
 * "Processing failed" even though the app never errored. Full-length uncompressed
 * WAV output routinely exceeds 32 MiB (~10.6 MB per stereo minute at 44.1 kHz /
 * 16-bit — a 3+ minute master is ~34 MB), so `res.send(buffer)` silently fails for
 * longer songs while short/sample outputs (< 32 MiB) work fine.
 *
 * Streaming the same bytes with chunked transfer-encoding carries no such size
 * limit on Cloud Run. Callers must set Content-Type / Content-Disposition and any
 * custom headers BEFORE calling this, and must NOT set Content-Length.
 */
export function streamBuffer(res: Response, buf: Buffer): void {
  // A lingering Content-Length would re-introduce the 32 MiB cap — drop it.
  res.removeHeader("Content-Length");
  Readable.from(buf)
    .on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Download stream failed" });
      } else {
        res.destroy(err);
      }
    })
    .pipe(res);
}
