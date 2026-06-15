import { getOrCreateSession } from "./session";

export const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const session = await getOrCreateSession();
  const url = `${API_BASE}${path}`;
  const existingHeaders = (options?.headers ?? {}) as Record<string, string>;
  const headers: Record<string, string> = {
    ...existingHeaders,
    Cookie: `gk_session=${session}`,
  };
  return fetch(url, { ...options, headers });
}
