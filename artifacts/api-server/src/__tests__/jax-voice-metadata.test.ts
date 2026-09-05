import assert from "node:assert/strict";

const GEORGE_PREMADE_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

process.env.JAX_VOICE_ID = GEORGE_PREMADE_VOICE_ID;
const { configuredAdminVoiceLabel, getJaxVoiceMetadata, JAX_VOICE_PRESETS } = await import("../routes/jax.js");

assert.equal(configuredAdminVoiceLabel(), "George (Premade)");
assert.equal(JAX_VOICE_PRESETS.admin.voiceId(), GEORGE_PREMADE_VOICE_ID);
assert.deepEqual(getJaxVoiceMetadata().find((voice) => voice.key === "admin"), {
  key: "admin",
  voiceId: "admin",
  label: "George (Premade)",
});

process.env.JAX_VOICE_ID = "some-other-configured-voice";
assert.equal(configuredAdminVoiceLabel(), "Admin Configured Voice");
assert.equal(JAX_VOICE_PRESETS.admin.voiceId(), "some-other-configured-voice");
assert.deepEqual(getJaxVoiceMetadata().find((voice) => voice.key === "admin"), {
  key: "admin",
  voiceId: "admin",
  label: "Admin Configured Voice",
});

console.log("JAX voice metadata regression checks passed");