import { useState, useEffect, useCallback } from "react";
import { Mic, Square, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

interface Props {
  isRecording: boolean;
  disabled: boolean;
  listInputDevices: () => Promise<MediaDeviceInfo[]>;
  onStart: (deviceId?: string) => void;
  onStop: () => void;
}

const DEFAULT_VALUE = "__default__";
const STORAGE_KEY = "gk:daw:inputDeviceId";

function loadSavedDevice(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_VALUE;
  } catch {
    return DEFAULT_VALUE;
  }
}

export function RecordControls({ isRecording, disabled, listInputDevices, onStart, onStop }: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>(loadSavedDevice);
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshDevices = useCallback(async () => {
    const all = await listInputDevices();
    // Before mic permission is granted, enumerateDevices returns placeholder
    // entries with empty deviceId/label — drop those so the menu only lists
    // selectable inputs.
    const list = all.filter(d => d.deviceId);
    setDevices(list);
    // If the previously chosen device disappeared (unplugged), fall back to
    // default — but only when we can actually enumerate inputs. Before mic
    // permission is granted the list is empty, so keep the saved choice rather
    // than wiping it; it will be validated once the devices become known.
    setSelectedId(prev =>
      prev !== DEFAULT_VALUE && list.length > 0 && !list.some(d => d.deviceId === prev)
        ? DEFAULT_VALUE
        : prev
    );
  }, [listInputDevices]);

  // Persist the chosen input so it is restored on the next visit.
  useEffect(() => {
    try {
      if (selectedId === DEFAULT_VALUE) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, selectedId);
    } catch {
      /* localStorage unavailable — selection simply won't persist */
    }
  }, [selectedId]);

  useEffect(() => {
    if (menuOpen) refreshDevices();
  }, [menuOpen, refreshDevices]);

  useEffect(() => {
    // Validate the restored selection against currently-connected inputs on load.
    refreshDevices();
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    md.addEventListener("devicechange", refreshDevices);
    return () => md.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices]);

  const handleRecordClick = () => {
    if (isRecording) {
      onStop();
    } else {
      onStart(selectedId === DEFAULT_VALUE ? undefined : selectedId);
    }
  };

  const selectedDevice = devices.find(d => d.deviceId === selectedId);
  const selectedLabel =
    selectedId === DEFAULT_VALUE || !selectedDevice
      ? "System default"
      : selectedDevice.label || "Microphone";

  return (
    <div className="flex items-center">
      <button
        onClick={handleRecordClick}
        disabled={disabled}
        title={isRecording ? "Stop recording" : `Record from: ${selectedLabel}`}
        className={`flex items-center gap-1.5 text-xs rounded-l px-2.5 py-1 border transition-colors disabled:opacity-40 ${
          isRecording
            ? "text-white bg-red-500/80 border-red-400/60 animate-pulse"
            : "text-red-400 hover:text-red-300 border-red-500/25 hover:border-red-400/40"
        }`}
      >
        {isRecording ? <><Square className="w-3 h-3" /> Stop</> : <><Mic className="w-3 h-3" /> Record</>}
      </button>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            disabled={isRecording}
            title="Choose audio input"
            className="flex items-center justify-center rounded-r border border-l-0 px-1 py-1 text-red-400 hover:text-red-300 border-red-500/25 hover:border-red-400/40 transition-colors disabled:opacity-40 -ml-px"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs">Audio input</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={selectedId} onValueChange={setSelectedId}>
            <DropdownMenuRadioItem value={DEFAULT_VALUE} className="text-xs">
              System default
            </DropdownMenuRadioItem>
            {devices.map((d, i) => (
              <DropdownMenuRadioItem key={d.deviceId || i} value={d.deviceId} className="text-xs">
                {d.label || `Microphone ${i + 1}`}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {devices.length === 0 && (
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
              No inputs detected yet. Allow microphone access, then reopen this menu.
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
