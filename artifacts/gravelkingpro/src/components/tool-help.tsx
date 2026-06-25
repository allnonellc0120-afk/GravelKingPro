import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ToolHelpProps {
  /** Tool name, shown as the popover heading. */
  title: string;
  /** One or two sentences on what the tool does. */
  summary: string;
  /** Ordered "how to use" steps. */
  steps: string[];
  /** Optional honest caveat (e.g. "approximate", "bleeds") shown at the bottom. */
  note?: string;
  /** Which side the popover opens toward. */
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * A small "?" icon that opens a short help popover explaining a tool and how to
 * use it. Drop it next to a tool page's title.
 */
export function ToolHelp({ title, summary, steps, note, side = "bottom" }: ToolHelpProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`How to use ${title}`}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-border/50 text-muted-foreground hover:text-amber-500 hover:border-amber-500/50 transition-colors shrink-0"
          data-testid="button-tool-help"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        className="w-80 bg-card border-border/60 text-left"
        data-testid="popover-tool-help"
      >
        <div className="space-y-3">
          <div>
            <p className="text-sm font-bold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{summary}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500/90 mb-1.5">
              How to use
            </p>
            <ol className="space-y-1.5">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="flex items-center justify-center shrink-0 w-4 h-4 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          {note && (
            <p className="text-[11px] text-muted-foreground/80 italic border-t border-border/30 pt-2 leading-relaxed">
              {note}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
