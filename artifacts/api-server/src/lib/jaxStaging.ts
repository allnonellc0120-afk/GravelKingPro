import { randomUUID } from "node:crypto";
import { db, adminSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { appendJaxUplink, JAX_SAL_CODES } from "./jaxUplink";

export const JAX_STAGING_KEY = "jax.json_staging";
const MAX_STAGED_ITEMS = 50;
const MAX_PAYLOAD_BYTES = 40_000;

export type JaxStagedProposal = {
  id: string;
  stagedAt: string;
  actorId: string | null;
  payload: Record<string, unknown>;
};

async function readItems(): Promise<JaxStagedProposal[]> {
  const [row] = await db.select({ value: adminSettingsTable.value })
    .from(adminSettingsTable)
    .where(eq(adminSettingsTable.key, JAX_STAGING_KEY))
    .limit(1);
  if (!row?.value) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed as JaxStagedProposal[] : [];
  } catch {
    return [];
  }
}

export async function listJaxStagedProposals(): Promise<JaxStagedProposal[]> {
  return readItems();
}

export async function stageJaxProposal(
  payload: Record<string, unknown>,
  actorId: string | null,
): Promise<JaxStagedProposal> {
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new Error("JSON proposal is larger than the 40 KB staging limit.");
  }
  const item: JaxStagedProposal = {
    id: randomUUID(),
    stagedAt: new Date().toISOString(),
    actorId,
    payload,
  };
  const next = [item, ...(await readItems())].slice(0, MAX_STAGED_ITEMS);
  await db.insert(adminSettingsTable)
    .values({ key: JAX_STAGING_KEY, value: JSON.stringify(next), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: adminSettingsTable.key,
      set: { value: JSON.stringify(next), updatedAt: new Date() },
    });
  void appendJaxUplink(JAX_SAL_CODES.patch, "staging.append", { actorId, proposalId: item.id });
  return item;
}

export async function clearJaxStagedProposals(): Promise<void> {
  await db.delete(adminSettingsTable).where(eq(adminSettingsTable.key, JAX_STAGING_KEY));
}