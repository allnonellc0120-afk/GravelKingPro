import { appendJaxUplink, JAX_SAL_CODES } from "./jaxUplink";

// Deliberately process-local and fail-closed. This is not persisted in admin
// settings: a server cold start always disables paid voice inference.
let enabled = false;

export function isJaxVoiceEngineEnabled(): boolean {
  return enabled;
}

export function setJaxVoiceEngineEnabled(next: boolean): boolean {
  enabled = next === true;
  void appendJaxUplink(JAX_SAL_CODES.exec, enabled ? "voice.enable" : "voice.disable", "explicit owner control");
  return enabled;
}