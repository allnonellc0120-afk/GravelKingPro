import { EventEmitter } from "events";

export type TelemetryEvent = {
  routing: "remote" | "local";
  parity: string;
  efficiency: string;
  decayRate: string;
  sampleCount: string;
  timestamp: string;
  remoteUrl?: string | null;
};

export type RemoteAlertReason =
  | "non_ok_status"
  | "wrong_content_type"
  | "invalid_wav"
  | "request_failed";

export type RemoteAlertEvent = {
  reason: RemoteAlertReason;
  remoteUrl: string;
  detail?: string;
  timestamp: string;
};

export const telemetryBus = new EventEmitter();
telemetryBus.setMaxListeners(100);
