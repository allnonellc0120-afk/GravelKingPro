import { EventEmitter } from "events";

export type TelemetryEvent = {
  routing: "remote" | "local";
  parity: string;
  efficiency: string;
  decayRate: string;
  sampleCount: string;
  timestamp: string;
  remoteUrl: string | null;
};

export type RemoteInvalidReason =
  | "non_ok_status"
  | "invalid_content_type"
  | "invalid_wav"
  | "request_failed";

export type RemoteAlertEvent = {
  type: "remote_invalid_output";
  reason: RemoteInvalidReason;
  remoteUrl: string;
  detail: string;
  timestamp: string;
};

export const telemetryBus = new EventEmitter();
telemetryBus.setMaxListeners(100);
