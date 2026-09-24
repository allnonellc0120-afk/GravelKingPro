import assert from "node:assert/strict";

const { configuredAdminVoiceLabel, getJaxVoiceMetadata, JAX_VOICE_PRESETS } =
  await import("../routes/jax.js");

assert.equal(configuredAdminVoiceLabel(), "JAX GravelKing Outlaw Baritone (MLK/RVC)");
assert.equal(
  JAX_VOICE_PRESETS.gravelking_outlaw_baritone.voiceId(),
  "gravelking_outlaw_baritone",
);
assert.deepEqual(getJaxVoiceMetadata(), [{
  key: "gravelking_outlaw_baritone",
  voiceId: "gravelking_outlaw_baritone",
  label: "JAX GravelKing Outlaw Baritone (MLK/RVC)",
  pipeline: "MLK/RVC native inference",
  engine: "Morris Law Kernel V2",
}]);

console.log("JAX voice metadata regression checks passed");