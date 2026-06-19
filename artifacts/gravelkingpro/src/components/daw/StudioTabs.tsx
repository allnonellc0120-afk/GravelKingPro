import { Disc3, Mic, Wrench, Layers } from "lucide-react";

export type StudioTab = "mixer" | "drums" | "recorder" | "plugins";

interface StudioTabsProps {
  active: StudioTab;
  onChange: (tab: StudioTab) => void;
  trackCount: number;
  canAddTrack: boolean;
}

const TABS: Array<{ id: StudioTab; label: string; icon: React.ReactNode; disabled?: (p: StudioTabsProps) => boolean }> = [
  { id: "mixer", label: "Mixer", icon: <Layers className="w-5 h-5" /> },
  { id: "drums", label: "Drums", icon: <Disc3 className="w-5 h-5" /> },
  { id: "recorder", label: "Record", icon: <Mic className="w-5 h-5" /> },
  { id: "plugins", label: "Plugins", icon: <Wrench className="w-5 h-5" /> },
];

export function StudioTabs({ active, onChange, trackCount, canAddTrack }: StudioTabsProps) {
  return (
    <div className="fixed bottom-[72px] sm:bottom-[84px] left-0 right-0 z-40 bg-black/80 backdrop-blur-md border-t border-border/20 px-2 py-1.5 flex items-center justify-center gap-1 sm:gap-2">
      {TABS.map(tab => {
        const isActive = active === tab.id;
        const disabled = tab.disabled?.({ active, onChange, trackCount, canAddTrack }) ?? false;
        return (
          <button
            key={tab.id}
            onClick={() => !disabled && onChange(tab.id)}
            disabled={disabled}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[64px] sm:min-w-[72px] ${
              isActive
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
          >
            {tab.icon}
            <span className="text-[10px] sm:text-xs font-medium">{tab.label}</span>
          </button>
        );
      })}
      <div className="ml-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="font-mono">{trackCount}/8</span>
      </div>
    </div>
  );
}
