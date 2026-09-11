/**
 * Guarded live RVC smoke test.
 *
 * Usage:
 *   RVC_TEST_AUDIO_URL=https://... pnpm --filter @workspace/api-server run test:rvc
 *
 * This intentionally requires an explicit public audio URL. It creates a real
 * Replicate prediction and may incur provider usage; it never runs during the
 * normal test suite or API startup.
 */
const audioUrl = process.env.RVC_TEST_AUDIO_URL?.trim();
if (!audioUrl) {
  console.error("Set RVC_TEST_AUDIO_URL to a public clean-vocal audio URL before running the live RVC test.");
  process.exit(2);
}

const { convertToGravelKingVoice, DEFAULT_RVC_MODEL } = await import("../src/replicateClient.ts");
const outputUrl = await convertToGravelKingVoice({
  audioUrl,
  modelWeightsUrl: process.env.RVC_TEST_MODEL_WEIGHTS_URL?.trim() || undefined,
  pitchShift: Number(process.env.RVC_TEST_PITCH_SHIFT ?? 0),
  indexRate: Number(process.env.RVC_TEST_INDEX_RATE ?? 0.8),
});

console.log(JSON.stringify({
  ok: true,
  model: process.env.REPLICATE_RVC_MODEL || DEFAULT_RVC_MODEL,
  outputUrl,
}));