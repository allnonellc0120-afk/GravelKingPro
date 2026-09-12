/**
 * Background-only Replicate prediction waiter.
 *
 * Client-facing routes must never import this module. They create durable jobs
 * and dispatch work; only detached workers wait for remote inference.
 */
import { createPrediction, getReplicateClient } from "./replicateClient";

export async function waitForPrediction(
  id: string,
  timeoutMs = 180_000,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  let delayMs = 2_000;
  const replicate = getReplicateClient();

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(`Replicate prediction ${id} timed out after ${timeoutMs}ms`);
    }
    const prediction = await replicate.predictions.get(id);
    if (prediction.status === "succeeded") return prediction.output;
    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(
        `Replicate prediction ${prediction.status}: ${prediction.error ?? "unknown error"}`,
      );
    }
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(delayMs * 1.5, 10_000);
  }
}

export async function runModel(
  owner: string,
  name: string,
  input: Record<string, unknown>,
  timeoutMs = 180_000,
): Promise<unknown> {
  const id = await createPrediction(owner, name, input);
  return waitForPrediction(id, timeoutMs);
}