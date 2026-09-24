import { getObjectFileWithFallback } from "./objectStorage";

export type StoredObjectLookup = (
  bucketId: string,
  objectKey: string,
) => Promise<{ delete(): Promise<unknown> } | null>;

/**
 * Remove every object written before a label publish failed.
 *
 * Cleanup is deliberately best-effort per object: one unavailable object must
 * not prevent the remaining keys from being attempted.
 */
export async function cleanupStoredLabelObjects(
  objectKeys: string[],
  bucketId: string,
  lookup: StoredObjectLookup = getObjectFileWithFallback,
): Promise<void> {
  await Promise.all(objectKeys.map(async (objectKey) => {
    try {
      const file = await lookup(bucketId, objectKey);
      if (file) await file.delete();
    } catch {
      // The publish error remains the response; cleanup must still continue.
    }
  }));
}