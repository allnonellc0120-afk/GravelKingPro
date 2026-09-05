import { Storage, File } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { readFile as fsReadFile } from "fs/promises";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

// ── Fallback storage (owner's GCP project) ──────────────────────────────────
// Replit's managed bucket has a broken platform-side IAM grant (the sidecar
// service account gets 403 storage.objects.create in BOTH dev and prod).
// Until Replit repairs it, writes that fail on the primary bucket land in a
// bucket in the owner's own GCP project (same service account that runs
// Lyria/Vertex), and reads check the primary first, then the fallback.
// This is a loud, logged fallback — never a silent mock.

interface GcpSaCredentials {
  project_id: string;
  client_email: string;
  private_key: string;
}

let fallbackCache: { client: Storage; bucketName: string } | null | undefined;

export function getFallbackStorage(): { client: Storage; bucketName: string } | null {
  if (fallbackCache !== undefined) return fallbackCache;
  try {
    const raw = process.env.GCP_SERVICE_ACCOUNT;
    if (!raw) {
      fallbackCache = null;
      return null;
    }
    const creds = JSON.parse(raw) as GcpSaCredentials;
    if (!creds.project_id || !creds.client_email || !creds.private_key) {
      fallbackCache = null;
      return null;
    }
    fallbackCache = {
      client: new Storage({ credentials: creds, projectId: creds.project_id }),
      bucketName: `gkp-vault-${creds.project_id}`,
    };
  } catch {
    fallbackCache = null;
  }
  return fallbackCache;
}

/**
 * Save an object to the primary (Replit-managed) bucket; if that write fails
 * (e.g. the platform-side 403 IAM breakage), save the SAME objectName into the
 * owner-project fallback bucket instead. Throws loudly if both fail.
 * Returns which backend the bytes landed in.
 */
/**
 * Cached (5 min) probe of whether the primary bucket currently accepts
 * writes. Used to decide which backend presigned browser PUT URLs should
 * target — a sidecar-signed URL for a bucket that 403s every write would
 * fail only at upload time, where the server can no longer intervene.
 */
let primaryWriteHealth: { ok: boolean; at: number } | null = null;
export async function primaryWriteHealthy(): Promise<boolean> {
  if (primaryWriteHealth && Date.now() - primaryWriteHealth.at < 5 * 60_000) {
    return primaryWriteHealth.ok;
  }
  try {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
    const probePath = `${dir.replace(/\/+$/, "")}/.write-health-probe`;
    const { bucketName, objectName } = parseObjectPath(probePath);
    await objectStorageClient
      .bucket(bucketName)
      .file(objectName)
      .save(Buffer.from("ok"), { contentType: "text/plain" });
    primaryWriteHealth = { ok: true, at: Date.now() };
  } catch (err) {
    console.warn(
      `[objectStorage] primary bucket write-health probe FAILED (${String((err as Error)?.message ?? err).slice(0, 160)}) — presigned uploads will target the fallback bucket for the next 5 minutes`,
    );
    primaryWriteHealth = { ok: false, at: Date.now() };
  }
  return primaryWriteHealth.ok;
}

/**
 * Every private full-length audio naming family currently used by production
 * and seed code. Keep the extension open-ended: the upload route preserves
 * the sanitized source extension, while the older release/demo seed paths
 * are WAV today.
 */
const PRIVATE_FULL_AUDIO_KEY_PATTERNS = [
  /^private\/tracks\/[^/]+\/audio_full\.[^/]+$/i,
  /^private\/(?:releases|demo)\/[^/]+\/[^/]+-full\.[^/]+$/i,
];

/**
 * Generated full-length audio is always stored under the private tracks
 * namespace. Keep this check at the public writer boundary so a future route
 * cannot accidentally make a full take reachable through public storage.
 */
export function isPrivateFullAudioKey(key: string): boolean {
  return PRIVATE_FULL_AUDIO_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export async function saveObjectWithFallback(
  bucketName: string,
  objectName: string,
  buffer: Buffer,
  options: { contentType: string; metadata?: Record<string, unknown> },
): Promise<"primary" | "fallback"> {
  const saveOpts = {
    contentType: options.contentType,
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
  try {
    await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, saveOpts);
    return "primary";
  } catch (primaryErr) {
    const fallback = getFallbackStorage();
    if (!fallback) throw primaryErr;
    console.warn(
      `[objectStorage] primary bucket write failed (${String((primaryErr as Error)?.message ?? primaryErr).slice(0, 160)}) — using fallback bucket ${fallback.bucketName} for ${objectName}`,
    );
    await fallback.client.bucket(fallback.bucketName).file(objectName).save(buffer, saveOpts);
    return "fallback";
  }
}

/**
 * Resolve an object for reading: primary bucket first, then the fallback
 * bucket (same objectName). Returns null if it exists in neither.
 */
export async function getObjectFileWithFallback(
  bucketName: string,
  objectName: string,
): Promise<File | null> {
  let backendError: unknown = null;
  try {
    const primary = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await primary.exists();
    if (exists) return primary;
  } catch (err) {
    backendError = err;
  }
  const fallback = getFallbackStorage();
  if (fallback) {
    try {
      const file = fallback.client.bucket(fallback.bucketName).file(objectName);
      const [exists] = await file.exists();
      if (exists) return file;
    } catch (err) {
      backendError = backendError ?? err;
    }
  }
  // If a backend could not even be CHECKED, this is a storage incident, not a
  // confirmed absence — fail loudly instead of masking it as "not found".
  if (backendError) throw backendError;
  return null;
}

/**
 * List objects from the Replit-managed bucket under one exact configured
 * prefix. This is deliberately primary-only: privacy audits must not turn a
 * managed-bucket permission failure into a fallback result and then report
 * the managed bucket as empty.
 */
export async function listPrimaryObjectsUnderPrefix(
  bucketName: string,
  objectPrefix: string,
  maxResults?: number,
): Promise<File[]> {
  const [files] = await objectStorageClient.bucket(bucketName).getFiles({
    prefix: objectPrefix,
    autoPaginate: false,
    ...(maxResults ? { maxResults } : {}),
  });
  return files;
}

/**
 * Read metadata through the managed bucket identity. Keeping this separate
 * from getObjectFileWithFallback lets privacy audits verify both the managed
 * object and its private counterpart without silently switching backends.
 */
export async function getPrimaryObjectMetadata(
  bucketName: string,
  objectName: string,
): Promise<Record<string, unknown>> {
  const [metadata] = await objectStorageClient
    .bucket(bucketName)
    .file(objectName)
    .getMetadata();
  return metadata as Record<string, unknown>;
}

/**
 * Signed GET URL that works for BOTH backends: sidecar signing for the
 * primary bucket, service-account V4 signing for the fallback bucket.
 */
export async function signObjectURLAnyBackend(file: File, ttlSec: number): Promise<string> {
  const fallback = getFallbackStorage();
  if (fallback && file.bucket.name === fallback.bucketName) {
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + ttlSec * 1000,
    });
    return url;
  }
  return signObjectURL({
    bucketName: file.bucket.name,
    objectName: file.name,
    method: "GET",
    ttlSec,
  });
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  /**
   * Inventory every configured public prefix using the authenticated managed
   * storage identity. The prefix is parsed from configuration, so callers
   * cannot accidentally list an unrelated bucket or project-wide namespace.
   *
   * Each returned file has had metadata fetched through the same identity.
   * A 403 therefore remains visible to the caller and must be repaired at the
   * bucket IAM layer rather than being interpreted as an empty inventory.
   */
  async listPrimaryPublicObjects(maxResults?: number): Promise<File[]> {
    const files: File[] = [];
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const { bucketName, objectName } = parseObjectPath(searchPath);
      const listed = await listPrimaryObjectsUnderPrefix(
        bucketName,
        objectName.replace(/\/+$/, "") + "/",
        maxResults,
      );
      for (const file of listed) {
        await getPrimaryObjectMetadata(bucketName, file.name);
        files.push(file);
      }
    }
    return files;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      // Primary bucket first, then the owner-project fallback bucket (same
      // objectName) — public assets written during a primary-bucket outage
      // land there and must still be servable.
      const file = await getObjectFileWithFallback(bucketName, objectName);
      if (file) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(file: File, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    // If the primary bucket is currently rejecting writes (platform 403), a
    // sidecar-signed URL would only fail later at the browser's PUT — where
    // the server can no longer fall back. Sign against the fallback bucket
    // instead; reads resolve both backends, so the object stays reachable.
    const fallback = getFallbackStorage();
    if (fallback && !(await primaryWriteHealthy())) {
      const [url] = await fallback.client
        .bucket(fallback.bucketName)
        .file(objectName)
        .getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 900_000 });
      return url;
    }

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async uploadPrivateFile(
    key: string,
    localPath: string,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    const privateDir = this.getPrivateObjectDir();
    const base = privateDir.endsWith("/") ? privateDir.slice(0, -1) : privateDir;
    const cleanKey = key.replace(/^\/+/, "");
    const fullPath = `${base}/${cleanKey}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    // Backend-aware write: lands in the owner-project fallback bucket when
    // the Replit-managed bucket rejects the write (platform 403).
    const bytes = await fsReadFile(localPath);
    await saveObjectWithFallback(bucketName, objectName, bytes, {
      contentType,
      metadata: { metadata: metadata ?? {} },
    });
    return `/objects/${cleanKey}`;
  }

  /**
   * Produce a short-lived signed GET URL for an EXISTING private object
   * (addressed by its `/objects/...` path). Optionally stamps a
   * Content-Disposition so cross-origin anchor downloads land with a sensible
   * filename (browsers ignore the anchor `download` attribute cross-origin
   * but honor the stored disposition).
   */
  async getSignedDownloadURL(
    objectPath: string,
    ttlSec = 3600,
    downloadFilename?: string,
  ): Promise<string> {
    const file = await this.getObjectEntityFile(objectPath);
    if (downloadFilename) {
      const safeName = downloadFilename.replace(/[^\w.\- ]+/g, "_");
      await file.setMetadata({
        contentDisposition: `attachment; filename="${safeName}"`,
      });
    }
    // Backend-aware signing: sidecar for the primary bucket, service-account
    // V4 signing for objects living in the fallback bucket.
    return signObjectURLAnyBackend(file, ttlSec);
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    // Primary bucket first, then the owner-project fallback bucket — objects
    // uploaded/vaulted during a primary-bucket outage live there.
    const objectFile = await getObjectFileWithFallback(bucketName, objectName);
    if (!objectFile) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (rawObjectPath.startsWith(objectEntityDir)) {
      const entityId = rawObjectPath.slice(objectEntityDir.length);
      return `/objects/${entityId}`;
    }

    // Fallback-bucket upload URLs: /<fallback-bucket>/<privateDirPath>/uploads/<id>.
    // The objectName inside the fallback bucket mirrors the primary bucket's,
    // so strip the fallback bucket + the primary private-dir path to recover
    // the same /objects/<id> entity path.
    const fallback = getFallbackStorage();
    if (fallback && rawObjectPath.startsWith(`/${fallback.bucketName}/`)) {
      const objectName = rawObjectPath.slice(fallback.bucketName.length + 2);
      const { objectName: privateDirObjectPrefix } = parseObjectPath(
        objectEntityDir.replace(/\/+$/, ""),
      );
      const prefix = `${privateDirObjectPrefix}/`;
      if (objectName.startsWith(prefix)) {
        return `/objects/${objectName.slice(prefix.length)}`;
      }
    }

    return rawObjectPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  /**
   * Save a public asset (cover art, preview clip) so it is reachable via
   * searchPublicObject. The DB stores the key relative (e.g. "tracks/<id>/cover.png");
   * the object is physically written under the first configured public search path,
   * using the exact same path construction searchPublicObject reads with, so the
   * two can never drift. Writing to the bucket root instead (as a plain
   * bucket.file(key).save would) leaves the asset unreachable by the public route.
   */
  async savePublicObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    if (isPrivateFullAudioKey(key)) {
      throw new Error(`Refusing public object write for private full-audio key: ${key}`);
    }
    const searchPath = this.getPublicObjectSearchPaths()[0];
    const fullPath = `${searchPath}/${key}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    await saveObjectWithFallback(bucketName, objectName, buffer, { contentType });
  }

  /**
   * Store a generated result (e.g. a mastered WAV) as a PRIVATE object and return
   * a short-lived signed GET URL the browser can download straight from GCS.
   *
   * This exists to bypass the Cloud Run request/response size limit (~32 MiB):
   * large uncompressed WAVs cannot be sent back through our own server without the
   * Google Frontend rejecting the buffered response, so we hand the client a URL
   * and the bytes never traverse Cloud Run at all.
   *
   * The object is written with a `Content-Disposition: attachment` so a cross-origin
   * anchor download lands with a sensible filename (the browser ignores an anchor's
   * `download` attribute for cross-origin URLs, but honors the stored disposition).
   * Media elements ignore Content-Disposition, so inline `<audio>` preview still works.
   */
  async saveSignedDownload(
    key: string,
    buffer: Buffer,
    contentType: string,
    downloadFilename: string,
    ttlSec = 3600,
    /** Optional key/value pairs stored as GCS custom object metadata.
     *  Use this to attach forensic/cert fields directly to the stored object
     *  so the seal record is visible at the storage layer, not only in the DB. */
    certMetadata?: Record<string, string>,
  ): Promise<string> {
    const privateDir = this.getPrivateObjectDir();
    const base = privateDir.endsWith("/") ? privateDir.slice(0, -1) : privateDir;
    const fullPath = `${base}/${key}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    // Strip characters that would break the Content-Disposition header value.
    const safeName = downloadFilename.replace(/[^\w.\- ]+/g, "_");
    const metadata = {
      contentDisposition: `attachment; filename="${safeName}"`,
      // Spread any cert/integrity fields into GCS object custom metadata.
      // These survive the object's lifetime independently of the DB record.
      ...(certMetadata ?? {}),
    };
    const backend = await saveObjectWithFallback(bucketName, objectName, buffer, {
      contentType,
      metadata,
    });
    if (backend === "fallback") {
      const fallback = getFallbackStorage()!;
      const file = fallback.client.bucket(fallback.bucketName).file(objectName);
      return signObjectURLAnyBackend(file, ttlSec);
    }
    return signObjectURL({ bucketName, objectName, method: "GET", ttlSec });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const data = (await response.json()) as { signed_url: string };
  return data.signed_url;
}
