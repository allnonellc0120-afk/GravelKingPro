import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { isAdminAuthenticated } from "../lib/adminAuth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

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
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;

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
      res.status(404).json({ error: "File not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

export default router;
