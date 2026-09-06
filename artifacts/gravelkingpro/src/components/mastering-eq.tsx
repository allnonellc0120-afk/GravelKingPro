import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { MASTERING_EQ_BANDS } from "@/lib/mastering-eq";

interface MasteringEqProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bandGains: readonly number[];
  postEqGain: number;
  onBandGainChange: (index: number, value: number) => void;
  onPostEqGainChange: (value: number) => void;
  onReset: () => void;
}

function formatDb(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

export function MasteringEqPanel({
  open,
  onOpenChange,
  bandGains,
  postEqGain,
  onBandGainChange,
  onPostEqGainChange,
  onReset,
}: MasteringEqProps) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="flex min-w-0 items-center gap-2 text-left"
          aria-expanded={open}
          data-testid="button-toggle-mastering-eq"
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-amber-300" />
          <span>
            <span className="block text-sm font-semibold text-amber-200">Fine-Tune EQ</span>
            <span className="block text-[11px] text-muted-foreground">
              Shape the mastered preview and export
            </span>
          </span>
        </button>
        {open && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            data-testid="button-reset-mastering-eq"
          >
            <RotateCcw className="h-3 w-3" />
            Reset flat
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-5 gap-x-2 gap-y-4 sm:grid-cols-10">
            {MASTERING_EQ_BANDS.map((band, index) => {
              const value = bandGains[index] ?? 0;
              return (
                <label
                  key={band.frequency}
                  className="flex flex-col items-center gap-2 text-[10px] text-muted-foreground"
                >
                  <span className="h-4 font-semibold tabular-nums text-amber-200">
                    {value > 0 ? "+" : ""}
                    {value.toFixed(1)}
                  </span>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={value}
                    aria-label={`${band.frequency} Hz EQ gain`}
                    data-testid={`slider-eq-${band.frequency}`}
                    onChange={(event) => onBandGainChange(index, Number(event.target.value))}
                    className="h-28 w-2 cursor-pointer accent-amber-400 [writing-mode:vertical-lr] [direction:rtl]"
                  />
                  <span className="font-medium">{band.label} Hz</span>
                </label>
              );
            })}
          </div>

          <div className="space-y-2 border-t border-amber-500/15 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-200">Post-EQ gain</p>
                <p className="text-[10px] text-muted-foreground">
                  Final level after the tone shape
                </p>
              </div>
              <span className="text-sm font-bold tabular-nums text-amber-200">
                {formatDb(postEqGain)}
              </span>
            </div>
            <input
              type="range"
              min={-12}
              max={6}
              step={0.5}
              value={postEqGain}
              aria-label="Post-EQ gain"
              data-testid="slider-post-eq-gain"
              onChange={(event) => onPostEqGainChange(Number(event.target.value))}
              className="h-2 w-full cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/60">
              <span>−12 dB</span>
              <span>0 dB</span>
              <span>+6 dB</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}