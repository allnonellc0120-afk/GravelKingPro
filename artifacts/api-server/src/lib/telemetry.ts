import { EventEmitter } from "events";

export type TelemetryEvent = {
  routing: "local" | "remote";
  parity: string;
  efficiency: string;
  decayRate: string;
  sampleCount: string;
  timestamp: string;
};

export const telemetryBus = new EventEmitter();
telemetryBus.setMaxListeners(100);
