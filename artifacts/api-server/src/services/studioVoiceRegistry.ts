/**
 * Canonical studio voice registry.
 *
 * The GravelKing weights remain under their stable Object Storage keys because
 * those are the validated, trained artifacts. The registry gives the active
 * production model its human-facing identity without duplicating large files.
 */
export const STUDIO_VOICE_REGISTRY = {
  gravelking_outlaw_baritone: {
    presetId: "gravelking_outlaw_baritone",
    label: "Voice: GravelKing (Baritone)",
    kind: "rvc" as const,
    weightKey: "models/gravelking_v2.pth",
    indexKey: "models/gravelking_v2.index",
    pitchDetectionAlgorithm: "rmvpe" as const,
    pitchShift: 0,
    indexRate: 0.78,
    filterRadius: 3,
    protect: 0.02,
  },
  female_soul_lead: {
    presetId: "female_soul_lead",
    label: "Voice: City Rain (Female Lead)",
    kind: "tts" as const,
    // This is a public ElevenLabs voice identifier, not a credential. It can
    // be replaced by deployment configuration without changing the preset id.
    voiceId: () => process.env.JAX_FEMALE_SOUL_LEAD_VOICE_ID?.trim() || "EXAVITQu4vr4xnSDxMaL",
    timbre: "City Rain",
  },
} as const;

export type StudioVoicePresetId = keyof typeof STUDIO_VOICE_REGISTRY;

export function getStudioVoiceRegistry() {
  return {
    male: {
      ...STUDIO_VOICE_REGISTRY.gravelking_outlaw_baritone,
      voiceId: undefined,
    },
    female: {
      ...STUDIO_VOICE_REGISTRY.female_soul_lead,
      voiceId: STUDIO_VOICE_REGISTRY.female_soul_lead.voiceId(),
    },
  };
}