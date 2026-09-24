import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { isAdminAuthenticated } from "../lib/adminAuth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const PUBLIC_IMAGE_PLACEHOLDER_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img" aria-labelledby="title desc">',
  '<title id="title">GravelKing Pro artwork unavailable</title>',
  '<desc id="desc">Artwork is temporarily unavailable.</desc>',
  '<rect width="800" height="800" fill="#111827"/>',
  '<path d="M0 560 190 410l120 92 148-176L800 570V800H0Z" fill="#1f2937"/>',
  '<circle cx="590" cy="220" r="90" fill="#f59e0b" opacity=".9"/>',
  '<path d="M328 292h144v216H328zM272 350h256v100H272z" fill="#f59e0b"/>',
  '<text x="400" y="650" fill="#f9fafb" font-family="Arial,sans-serif" font-size="34" text-anchor="middle">GRAVELKING PRO</text>',
  '</svg>',
].join("");

function isImageAssetPath(filePath: string): boolean {
  return /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(filePath);
}

function sendPublicImagePlaceholder(res: Response): void {
  res
    .status(200)
    .setHeader("Cache-Control", "public, max-age=300")
    .setHeader("Content-Type", "image/svg+xml; charset=utf-8")
    .setHeader("X-GK-Storage-Fallback", "placeholder")
    .send(PUBLIC_IMAGE_PLACEHOLDER_SVG);
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for direct file upload.
 * Restricted to admin-authenticated requests to prevent anonymous storage abuse.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  if (!isAdminAuthenticated(req)) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const body = req.body as { name?: unknown; size?: unknown; contentType?: unknown };
  const { name, size, contentType } = body;
  if (
    typeof name !== "string" || !name ||
    typeof size !== "number" || size <= 0 ||
    typeof contentType !== "string" || !contentType
  ) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets (cover art, preview clips) from PUBLIC_OBJECT_SEARCH_PATHS.
 *
 * Explicitly blocks any path that begins with "private/" or contains path-traversal
 * sequences, so full paid audio stored under private/ can never be reached here
 * regardless of how PUBLIC_OBJECT_SEARCH_PATHS is configured.
 * Full audio is delivered only through the gated /api/tracks/:id/download endpoint.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  const raw = req.params.filePath;
  const filePath = Array.isArray(raw) ? raw.join("/") : raw;

  try {
    // Deny private/ prefix and path-traversal — defence-in-depth so this route
    // can never serve paid audio even if bucket search paths are configured broadly.
    if (filePath.startsWith("private/") || filePath.includes("..")) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      if (isImageAssetPath(filePath)) {
        req.log.warn({ filePath }, "Public image missing; serving placeholder");
        sendPublicImagePlaceholder(res);
        return;
      }
      res.status(404).json({ error: "File not found" });
      return;
    }

    if (isImageAssetPath(filePath)) {
      // Keep the storage incident visible in logs while preventing a broken
      // image from cascading into a broken release/library layout. Audio and
      // other non-image assets continue to fail explicitly.
      req.log.error({ err: error, filePath }, "Public image unavailable; serving placeholder");
      sendPublicImagePlaceholder(res);
      return;
    }

    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

export default router;
