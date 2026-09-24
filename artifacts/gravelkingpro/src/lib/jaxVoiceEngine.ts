export const JAX_VOICE_ENGINE_EVENT = "gkp-jax-voice-engine-change";

export function publishJaxVoiceEngine(enabled: boolean): void {
  window.dispatchEvent(new CustomEvent(JAX_VOICE_ENGINE_EVENT, {
    detail: { enabled: enabled === true },
  }));
}