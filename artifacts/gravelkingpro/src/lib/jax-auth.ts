export type JaxTokenGetter = () => Promise<string | null | undefined>;

/**
 * Build the headers shared by every authenticated JAX writing request.
 *
 * Keeping token retrieval in one small browser-safe helper makes it possible
 * to regression-test the Clerk bearer contract without invoking the Clerk UI.
 */
export async function getJaxRequestHeaders(
  getToken: JaxTokenGetter,
  accept?: string,
): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    "Content-Type": "application/json",
    ...(accept ? { Accept: accept } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
