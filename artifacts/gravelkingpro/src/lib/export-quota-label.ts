/** Pure presentation logic for the rolling 30-day export quota — kept free of
 *  React so it can be unit-tested with plain node:test. */

export interface ExportQuota {
  used: number;
  limit: number;
  remaining: number;
  /** null until the first export of the current window has been consumed */
  resetsAt: string | null;
}

/** "Sep 13" style short date for the quota reset moment. */
export function formatResetDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export type QuotaTone = "normal" | "low" | "exhausted";

/** Badge text + emphasis for a quota snapshot. Low (≤3) gets amber emphasis;
 *  0 gets rose and spells out the reset date. */
export function exportQuotaLabel(quota: ExportQuota): { text: string; tone: QuotaTone } {
  const { remaining, limit, resetsAt } = quota;
  const resetDate = formatResetDate(resetsAt);
  if (remaining <= 0) {
    return { text: `Export limit reached — resets ${resetDate}`.trimEnd(), tone: "exhausted" };
  }
  return {
    text: `${remaining} of ${limit} exports left${resetDate ? ` · resets ${resetDate}` : ""}`,
    tone: remaining <= 3 ? "low" : "normal",
  };
}
