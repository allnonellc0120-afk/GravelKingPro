import { getOrCreateSession } from "./session";

export const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

const PROCESS_TIMEOUT_MS = 3 * 60 * 1000;

export async function apiFetch(
  path: string,
  options?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const session = await getOrCreateSession();
  const url = `${API_BASE}${path}`;
  const existingHeaders = (options?.headers ?? {}) as Record<string, string>;
  const headers: Record<string, string> = {
    ...existingHeaders,
    Cookie: `gk_session=${session}`,
  };

  const timeoutMs = options?.timeoutMs ?? PROCESS_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { timeoutMs: _ignored, ...fetchOptions } = options ?? {};
    return await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Processing took too long — please try a shorter file or try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
