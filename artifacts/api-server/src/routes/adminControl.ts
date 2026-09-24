import { Router, type Request, type Response } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, tracksTable, usersTable, adminSettingsTable } from "@workspace/db";
import { requireLabelCatalogOwner } from "../lib/adminAuth";
import { getAdminRuntimeConfig, loadAdminRuntimeConfig, persistAdminRuntimeConfig } from "../lib/adminRuntimeConfig";
import { checkSendGrid } from "../lib/sendgrid";
import { getConfiguredAdminVoiceDiagnostic } from "./jax";
import { getUncachableStripeClient } from "../stripeClient";
import { KERNEL_PRESET_MAP } from "./master";
import { clearJaxStagedProposals, listJaxStagedProposals } from "../lib/jaxStaging";
import { isJaxVoiceEngineEnabled, setJaxVoiceEngineEnabled } from "../lib/jaxVoiceEngine";
import { appendJaxUplink, JAX_SAL_CODES } from "../lib/jaxUplink";

const router = Router();

// Load saved controls during server startup so a generation request does not
// need the admin page to be opened first.
void loadAdminRuntimeConfig().catch((err) => {
  console.error("Failed to load persisted admin runtime controls:", err instanceof Error ? err.message : err);
});

router.get("/admin/control", async (req: Request, res: Response) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  try {
    const config = await loadAdminRuntimeConfig();
    const [sendgrid, users, tracks, blankSetting, jaxStaging] = await Promise.all([
      checkSendGrid(),
      db.select({
        id: usersTable.id,
        email: usersTable.email,
        isPro: usersTable.isPro,
        subscriptionTier: usersTable.subscriptionTier,
        creditsBalance: usersTable.creditsBalance,
        createdAt: usersTable.createdAt,
      }).from(usersTable).orderBy(desc(usersTable.createdAt)).limit(100),
      db.select({
        id: tracksTable.id,
        title: tracksTable.title,
        artistName: tracksTable.artistName,
        status: tracksTable.status,
        takenDown: tracksTable.takenDown,
        isFeatured: tracksTable.isFeatured,
        createdAt: tracksTable.createdAt,
      }).from(tracksTable).where(ne(tracksTable.status, "private")).orderBy(desc(tracksTable.createdAt)).limit(100),
      db.select({ value: adminSettingsTable.value }).from(adminSettingsTable)
        .where(eq(adminSettingsTable.key, "label.storefront_blank")).limit(1),
      listJaxStagedProposals(),
    ]);

    let stripe: Record<string, unknown> = { ok: false, detail: "Stripe unavailable" };
    try {
      const client = await getUncachableStripeClient();
      const subscriptions = await client.subscriptions.list({ status: "all", limit: 100 });
      const live = subscriptions.data.filter((s) => ["active", "trialing", "past_due"].includes(s.status));
      stripe = {
        ok: true,
        active: live.filter((s) => s.status === "active").length,
        trialing: live.filter((s) => s.status === "trialing").length,
        pastDue: live.filter((s) => s.status === "past_due").length,
        total: live.length,
      };
    } catch (err) {
      stripe = { ok: false, detail: err instanceof Error ? err.message : "Stripe unavailable" };
    }

    res.json({
      ok: true,
      runtime: config,
      jax: getConfiguredAdminVoiceDiagnostic(),
      kernel: { presets: Object.keys(KERNEL_PRESET_MAP) },
      providers: { sendgrid, stripe },
      users,
      tracks,
      storefrontBlank: blankSetting[0]?.value === "true",
      jaxVoiceEngineEnabled: isJaxVoiceEngineEnabled(),
      jaxStaging,
    });
  } catch (err) {
    void appendJaxUplink(JAX_SAL_CODES.audit, "control.error", err instanceof Error ? err.message : "control load failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load admin control surface" });
  }
});

router.patch("/admin/control/jax-voice", async (req: Request, res: Response) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  if (typeof req.body?.enabled !== "boolean") {
    return void res.status(400).json({ error: "enabled must be boolean" });
  }
  const enabled = setJaxVoiceEngineEnabled(req.body.enabled);
  await db.insert(adminSettingsTable)
    .values({ key: "jax.voiceEngineEnabled", value: String(enabled), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: adminSettingsTable.key,
      set: { value: String(enabled), updatedAt: new Date() },
    });
  void appendJaxUplink(JAX_SAL_CODES.audit, "control.voice.state", { enabled, autoEnable: false });
  res.json({ ok: true, enabled });
});

router.delete("/admin/control/jax-staging", async (req: Request, res: Response) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  await clearJaxStagedProposals();
  void appendJaxUplink(JAX_SAL_CODES.patch, "staging.clear", "manual owner action");
  res.json({ ok: true });
});

router.patch("/admin/control/storefront", async (req: Request, res: Response) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  const blank = req.body?.storefrontBlank;
  if (typeof blank !== "boolean") {
    res.status(400).json({ error: "storefrontBlank must be boolean" });
    return;
  }
  await db.insert(adminSettingsTable)
    .values({ key: "label.storefront_blank", value: String(blank), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: adminSettingsTable.key,
      set: { value: String(blank), updatedAt: new Date() },
    });
  res.json({ ok: true, storefrontBlank: blank });
});

router.patch("/admin/control/runtime", async (req: Request, res: Response) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const rvc = (body.rvc ?? {}) as Record<string, unknown>;
  const jax = (body.jax ?? {}) as Record<string, unknown>;
  const mastering = (body.mastering ?? {}) as Record<string, unknown>;
  const indexRate = rvc.indexRate === undefined ? undefined : Number(rvc.indexRate);
  const filterRadius = rvc.filterRadius === undefined ? undefined : Number(rvc.filterRadius);
  const protect = rvc.protect === undefined ? undefined : Number(rvc.protect);
  const temperature = jax.temperature === undefined ? undefined : Number(jax.temperature);
  const topP = jax.topP === undefined ? undefined : Number(jax.topP);
  const maxOutputTokens = jax.maxOutputTokens === undefined ? undefined : Number(jax.maxOutputTokens);
  if (indexRate !== undefined && (!Number.isFinite(indexRate) || indexRate < 0 || indexRate > 1)) return void res.status(400).json({ error: "RVC index rate must be 0–1" });
  if (filterRadius !== undefined && (!Number.isInteger(filterRadius) || filterRadius < 0 || filterRadius > 7)) return void res.status(400).json({ error: "RVC filter radius must be 0–7" });
  if (protect !== undefined && (!Number.isFinite(protect) || protect < 0 || protect > 1)) return void res.status(400).json({ error: "RVC protect must be 0–1" });
  if (temperature !== undefined && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) return void res.status(400).json({ error: "JAX temperature must be 0–2" });
  if (topP !== undefined && (!Number.isFinite(topP) || topP < 0 || topP > 1)) return void res.status(400).json({ error: "JAX top-p must be 0–1" });
  if (maxOutputTokens !== undefined && (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 64 || maxOutputTokens > 8192)) return void res.status(400).json({ error: "JAX output tokens must be 64–8192" });
  const config = await persistAdminRuntimeConfig({
    rvc: {
      ...(indexRate === undefined ? {} : { indexRate }),
      ...(filterRadius === undefined ? {} : { filterRadius }),
      ...(protect === undefined ? {} : { protect }),
      ...(typeof rvc.f0Method === "string" && ["rmvpe", "harvest", "pm"].includes(rvc.f0Method) ? { f0Method: rvc.f0Method } : {}),
    },
    jax: {
      ...(typeof jax.voicePreset === "string" && jax.voicePreset.trim() ? { voicePreset: jax.voicePreset.trim().slice(0, 100) } : {}),
      ...(temperature === undefined ? {} : { temperature }),
      ...(topP === undefined ? {} : { topP }),
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    },
    mastering: {
      ...(typeof mastering.defaultPreset === "string" && KERNEL_PRESET_MAP[mastering.defaultPreset as keyof typeof KERNEL_PRESET_MAP]
        ? { defaultPreset: mastering.defaultPreset }
        : {}),
    },
  });
  res.json({ ok: true, runtime: config });
});

router.patch("/admin/control/users/:id/entitlement", async (req: Request, res: Response) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  const tier = String((req.body as { tier?: unknown })?.tier ?? "").trim();
  if (!["free", "weekly", "monthly", "node_auditor"].includes(tier)) {
    res.status(400).json({ error: "tier must be free, weekly, monthly, or node_auditor" });
    return;
  }
  const [user] = await db.update(usersTable)
    .set({ isPro: tier !== "free", subscriptionTier: tier === "free" ? null : tier, updatedAt: new Date() })
    .where(eq(usersTable.id, String(req.params.id)))
    .returning({ id: usersTable.id, email: usersTable.email, isPro: usersTable.isPro, subscriptionTier: usersTable.subscriptionTier });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ok: true, user });
});

router.patch("/admin/control/tracks/:id/featured", async (req: Request, res: Response) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  const featured = Boolean((req.body as { featured?: unknown })?.featured);
  const [track] = await db.update(tracksTable)
    .set({ isFeatured: featured, updatedAt: new Date() })
    .where(and(eq(tracksTable.id, String(req.params.id)), ne(tracksTable.status, "private")))
    .returning({ id: tracksTable.id, isFeatured: tracksTable.isFeatured });
  if (!track) { res.status(404).json({ error: "Public track not found" }); return; }
  res.json({ ok: true, track });
});

export default router;