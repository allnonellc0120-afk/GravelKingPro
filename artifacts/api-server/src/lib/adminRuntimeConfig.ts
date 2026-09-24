import { db, adminSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const ADMIN_RUNTIME_DEFAULTS = {
  rvc: {
    indexRate: 0.75,
    filterRadius: 3,
    protect: 0.38,
    f0Method: "rmvpe",
    pitchShift: 0,
    modelKey: "models/gravelking_v2.pth",
    indexKey: "models/gravelking_v2.index",
  },
  jax: {
    voicePreset: "gravelking_outlaw_baritone",
    temperature: 0.72,
    topP: 0.9,
    maxOutputTokens: 2048,
    persona: "",
  },
  mastering: {
    defaultPreset: "baseline",
  },
} as const;

export type AdminRuntimeConfig = {
  rvc: {
    indexRate: number;
    filterRadius: number;
    protect: number;
    f0Method: string;
    pitchShift: number;
    modelKey: string;
    indexKey: string;
  };
  jax: {
    voicePreset: string;
    temperature: number;
    topP: number;
    maxOutputTokens: number;
    persona: string;
  };
  mastering: {
    defaultPreset: string;
  };
};

type AdminRuntimePatch = {
  rvc?: Partial<AdminRuntimeConfig["rvc"]>;
  jax?: Partial<AdminRuntimeConfig["jax"]>;
  mastering?: Partial<AdminRuntimeConfig["mastering"]>;
};

let runtimeConfig: AdminRuntimeConfig = structuredClone(ADMIN_RUNTIME_DEFAULTS);

export function getAdminRuntimeConfig(): AdminRuntimeConfig {
  return runtimeConfig;
}

export function setAdminRuntimeConfig(next: AdminRuntimePatch): AdminRuntimeConfig {
  runtimeConfig = {
    rvc: { ...runtimeConfig.rvc, ...(next.rvc ?? {}) },
    jax: { ...runtimeConfig.jax, ...(next.jax ?? {}) },
    mastering: { ...runtimeConfig.mastering, ...(next.mastering ?? {}) },
  };
  return runtimeConfig;
}

export async function loadAdminRuntimeConfig(): Promise<AdminRuntimeConfig> {
  const rows = await db.select().from(adminSettingsTable);
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const parse = (key: string): unknown => {
    const raw = stored.get(key);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  const storedJaxConfig = parse("jax_config");
  const storedRvcConfig = parse("rvc_settings");
  const rvcConfig =
    storedRvcConfig && typeof storedRvcConfig === "object"
      ? storedRvcConfig as Record<string, unknown>
      : {};
  const jaxConfig =
    storedJaxConfig && typeof storedJaxConfig === "object"
      ? storedJaxConfig as Record<string, unknown>
      : {};

  return setAdminRuntimeConfig({
    rvc: {
      indexRate: typeof rvcConfig.index_rate === "number"
        ? rvcConfig.index_rate
        : typeof parse("rvc.indexRate") === "number"
          ? parse("rvc.indexRate") as number
          : runtimeConfig.rvc.indexRate,
      filterRadius: typeof rvcConfig.filter_radius === "number"
        ? rvcConfig.filter_radius
        : typeof parse("rvc.filterRadius") === "number"
          ? parse("rvc.filterRadius") as number
          : runtimeConfig.rvc.filterRadius,
      protect: typeof rvcConfig.protect === "number"
        ? rvcConfig.protect
        : typeof parse("rvc.protect") === "number"
          ? parse("rvc.protect") as number
          : runtimeConfig.rvc.protect,
      f0Method: typeof parse("rvc.f0Method") === "string" ? parse("rvc.f0Method") as string : runtimeConfig.rvc.f0Method,
      pitchShift: typeof parse("rvc.pitchShift") === "number" ? parse("rvc.pitchShift") as number : runtimeConfig.rvc.pitchShift,
      modelKey: typeof parse("rvc.modelKey") === "string" ? parse("rvc.modelKey") as string : runtimeConfig.rvc.modelKey,
      indexKey: typeof parse("rvc.indexKey") === "string" ? parse("rvc.indexKey") as string : runtimeConfig.rvc.indexKey,
    },
    jax: {
      voicePreset: typeof parse("jax.voicePreset") === "string" ? parse("jax.voicePreset") as string : runtimeConfig.jax.voicePreset,
      temperature: typeof jaxConfig.temperature === "number"
        ? jaxConfig.temperature
        : typeof parse("jax.temperature") === "number"
          ? parse("jax.temperature") as number
          : runtimeConfig.jax.temperature,
      topP: typeof jaxConfig.top_p === "number" ? jaxConfig.top_p : runtimeConfig.jax.topP,
      maxOutputTokens: typeof jaxConfig.max_output_tokens === "number"
        ? jaxConfig.max_output_tokens
        : typeof parse("jax.maxOutputTokens") === "number"
          ? parse("jax.maxOutputTokens") as number
          : runtimeConfig.jax.maxOutputTokens,
      persona: typeof parse("jax.persona") === "string" ? parse("jax.persona") as string : runtimeConfig.jax.persona,
    },
    mastering: {
      defaultPreset: typeof parse("mastering.defaultPreset") === "string" ? parse("mastering.defaultPreset") as string : runtimeConfig.mastering.defaultPreset,
    },
  });
}

export async function persistAdminRuntimeConfig(next: AdminRuntimePatch): Promise<AdminRuntimeConfig> {
  const config: AdminRuntimeConfig = {
    rvc: { ...runtimeConfig.rvc, ...next.rvc },
    jax: { ...runtimeConfig.jax, ...next.jax },
    mastering: { ...runtimeConfig.mastering, ...next.mastering },
  };
  const values: Array<[string, unknown]> = [
    ["rvc.indexRate", config.rvc.indexRate],
    ["rvc.filterRadius", config.rvc.filterRadius],
    ["rvc.protect", config.rvc.protect],
    ["rvc.f0Method", config.rvc.f0Method],
    ["rvc.pitchShift", config.rvc.pitchShift],
    ["rvc.modelKey", config.rvc.modelKey],
    ["rvc.indexKey", config.rvc.indexKey],
    ["rvc_settings", {
      index_rate: config.rvc.indexRate,
      filter_radius: config.rvc.filterRadius,
      protect: config.rvc.protect,
      rms_mix_rate: 0.25,
    }],
    ["jax.voicePreset", config.jax.voicePreset],
    ["jax.persona", config.jax.persona],
    ["jax.temperature", config.jax.temperature],
    ["jax.topP", config.jax.topP],
    ["jax.maxOutputTokens", config.jax.maxOutputTokens],
    ["jax_config", {
      temperature: config.jax.temperature,
      top_p: config.jax.topP,
      max_output_tokens: config.jax.maxOutputTokens,
    }],
    ["mastering.defaultPreset", config.mastering.defaultPreset],
  ];
  await db.transaction(async (tx) => {
    for (const [key, value] of values) {
      await tx.insert(adminSettingsTable)
        .values({ key, value: JSON.stringify(value) })
        .onConflictDoUpdate({
          target: adminSettingsTable.key,
          set: { value: JSON.stringify(value), updatedAt: new Date() },
        });
    }
  });
  runtimeConfig = config;
  return config;
}

export async function readAdminSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: adminSettingsTable.value })
    .from(adminSettingsTable)
    .where(eq(adminSettingsTable.key, key))
    .limit(1);
  return row?.value ?? null;
}

export type AudioPreset = {
  name: string;
  basePreset: string;
  saturationDrive: number;
  saturationMix: number;
  bands: Array<{ threshold: number; ratio: number; attack: number; release: number }>;
  airDb: number;
  width: number;
  monoHz: number;
  targetLufs: -14 | -9 | -7;
};

const AUDIO_PRESETS_KEY = "audio.dspPresets";
const AUDIO_DEFAULT_KEY = "audio.dspDefault";
const allowedBases = new Set(["baseline", "spacious", "normal", "broadcast", "vinyl", "podcast", "club", "film", "youtube", "soundcloud", "apple"]);

function numeric(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`${label} must be between ${min} and ${max}`);
  return value;
}

export function validateAudioPreset(input: unknown): AudioPreset {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Preset must be an object");
  const v = input as Record<string, unknown>;
  if (typeof v.name !== "string" || !/^[\w -]{1,64}$/.test(v.name)) throw new Error("Preset name must be 1–64 letters, digits, spaces, underscores or hyphens");
  if (typeof v.basePreset !== "string" || !allowedBases.has(v.basePreset)) throw new Error("Unknown base preset");
  if (!Array.isArray(v.bands) || v.bands.length !== 3) throw new Error("Exactly three dynamics bands are required");
  if (v.targetLufs !== -14 && v.targetLufs !== -9 && v.targetLufs !== -7) throw new Error("Target LUFS must be -14, -9, or -7");
  return {
    name: v.name, basePreset: v.basePreset,
    saturationDrive: numeric(v.saturationDrive, 0, 4, "Saturation drive"),
    saturationMix: numeric(v.saturationMix, 0, 1, "Saturation mix"),
    bands: v.bands.map((band: unknown, i: number) => {
      if (!band || typeof band !== "object") throw new Error(`Band ${i} is invalid`);
      const b = band as Record<string, unknown>;
      return {
        threshold: numeric(b.threshold, -60, 0, `Band ${i} threshold`),
        ratio: numeric(b.ratio, 1, 20, `Band ${i} ratio`),
        attack: numeric(b.attack, 1, 200, `Band ${i} attack`),
        release: numeric(b.release, 10, 2000, `Band ${i} release`),
      };
    }),
    airDb: numeric(v.airDb, -12, 12, "Air EQ"),
    width: numeric(v.width, 0, 2, "Stereo width"),
    monoHz: numeric(v.monoHz, 20, 400, "Mono crossover"),
    targetLufs: v.targetLufs,
  };
}

export async function getAudioPresets(): Promise<{ presets: AudioPreset[]; defaultName: string | null }> {
  const [raw, defaultRaw] = await Promise.all([readAdminSetting(AUDIO_PRESETS_KEY), readAdminSetting(AUDIO_DEFAULT_KEY)]);
  const parsed: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(parsed)) throw new Error("Stored audio preset collection is invalid");
  const presets = parsed.map(validateAudioPreset);
  const defaultName = defaultRaw ? JSON.parse(defaultRaw) as unknown : null;
  if (defaultName !== null && (typeof defaultName !== "string" || !presets.some(p => p.name === defaultName)))
    throw new Error("Stored audio default is missing its preset");
  return { presets, defaultName };
}

export async function saveAudioPreset(preset: AudioPreset, oldName?: string): Promise<void> {
  const validated = validateAudioPreset(preset);
  await db.transaction(async tx => {
    const rows = await tx.select().from(adminSettingsTable);
    const stored = new Map(rows.map(r => [r.key, r.value]));
    const presets = (JSON.parse(stored.get(AUDIO_PRESETS_KEY) ?? "[]") as unknown[]).map(validateAudioPreset);
    const previous = oldName ?? validated.name;
    if (previous !== validated.name && presets.some(p => p.name === validated.name)) throw new Error("Preset name already exists");
    if (oldName && !presets.some(p => p.name === oldName)) throw new Error("Preset to rename does not exist");
    const next = [...presets.filter(p => p.name !== previous), validated];
    const defaultName = JSON.parse(stored.get(AUDIO_DEFAULT_KEY) ?? "null") as string | null;
    await tx.insert(adminSettingsTable).values({ key: AUDIO_PRESETS_KEY, value: JSON.stringify(next) })
      .onConflictDoUpdate({ target: adminSettingsTable.key, set: { value: JSON.stringify(next), updatedAt: new Date() } });
    if (defaultName === previous && previous !== validated.name) await tx.insert(adminSettingsTable)
      .values({ key: AUDIO_DEFAULT_KEY, value: JSON.stringify(validated.name) })
      .onConflictDoUpdate({ target: adminSettingsTable.key, set: { value: JSON.stringify(validated.name), updatedAt: new Date() } });
  });
}

export async function setAudioDefault(name: string): Promise<void> {
  await db.transaction(async tx => {
    const rows = await tx.select().from(adminSettingsTable).where(eq(adminSettingsTable.key, AUDIO_PRESETS_KEY));
    const presets = (JSON.parse(rows[0]?.value ?? "[]") as unknown[]).map(validateAudioPreset);
    if (!presets.some(p => p.name === name)) throw new Error("Preset not found");
    await tx.insert(adminSettingsTable).values({ key: AUDIO_DEFAULT_KEY, value: JSON.stringify(name) })
      .onConflictDoUpdate({ target: adminSettingsTable.key, set: { value: JSON.stringify(name), updatedAt: new Date() } });
  });
}