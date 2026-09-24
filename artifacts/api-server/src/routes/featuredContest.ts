import { Router, type Request, type Response } from "express";
import multer from "multer";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import {
  db,
  featuredArtistEntriesTable,
  featuredContestsTable,
  labelOutreachCatalogsTable,
  labelOutreachDeliveriesTable,
  masterJobsTable,
} from "@workspace/db";
import { requireLabelCatalogOwner, isAdminAuthenticated, isDeveloperAuthenticated } from "../lib/adminAuth";
import { adminSettingsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { sanitizeExt } from "../lib/audioGuards";
import { sendGmail } from "../lib/gmail";
import { sendSendGrid } from "../lib/sendgrid";

const router = Router();
const privateStorage = new ObjectStorageService();
const originalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

const FEATURE_CONSENT_VERSION = "featured-contest-v1";
const OUTREACH_CONSENT_VERSION = "major-label-outreach-v1";
const CATALOG_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ContestRouteError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export function assertFeaturedSlotAvailable(input: {
  sameArtistAlreadySelected: boolean;
  selectedCount: number;
  maxSlots: number;
}): void {
  if (input.sameArtistAlreadySelected) {
    throw new ContestRouteError("Each artist account can hold only one featured slot in a round.", 409);
  }
  if (input.selectedCount >= input.maxSlots) {
    throw new ContestRouteError(`This round already has all ${input.maxSlots} featured slots filled.`, 409);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimField(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function currentContestOrigin(req: Request): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string"
    ? forwardedProto.split(",")[0]?.trim() || req.protocol
    : req.protocol;
  const host = req.get("host");
  if (!host) throw new ContestRouteError("The current app host is unavailable.", 500);
  return `${protocol}://${host}`;
}

function catalogToken(catalogId: string, expiresAt: number): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new ContestRouteError("Catalog links are unavailable until session signing is configured.", 503);
  const signature = createHmac("sha256", secret)
    .update(`${catalogId}.${expiresAt}`)
    .digest("hex");
  return `${expiresAt}.${signature}`;
}

function verifyCatalogToken(catalogId: string, rawToken: string): boolean {
  const secret = process.env.SESSION_SECRET;
  const [rawExpiry, signature] = rawToken.split(".");
  const expiresAt = Number(rawExpiry);
  if (!secret || !Number.isInteger(expiresAt) || !signature || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(`${catalogId}.${expiresAt}`)
    .digest("hex");
  const presented = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return presented.length === expectedBuffer.length && timingSafeEqual(presented, expectedBuffer);
}

function catalogDownloadUrl(req: Request, catalogId: string): { url: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + CATALOG_LINK_TTL_SECONDS;
  const token = catalogToken(catalogId, expiresAt);
  return {
    expiresAt,
    url: `${currentContestOrigin(req)}/api/featured-contest/catalogs/${encodeURIComponent(catalogId)}/download?token=${encodeURIComponent(token)}`,
  };
}

async function getLatestContest() {
  const [contest] = await db
    .select()
    .from(featuredContestsTable)
    .orderBy(desc(featuredContestsTable.createdAt))
    .limit(1);
  return contest ?? null;
}

/**
 * The first artist submission can open the initial round without an admin
 * setup step. A transaction-level advisory lock prevents two first-time
 * submissions from creating two concurrent rounds.
 */
async function getOrCreateOpenContest() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('gk_featured_contest_open'))`);
    const [existing] = await tx
      .select()
      .from(featuredContestsTable)
      .where(eq(featuredContestsTable.status, "open"))
      .orderBy(desc(featuredContestsTable.createdAt))
      .limit(1);
    if (existing) return existing;

    const [created] = await tx
      .insert(featuredContestsTable)
      .values({
        name: `GravelKing Productions Featured Artist Contest ${new Date().getFullYear()}`,
        status: "open",
        maxSlots: 10,
        startsAt: new Date(),
      })
      .returning();
    return created;
  });
}

async function requireSignedInUser(req: Request, res: Response): Promise<boolean> {
  if (req.dbUser) return true;
  res.status(401).json({ error: "Sign in is required for the Featured Artist Contest." });
  return false;
}

async function requireContestAdmin(req: Request, res: Response): Promise<boolean> {
  return requireLabelCatalogOwner(req, res);
}

async function streamPrivateObject(
  req: Request,
  res: Response,
  objectPath: string,
  filename: string,
  disposition: "inline" | "attachment",
): Promise<void> {
  try {
    const file = await privateStorage.getObjectEntityFile(objectPath);
    const [metadata] = await file.getMetadata();
    const safeName = filename.replace(/[^\w.\- ]+/g, "_");
    res.setHeader("Content-Type", String(metadata.contentType ?? "audio/wav"));
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
    res.setHeader("Cache-Control", disposition === "inline" ? "public, max-age=3600" : "private, no-store");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    file.createReadStream()
      .on("error", (err) => {
        req.log?.error?.({ err }, "featured contest audio stream failed");
        if (!res.headersSent) res.status(502).json({ error: "Unable to read contest audio." });
        else res.destroy(err);
      })
      .pipe(res);
  } catch (err) {
    req.log?.error?.({ err }, "featured contest audio unavailable");
    res.status(502).json({ error: "Contest audio is temporarily unavailable." });
  }
}

/** Public current-round metadata and the selected artist slots. */
router.get("/featured-contest", async (_req: Request, res: Response) => {
  try {
    const [blankSetting] = await db
      .select({ value: adminSettingsTable.value })
      .from(adminSettingsTable)
      .where(eq(adminSettingsTable.key, "label.storefront_blank"))
      .limit(1);
    const storefrontBlank = blankSetting?.value === "true";
    const contest = await getLatestContest();
    if (!contest) {
      res.json({ contest: null, entries: [], storefrontBlank });
      return;
    }

    const entries = await db
      .select({
        id: featuredArtistEntriesTable.id,
        title: featuredArtistEntriesTable.title,
        artistName: featuredArtistEntriesTable.artistName,
        slotNumber: featuredArtistEntriesTable.slotNumber,
        selectedAt: featuredArtistEntriesTable.selectedAt,
      })
      .from(featuredArtistEntriesTable)
      .where(and(
        eq(featuredArtistEntriesTable.contestId, contest.id),
        eq(featuredArtistEntriesTable.status, "selected"),
        eq(featuredArtistEntriesTable.isActive, true),
      ))
      .orderBy(asc(featuredArtistEntriesTable.slotNumber));

    res.json({
      contest: {
        id: contest.id,
        name: contest.name,
        status: contest.status,
        maxSlots: contest.maxSlots,
        startsAt: contest.startsAt,
        closesAt: contest.closesAt,
      },
      storefrontBlank,
      entries: entries.map((entry) => ({
        ...entry,
        audioUrl: `/api/featured-contest/entries/${encodeURIComponent(entry.id)}/audio`,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load the Featured Artist Contest." });
  }
});

/**
 * A selected performance is public; a non-selected performance is available
 * only to the admin who is reviewing the contest queue.
 */
router.get("/featured-contest/entries/:id/audio", async (req: Request, res: Response) => {
  const entryId = String(req.params.id);
  const admin = isAdminAuthenticated(req) || await isDeveloperAuthenticated(req);
  try {
    const [entry] = await db
      .select({
        status: featuredArtistEntriesTable.status,
        title: featuredArtistEntriesTable.title,
        artistName: featuredArtistEntriesTable.artistName,
        jobStatus: masterJobsTable.status,
        outputObjectKey: masterJobsTable.outputObjectKey,
        originalFilename: masterJobsTable.originalFilename,
      })
      .from(featuredArtistEntriesTable)
      .innerJoin(masterJobsTable, eq(featuredArtistEntriesTable.masterJobId, masterJobsTable.id))
      .where(eq(featuredArtistEntriesTable.id, entryId))
      .limit(1);
    if (!entry || (entry.status !== "selected" && !admin)) {
      res.status(404).json({ error: "Featured performance not found." });
      return;
    }
    if (entry.jobStatus !== "completed" || !entry.outputObjectKey) {
      res.status(409).json({ error: "The mastered performance is not ready." });
      return;
    }
    await streamPrivateObject(
      req,
      res,
      `/objects/${entry.outputObjectKey}`,
      `${entry.artistName} - ${entry.title}.wav`,
      "inline",
    );
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load the performance." });
  }
});

/** Submit only a completed, authenticated Main Stage master. */
router.post("/featured-contest/submissions", async (req: Request, res: Response) => {
  if (!await requireSignedInUser(req, res)) return;
  const title = trimField(req.body?.title, 255);
  const artistName = trimField(req.body?.artistName, 255);
  const masterJobId = trimField(req.body?.masterJobId, 64);
  const featureConsent = req.body?.featureConsent === true;
  const outreachConsent = req.body?.outreachConsent === true;

  if (!title || !artistName || !masterJobId) {
    res.status(400).json({ error: "Title, artist name, and a mastered job are required." });
    return;
  }
  if (!featureConsent) {
    res.status(400).json({ error: "Feature consent is required to enter the contest." });
    return;
  }

  try {
    const [job] = await db
      .select({
        id: masterJobsTable.id,
        status: masterJobsTable.status,
        type: masterJobsTable.type,
        userId: masterJobsTable.userId,
        outputObjectKey: masterJobsTable.outputObjectKey,
        requestConfig: masterJobsTable.requestConfig,
      })
      .from(masterJobsTable)
      .where(and(
        eq(masterJobsTable.id, masterJobId),
        eq(masterJobsTable.userId, req.dbUser!.id),
      ))
      .limit(1);
    const config = isRecord(job?.requestConfig) ? job.requestConfig : {};
    if (
      !job
      || job.type !== "mastering"
      || job.status !== "completed"
      || !job.outputObjectKey
      || config.sourceContext !== "main_stage"
      || config.certProvenance !== "vocal_recording"
    ) {
      res.status(422).json({ error: "Only a completed Main Stage mastering result can enter this contest." });
      return;
    }

    const contest = await getOrCreateOpenContest();
    const [existing] = await db
      .select({ id: featuredArtistEntriesTable.id })
      .from(featuredArtistEntriesTable)
      .where(and(
        eq(featuredArtistEntriesTable.contestId, contest.id),
        eq(featuredArtistEntriesTable.masterJobId, masterJobId),
      ))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "This mastered performance is already in the contest." });
      return;
    }

    const [entry] = await db
      .insert(featuredArtistEntriesTable)
      .values({
        contestId: contest.id,
        userId: req.dbUser!.id,
        masterJobId,
        title,
        artistName,
        source: "main_stage",
        featureConsentAt: new Date(),
        featureConsentVersion: FEATURE_CONSENT_VERSION,
        outreachConsentAt: outreachConsent ? new Date() : null,
        outreachConsentVersion: outreachConsent ? OUTREACH_CONSENT_VERSION : null,
      })
      .returning();

    res.status(201).json({
      entry: {
        id: entry.id,
        title: entry.title,
        artistName: entry.artistName,
        contestId: entry.contestId,
        status: entry.status,
        outreachConsent: Boolean(entry.outreachConsentAt),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not submit the performance." });
  }
});

/** Let an artist add or withdraw outreach consent before a catalog is sent. */
router.patch("/featured-contest/submissions/:id/outreach-consent", async (req: Request, res: Response) => {
  if (!await requireSignedInUser(req, res)) return;
  const consent = req.body?.consent === true;
  try {
    const [entry] = await db
      .select({ id: featuredArtistEntriesTable.id, userId: featuredArtistEntriesTable.userId })
      .from(featuredArtistEntriesTable)
      .where(eq(featuredArtistEntriesTable.id, String(req.params.id)))
      .limit(1);
    if (!entry || entry.userId !== req.dbUser!.id) {
      res.status(404).json({ error: "Contest entry not found." });
      return;
    }
    const [sentCatalog] = await db
      .select({ id: labelOutreachCatalogsTable.id })
      .from(labelOutreachCatalogsTable)
      .where(and(
        eq(labelOutreachCatalogsTable.entryId, entry.id),
        inArray(labelOutreachCatalogsTable.status, ["sent"]),
      ))
      .limit(1);
    if (sentCatalog && !consent) {
      res.status(409).json({ error: "Outreach consent cannot be withdrawn after a catalog has been sent." });
      return;
    }
    await db
      .update(featuredArtistEntriesTable)
      .set({
        outreachConsentAt: consent ? new Date() : null,
        outreachConsentVersion: consent ? OUTREACH_CONSENT_VERSION : null,
        updatedAt: new Date(),
      })
      .where(eq(featuredArtistEntriesTable.id, entry.id));
    res.json({ ok: true, consent });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not update outreach consent." });
  }
});

/** Admin queue: all entries and all original-track catalog packages. */
router.get("/admin/featured-contest", async (req: Request, res: Response) => {
  if (!await requireContestAdmin(req, res)) return;
  try {
    const contest = await getLatestContest();
    if (!contest) {
      res.json({ contest: null, entries: [], catalogs: [] });
      return;
    }
    const entries = await db
      .select({
        id: featuredArtistEntriesTable.id,
        contestId: featuredArtistEntriesTable.contestId,
        title: featuredArtistEntriesTable.title,
        artistName: featuredArtistEntriesTable.artistName,
        status: featuredArtistEntriesTable.status,
        slotNumber: featuredArtistEntriesTable.slotNumber,
        source: featuredArtistEntriesTable.source,
        featureConsentAt: featuredArtistEntriesTable.featureConsentAt,
        outreachConsentAt: featuredArtistEntriesTable.outreachConsentAt,
        submittedAt: featuredArtistEntriesTable.submittedAt,
        selectedAt: featuredArtistEntriesTable.selectedAt,
        isActive: featuredArtistEntriesTable.isActive,
        masterJobId: featuredArtistEntriesTable.masterJobId,
        masterStatus: masterJobsTable.status,
        masterCompletedAt: masterJobsTable.completedAt,
        masterOriginalFilename: masterJobsTable.originalFilename,
        certificateEligible: sql<boolean>`COALESCE((${masterJobsTable.requestConfig}->>'certify') = 'true', false)`,
      })
      .from(featuredArtistEntriesTable)
      .innerJoin(masterJobsTable, eq(featuredArtistEntriesTable.masterJobId, masterJobsTable.id))
      .where(eq(featuredArtistEntriesTable.contestId, contest.id))
      .orderBy(asc(featuredArtistEntriesTable.slotNumber), desc(featuredArtistEntriesTable.submittedAt));

    const catalogs = await db
      .select({
        id: labelOutreachCatalogsTable.id,
        entryId: labelOutreachCatalogsTable.entryId,
        originalTitle: labelOutreachCatalogsTable.originalTitle,
        originalFilename: labelOutreachCatalogsTable.originalFilename,
        status: labelOutreachCatalogsTable.status,
        approvedAt: labelOutreachCatalogsTable.approvedAt,
        approvedBy: labelOutreachCatalogsTable.approvedBy,
        sentAt: labelOutreachCatalogsTable.sentAt,
        lastError: labelOutreachCatalogsTable.lastError,
        createdAt: labelOutreachCatalogsTable.createdAt,
      })
      .from(labelOutreachCatalogsTable)
      .innerJoin(featuredArtistEntriesTable, eq(labelOutreachCatalogsTable.entryId, featuredArtistEntriesTable.id))
      .where(eq(featuredArtistEntriesTable.contestId, contest.id))
      .orderBy(desc(labelOutreachCatalogsTable.createdAt));

    const deliveries = catalogs.length
      ? await db
          .select({
            id: labelOutreachDeliveriesTable.id,
            catalogId: labelOutreachDeliveriesTable.catalogId,
            labelName: labelOutreachDeliveriesTable.labelName,
            recipientEmail: labelOutreachDeliveriesTable.recipientEmail,
            provider: labelOutreachDeliveriesTable.provider,
            status: labelOutreachDeliveriesTable.status,
            sentAt: labelOutreachDeliveriesTable.sentAt,
            error: labelOutreachDeliveriesTable.error,
            createdAt: labelOutreachDeliveriesTable.createdAt,
          })
          .from(labelOutreachDeliveriesTable)
          .where(inArray(labelOutreachDeliveriesTable.catalogId, catalogs.map((catalog) => catalog.id)))
          .orderBy(desc(labelOutreachDeliveriesTable.createdAt))
      : [];

    res.json({ contest, entries, catalogs, deliveries });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load contest administration." });
  }
});

/** Start a new ten-slot round. */
router.post("/admin/featured-contest", async (req: Request, res: Response) => {
  if (!await requireContestAdmin(req, res)) return;
  const name = trimField(req.body?.name, 255) || `GravelKing Productions Featured Artist Contest ${new Date().getFullYear()}`;
  try {
    const contest = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('gk_featured_contest_open'))`);
      const [open] = await tx
        .select({ id: featuredContestsTable.id })
        .from(featuredContestsTable)
        .where(eq(featuredContestsTable.status, "open"))
        .limit(1);
      if (open) throw new ContestRouteError("An open Featured Artist Contest round already exists.", 409);
      const [created] = await tx
        .insert(featuredContestsTable)
        .values({ name, status: "open", maxSlots: 10, startsAt: new Date() })
        .returning();
      return created;
    });
    res.status(201).json({ contest });
  } catch (err) {
    const status = err instanceof ContestRouteError ? err.statusCode : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : "Could not start a contest round." });
  }
});

router.patch("/admin/featured-contest/:id/status", async (req: Request, res: Response) => {
  if (!await requireContestAdmin(req, res)) return;
  const status = req.body?.status;
  if (status !== "open" && status !== "closed" && status !== "archived") {
    res.status(400).json({ error: "status must be open, closed, or archived." });
    return;
  }
  try {
    if (status === "open") {
      const [open] = await db
        .select({ id: featuredContestsTable.id })
        .from(featuredContestsTable)
        .where(and(
          eq(featuredContestsTable.status, "open"),
          sql`${featuredContestsTable.id} <> ${String(req.params.id)}`,
        ))
        .limit(1);
      if (open) {
        res.status(409).json({ error: "Close the existing open round before reopening another." });
        return;
      }
    }
    const [contest] = await db
      .update(featuredContestsTable)
      .set({
        status,
        closesAt: status === "open" ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(featuredContestsTable.id, String(req.params.id)))
      .returning();
    if (!contest) {
      res.status(404).json({ error: "Contest round not found." });
      return;
    }
    res.json({ contest });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not update contest status." });
  }
});

/** Select/deselect a winner while enforcing ten distinct artist accounts. */
router.patch("/admin/featured-contest/entries/:id/selection", async (req: Request, res: Response) => {
  if (!await requireContestAdmin(req, res)) return;
  const selected = req.body?.selected === true;
  const entryId = String(req.params.id);
  try {
    const result = await db.transaction(async (tx) => {
      const [entry] = await tx
        .select({
          id: featuredArtistEntriesTable.id,
          contestId: featuredArtistEntriesTable.contestId,
          userId: featuredArtistEntriesTable.userId,
          status: featuredArtistEntriesTable.status,
          contestStatus: featuredContestsTable.status,
          maxSlots: featuredContestsTable.maxSlots,
        })
        .from(featuredArtistEntriesTable)
        .innerJoin(featuredContestsTable, eq(featuredArtistEntriesTable.contestId, featuredContestsTable.id))
        .where(eq(featuredArtistEntriesTable.id, entryId))
        .limit(1);
      if (!entry) throw new ContestRouteError("Contest entry not found.", 404);
      if (entry.contestStatus !== "open") throw new ContestRouteError("Open the contest round before changing selections.", 409);

      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`gk_featured_contest_${entry.contestId}`}))`);

      if (!selected) {
        if (entry.status !== "selected") return { selected: false };
        const [sentCatalog] = await tx
          .select({ id: labelOutreachCatalogsTable.id })
          .from(labelOutreachCatalogsTable)
          .where(and(
            eq(labelOutreachCatalogsTable.entryId, entryId),
            eq(labelOutreachCatalogsTable.status, "sent"),
          ))
          .limit(1);
        if (sentCatalog) throw new ContestRouteError("A winner with a sent catalog cannot be removed from the featured slots.", 409);
        await tx
          .update(featuredArtistEntriesTable)
          .set({ status: "not_selected", slotNumber: null, updatedAt: new Date() })
          .where(eq(featuredArtistEntriesTable.id, entryId));
        return { selected: false };
      }

      if (entry.status === "selected") return { selected: true };

      const [sameArtist] = await tx
        .select({ id: featuredArtistEntriesTable.id })
        .from(featuredArtistEntriesTable)
        .where(and(
          eq(featuredArtistEntriesTable.contestId, entry.contestId),
          eq(featuredArtistEntriesTable.userId, entry.userId),
          eq(featuredArtistEntriesTable.status, "selected"),
        ))
        .limit(1);
      const selectedRows = await tx
        .select({ slotNumber: featuredArtistEntriesTable.slotNumber })
        .from(featuredArtistEntriesTable)
        .where(and(
          eq(featuredArtistEntriesTable.contestId, entry.contestId),
          eq(featuredArtistEntriesTable.status, "selected"),
        ));
      assertFeaturedSlotAvailable({
        sameArtistAlreadySelected: Boolean(sameArtist),
        selectedCount: selectedRows.length,
        maxSlots: entry.maxSlots,
      });
      const usedSlots = new Set(selectedRows.map((row) => row.slotNumber).filter((slot): slot is number => slot !== null));
      let slotNumber = 1;
      while (usedSlots.has(slotNumber)) slotNumber += 1;
      await tx
        .update(featuredArtistEntriesTable)
        .set({ status: "selected", slotNumber, selectedAt: new Date(), updatedAt: new Date() })
        .where(eq(featuredArtistEntriesTable.id, entryId));
      return { selected: true, slotNumber };
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof ContestRouteError ? err.statusCode : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : "Could not update the featured slot." });
  }
});

router.patch("/admin/featured-contest/entries/:id/active", async (req: Request, res: Response) => {
  if (!await requireContestAdmin(req, res)) return;
  const active = req.body?.active === true;
  const [entry] = await db
    .update(featuredArtistEntriesTable)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(featuredArtistEntriesTable.id, String(req.params.id)))
    .returning({ id: featuredArtistEntriesTable.id, isActive: featuredArtistEntriesTable.isActive });
  if (!entry) {
    res.status(404).json({ error: "Contest entry not found." });
    return;
  }
  res.json({ ok: true, entry });
});

/** Store an original track privately for a selected winner. */
router.post(
  "/admin/featured-contest/entries/:id/catalog",
  originalUpload.single("audio"),
  async (req: Request, res: Response) => {
    if (!await requireContestAdmin(req, res)) return;
    const originalTitle = trimField(req.body?.originalTitle, 255);
    const audio = req.file;
    if (!originalTitle || !audio || audio.size <= 0) {
      res.status(400).json({ error: "Original title and an audio file are required." });
      return;
    }
    try {
      const [entry] = await db
        .select({
          id: featuredArtistEntriesTable.id,
          status: featuredArtistEntriesTable.status,
          outreachConsentAt: featuredArtistEntriesTable.outreachConsentAt,
        })
        .from(featuredArtistEntriesTable)
        .where(eq(featuredArtistEntriesTable.id, String(req.params.id)))
        .limit(1);
      if (!entry) {
        res.status(404).json({ error: "Contest entry not found." });
        return;
      }
      if (entry.status !== "selected") {
        res.status(409).json({ error: "Only a selected Featured Artist can have an outreach catalog." });
        return;
      }
      if (!entry.outreachConsentAt) {
        res.status(409).json({ error: "The artist has not granted major-label outreach consent." });
        return;
      }
      const catalogId = randomUUID();
      const objectKey = `label-outreach/${catalogId}/original.${sanitizeExt(audio.originalname)}`;
      await privateStorage.savePrivateBuffer(objectKey, audio.buffer, audio.mimetype || "application/octet-stream");
      const [catalog] = await db
        .insert(labelOutreachCatalogsTable)
        .values({
          id: catalogId,
          entryId: entry.id,
          originalTitle,
          originalFilename: audio.originalname.slice(0, 255),
          originalObjectKey: objectKey,
          status: "draft",
        })
        .returning();
      res.status(201).json({ catalog });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Could not store the original catalog item." });
    }
  },
);

router.get("/admin/featured-contest/catalogs/:id/audio", async (req: Request, res: Response) => {
  if (!await requireContestAdmin(req, res)) return;
  try {
    const [catalog] = await db
      .select({
        originalObjectKey: labelOutreachCatalogsTable.originalObjectKey,
        originalFilename: labelOutreachCatalogsTable.originalFilename,
      })
      .from(labelOutreachCatalogsTable)
      .where(eq(labelOutreachCatalogsTable.id, String(req.params.id)))
      .limit(1);
    if (!catalog) {
      res.status(404).json({ error: "Catalog item not found." });
      return;
    }
    await streamPrivateObject(req, res, `/objects/${catalog.originalObjectKey}`, catalog.originalFilename, "inline");
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not load the original." });
  }
});

router.patch("/admin/featured-contest/catalogs/:id/approve", async (req: Request, res: Response) => {
  if (!await requireContestAdmin(req, res)) return;
  try {
    const [catalog] = await db
      .select({
        id: labelOutreachCatalogsTable.id,
        status: labelOutreachCatalogsTable.status,
        originalObjectKey: labelOutreachCatalogsTable.originalObjectKey,
        entryStatus: featuredArtistEntriesTable.status,
        outreachConsentAt: featuredArtistEntriesTable.outreachConsentAt,
      })
      .from(labelOutreachCatalogsTable)
      .innerJoin(featuredArtistEntriesTable, eq(labelOutreachCatalogsTable.entryId, featuredArtistEntriesTable.id))
      .where(eq(labelOutreachCatalogsTable.id, String(req.params.id)))
      .limit(1);
    if (!catalog) {
      res.status(404).json({ error: "Catalog item not found." });
      return;
    }
    if (catalog.entryStatus !== "selected" || !catalog.outreachConsentAt) {
      res.status(409).json({ error: "A selected artist with current outreach consent is required." });
      return;
    }
    if (!catalog.originalObjectKey) {
      res.status(409).json({ error: "The original audio is missing." });
      return;
    }
    const [updated] = await db
      .update(labelOutreachCatalogsTable)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: req.dbUser?.email ?? "admin",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(labelOutreachCatalogsTable.id, catalog.id))
      .returning();
    res.json({ catalog: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not approve the catalog." });
  }
});

/**
 * Send one approved original catalog item to one named label contact. This
 * never uses tracker dates or inferred recipients: the operator supplies the
 * exact recipient and the artist's consent + admin approval are both checked.
 */
router.post("/admin/featured-contest/catalogs/:id/send", async (req: Request, res: Response) => {
  if (!await requireContestAdmin(req, res)) return;
  const labelName = trimField(req.body?.labelName, 255);
  const recipientEmail = trimField(req.body?.recipientEmail, 320).toLowerCase();
  const provider = req.body?.provider === "sendgrid" ? "sendgrid" : "gmail";
  const subject = trimField(req.body?.subject, 200);
  const message = trimField(req.body?.message, 5000);
  if (!labelName || !EMAIL_RE.test(recipientEmail)) {
    res.status(400).json({ error: "A label name and valid recipient email are required." });
    return;
  }
  try {
    const [catalog] = await db
      .select({
        id: labelOutreachCatalogsTable.id,
        originalTitle: labelOutreachCatalogsTable.originalTitle,
        status: labelOutreachCatalogsTable.status,
        entryId: labelOutreachCatalogsTable.entryId,
        originalObjectKey: labelOutreachCatalogsTable.originalObjectKey,
        artistName: featuredArtistEntriesTable.artistName,
        entryTitle: featuredArtistEntriesTable.title,
        outreachConsentAt: featuredArtistEntriesTable.outreachConsentAt,
        entryStatus: featuredArtistEntriesTable.status,
      })
      .from(labelOutreachCatalogsTable)
      .innerJoin(featuredArtistEntriesTable, eq(labelOutreachCatalogsTable.entryId, featuredArtistEntriesTable.id))
      .where(eq(labelOutreachCatalogsTable.id, String(req.params.id)))
      .limit(1);
    if (!catalog) {
      res.status(404).json({ error: "Catalog item not found." });
      return;
    }
    if (catalog.status !== "approved") {
      res.status(409).json({ error: "Approve the catalog after verifying consent before sending it." });
      return;
    }
    if (catalog.entryStatus !== "selected" || !catalog.outreachConsentAt) {
      res.status(409).json({ error: "Current artist outreach consent and a selected slot are required." });
      return;
    }
    const [alreadySent] = await db
      .select({ id: labelOutreachDeliveriesTable.id })
      .from(labelOutreachDeliveriesTable)
      .where(and(
        eq(labelOutreachDeliveriesTable.catalogId, catalog.id),
        eq(labelOutreachDeliveriesTable.recipientEmail, recipientEmail),
        eq(labelOutreachDeliveriesTable.status, "sent"),
      ))
      .limit(1);
    if (alreadySent) {
      res.status(409).json({ error: "This catalog was already sent to that recipient." });
      return;
    }

    const [delivery] = await db
      .insert(labelOutreachDeliveriesTable)
      .values({
        catalogId: catalog.id,
        labelName,
        recipientEmail,
        provider,
        status: "queued",
      })
      .returning();
    const link = catalogDownloadUrl(req, catalog.id);
    const emailSubject = subject || `GravelKing Productions audition catalog — ${catalog.artistName}`;
    const emailText = [
      `Hello ${labelName},`,
      "",
      message || `GravelKing Productions is submitting ${catalog.artistName}'s original track “${catalog.originalTitle}” for future audition consideration.`,
      "",
      `Featured Artist performance: ${catalog.entryTitle}`,
      `Private original audio catalog link (expires ${new Date(link.expiresAt * 1000).toISOString()}):`,
      link.url,
      "",
      "This catalog item was shared with the artist's recorded consent and approved by GravelKing Productions.",
      "Please do not redistribute the private link.",
    ].join("\n");

    const sent = provider === "sendgrid"
      ? await sendSendGrid({
          to: [recipientEmail],
          from: process.env.SENDGRID_FROM_EMAIL?.trim() || "allnonellc0120@gmail.com",
          subject: emailSubject,
          text: emailText,
        })
      : await sendGmail({ to: recipientEmail, subject: emailSubject, text: emailText });

    if (sent) {
      await db
        .update(labelOutreachDeliveriesTable)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(labelOutreachDeliveriesTable.id, delivery.id));
      await db
        .update(labelOutreachCatalogsTable)
        .set({ status: "sent", sentAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(labelOutreachCatalogsTable.id, catalog.id));
      res.json({ ok: true, deliveryId: delivery.id, catalogUrl: link.url });
      return;
    }

    const error = `${provider} provider did not accept the message.`;
    await db
      .update(labelOutreachDeliveriesTable)
      .set({ status: "failed", error })
      .where(eq(labelOutreachDeliveriesTable.id, delivery.id));
    await db
      .update(labelOutreachCatalogsTable)
      .set({ status: "failed", lastError: error, updatedAt: new Date() })
      .where(eq(labelOutreachCatalogsTable.id, catalog.id));
    res.status(502).json({ error });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not send the catalog." });
  }
});

/** Public, expiring download used by a major-label recipient. */
router.get("/featured-contest/catalogs/:id/download", async (req: Request, res: Response) => {
  const catalogId = String(req.params.id);
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!verifyCatalogToken(catalogId, token)) {
    res.status(403).json({ error: "This catalog link is invalid or expired." });
    return;
  }
  try {
    const [catalog] = await db
      .select({
        originalObjectKey: labelOutreachCatalogsTable.originalObjectKey,
        originalFilename: labelOutreachCatalogsTable.originalFilename,
        status: labelOutreachCatalogsTable.status,
      })
      .from(labelOutreachCatalogsTable)
      .where(eq(labelOutreachCatalogsTable.id, catalogId))
      .limit(1);
    if (!catalog || (catalog.status !== "approved" && catalog.status !== "sent")) {
      res.status(404).json({ error: "This catalog item is no longer available." });
      return;
    }
    await streamPrivateObject(req, res, `/objects/${catalog.originalObjectKey}`, catalog.originalFilename, "attachment");
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not download the catalog item." });
  }
});

export default router;