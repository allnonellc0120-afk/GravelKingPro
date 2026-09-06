import { useCallback, useEffect, useState } from "react";
import type { ExportQuota } from "@/lib/export-quota-label";

export { formatResetDate, type ExportQuota } from "@/lib/export-quota-label";

/** Fetches the rolling 30-day export quota without consuming anything.
 *  `refresh()` after a successful server-side export so the count stays honest. */
export function useExportQuota(): { quota: ExportQuota | null; refresh: () => Promise<void> } {
  const [quota, setQuota] = useState<ExportQuota | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/usage/status", { credentials: "include" });
      if (!r.ok) return;
      const d = (await r.json()) as { exports?: ExportQuota };
      if (d.exports && typeof d.exports.limit === "number") setQuota(d.exports);
    } catch {
      /* offline — leave as-is */
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { quota, refresh };
}
