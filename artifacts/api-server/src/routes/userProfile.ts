import { Router, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { db, artistProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function defaultArtistName(req: Request): string {
  const name = [req.dbUser?.firstName, req.dbUser?.lastName].filter(Boolean).join(" ").trim();
  return name || req.dbUser?.email?.split("@")[0] || "GravelKing Artist";
}

function profilePayload(
  profile: typeof artistProfilesTable.$inferSelect | null | undefined,
  req: Request,
) {
  return {
    userId: req.dbUser?.id ?? null,
    artistName: profile?.artistName || defaultArtistName(req),
    hometown: profile?.hometown ?? "",
    bio: profile?.bio ?? "",
    avatarUrl: profile?.avatarUrl ?? req.dbUser?.profileImageUrl ?? null,
  };
}

async function getProfile(req: Request) {
  if (!req.dbUser) return null;
  const [profile] = await db
    .select()
    .from(artistProfilesTable)
    .where(eq(artistProfilesTable.userId, req.dbUser.id))
    .limit(1);
  return profile;
}

const PROFILE_PATCH_FIELDS = {
  artist_name: { column: "artistName", maxLength: 120 },
  hometown: { column: "hometown", maxLength: 120 },
  bio: { column: "bio", maxLength: 4_000 },
} as const;

type ArtistProfilePatch = Partial<{
  artistName: string;
  hometown: string;
  bio: string;
}>;

/** Strict snake_case PATCH parser; unknown, empty, and mistyped fields fail closed. */
export function parseArtistProfilePatch(body: unknown): ArtistProfilePatch | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const entries = Object.entries(body);
  if (entries.length === 0) return null;

  const patch: ArtistProfilePatch = {};
  for (const [key, value] of entries) {
    if (!Object.hasOwn(PROFILE_PATCH_FIELDS, key) || typeof value !== "string") return null;
    const field = PROFILE_PATCH_FIELDS[key as keyof typeof PROFILE_PATCH_FIELDS];
    if (value.length > field.maxLength) return null;
    const column = field.column as keyof ArtistProfilePatch;
    patch[column] = column === "bio" ? value : value.trim();
  }
  return patch;
}

router.get("/user/profile", async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.status(401).json({ error: "Sign in to manage your artist profile." });
    return;
  }
  res.json({ profile: profilePayload(await getProfile(req), req) });
});

router.patch("/users/profile", async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.status(401).json({ error: "Sign in to manage your artist profile." });
    return;
  }

  const patch = parseArtistProfilePatch(req.body);
  if (!patch) {
    res.status(400).json({
      error: "Provide one or more supported string fields: artist_name, hometown, bio. Unknown fields and overlong values are not allowed.",
    });
    return;
  }

  const [profile] = await db
    .insert(artistProfilesTable)
    .values({ userId: req.dbUser.id, ...patch })
    .onConflictDoUpdate({
      target: artistProfilesTable.userId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();

  res.json({ profile: profilePayload(profile, req) });
});

router.put("/user/profile", async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.status(401).json({ error: "Sign in to manage your artist profile." });
    return;
  }

  const body = req.body ?? {};
  const [profile] = await db
    .insert(artistProfilesTable)
    .values({
      userId: req.dbUser.id,
      artistName: typeof body.artistName === "string" ? body.artistName.trim().slice(0, 120) : "",
      hometown: typeof body.hometown === "string" ? body.hometown.trim().slice(0, 120) : "",
      bio: typeof body.bio === "string" ? body.bio.slice(0, 4_000) : "",
    })
    .onConflictDoUpdate({
      target: artistProfilesTable.userId,
      set: {
        ...(typeof body.artistName === "string" ? { artistName: body.artistName.trim().slice(0, 120) } : {}),
        ...(typeof body.hometown === "string" ? { hometown: body.hometown.trim().slice(0, 120) } : {}),
        ...(typeof body.bio === "string" ? { bio: body.bio.slice(0, 4_000) } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({ profile: profilePayload(profile, req) });
});

function hasImageSignature(buffer: Buffer, type: string): boolean {
  if (type === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (type === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

router.post(
  "/user/avatar",
  avatarUpload.single("avatar"),
  async (req: Request, res: Response) => {
    if (!req.dbUser) {
      res.status(401).json({ error: "Sign in to upload an artist avatar." });
      return;
    }
    const file = req.file;
    const extension = file ? IMAGE_TYPES.get(file.mimetype) : undefined;
    if (!file || !extension || !hasImageSignature(file.buffer, file.mimetype)) {
      res.status(400).json({ error: "Avatar must be a valid JPEG, PNG, or WEBP image." });
      return;
    }

    const key = `artist-profiles/${req.dbUser.id}/${randomUUID()}.${extension}`;
    const avatarUrl = `/api/storage/public-objects/${key}`;
    await objectStorage.savePublicObject(key, file.buffer, file.mimetype);

    const [profile] = await db
      .insert(artistProfilesTable)
      .values({ userId: req.dbUser.id, avatarUrl })
      .onConflictDoUpdate({
        target: artistProfilesTable.userId,
        set: { avatarUrl, updatedAt: new Date() },
      })
      .returning();

    res.json({ profile: profilePayload(profile, req) });
  },
);

export default router;