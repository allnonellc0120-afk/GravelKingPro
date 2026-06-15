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

export const telemetryBus = new EventEmitter();
telemetryBus.setMaxListeners(100);
