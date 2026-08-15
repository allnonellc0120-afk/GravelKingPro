/**
 * Bounded retry for Stripe's `idempotency_key_in_use` conflict.
 *
 * When two concurrent requests send the SAME idempotency key, Stripe does not
 * always return the eventual object to both: while the first request is still
 * executing, the second gets an `idempotency_key_in_use` error (HTTP 409).
 * Without a retry, a concurrent boot aborts its seed pass and a concurrent
 * checkout caller gets a 500 — exactly the races the keys exist to defuse.
 *
 * Retrying the identical request after a short backoff returns the completed
 * first request's stored response (that is the idempotency contract), so both
 * callers converge on one object.
 */
export async function withIdempotencyRetry<T>(
  fn: () => Promise<T>,
  { attempts = 4, baseDelayMs = 300 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== "idempotency_key_in_use") throw err;
      lastErr = err;
      // Exponential backoff: 300ms, 600ms, 1200ms between attempts.
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
      }
    }
  }
  throw lastErr;
}
