import { Download } from "lucide-react";
import { exportQuotaLabel, type ExportQuota } from "@/lib/export-quota-label";

/**
 * Inline pill showing how many WAV/MP3 exports remain in the rolling 30-day
 * window, always with the reset date once one is known. Neutral normally,
 * amber-emphasized at ≤3 remaining, rose at 0 — so the wall is never a
 * surprise 429.
 */
export function ExportQuotaBadge({ quota, className = "" }: { quota: ExportQuota | null; className?: string }) {
  if (!quota) return null;
  const { text, tone } = exportQuotaLabel(quota);

  const toneClass =
    tone === "exhausted"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
      : tone === "low"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-400 font-semibold"
        : "border-border/40 bg-card/40 text-muted-foreground";

  return (
    <span
      data-testid="badge-export-quota"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none ${toneClass} ${className}`}
    >
      <Download className="w-3 h-3 shrink-0" />
      {text}
    </span>
  );
}
