/**
 * Canonical studio voice registry.
 *
 * The GravelKing weights remain under their stable Object Storage keys because
 * those are the validated, trained artifacts. The registry gives the active
 * production model its human-facing identity without duplicating large files.
 */
import { GRAVELKING_RVC_DEFAULTS } from "../replicateClient";

export const STUDIO_VOICE_REGISTRY = {
  gravelking_outlaw_baritone: {
    presetId: "gravelking_outlaw_baritone",
    label: "Voice: GravelKing (Baritone)",
    kind: "rvc" as const,
    weightKey: "models/gravelking_v2.pth",
    indexKey: "models/gravelking_v2.index",
    pitchDetectionAlgorithm: GRAVELKING_RVC_DEFAULTS.f0Method,
    pitchShift: 0,
    indexRate: GRAVELKING_RVC_DEFAULTS.indexRate,
    filterRadius: GRAVELKING_RVC_DEFAULTS.filterRadius,
    protect: GRAVELKING_RVC_DEFAULTS.protect,
  },
} as const;

export type StudioVoicePresetId = keyof typeof STUDIO_VOICE_REGISTRY;

export function getStudioVoiceRegistry() {
  return {
    male: {
      ...STUDIO_VOICE_REGISTRY.gravelking_outlaw_baritone,
      voiceId: undefined,
    },
  };
}