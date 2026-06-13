import { useState, useEffect, useCallback, useRef } from "react";
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
  const [level, setLevel] = useState(0);

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

  // ── live input-level monitoring ──
  // While the picker is open (and not actively recording), open a temporary
  // getUserMedia stream on the selected device, run it through an AnalyserNode,
  // and drive a VU bar. Everything is torn down when the menu closes or the
  // device changes so the mic is released and no context leaks.
  const monitorRef = useRef<{
    stream: MediaStream;
    ctx: AudioContext;
    raf: number;
  } | null>(null);

  const stopMonitor = useCallback(() => {
    const m = monitorRef.current;
    if (!m) return;
    monitorRef.current = null;
    cancelAnimationFrame(m.raf);
    m.stream.getTracks().forEach(t => t.stop());
    void m.ctx.close().catch(() => {});
    setLevel(0);
  }, []);

  useEffect(() => {
    if (!menuOpen || isRecording) {
      stopMonitor();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) return;

    let cancelled = false;

    (async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio:
            selectedId !== DEFAULT_VALUE
              ? { deviceId: { exact: selectedId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
              : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        const data = new Float32Array(analyser.fftSize);

        const tick = () => {
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
          const rms = Math.sqrt(sum / data.length);
          // Smooth the bar: rise fast, fall a little slower for a natural VU feel.
          setLevel(prev => {
            const next = Math.min(1, rms * 3.5);
            return next > prev ? next : prev * 0.82 + next * 0.18;
          });
          const raf = requestAnimationFrame(tick);
          if (monitorRef.current) monitorRef.current.raf = raf;
        };

        monitorRef.current = { stream, ctx, raf: requestAnimationFrame(tick) };
      } catch {
        // Permission denied / device busy — silently skip; the recording flow
        // surfaces a toast on the real attempt.
      }
    })();

    return () => {
      cancelled = true;
      stopMonitor();
    };
  }, [menuOpen, isRecording, selectedId, stopMonitor]);

  useEffect(() => stopMonitor, [stopMonitor]);

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

  const SEGMENTS = 12;
  const litSegments = Math.round(level * SEGMENTS);

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
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground">Input level</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {Math.round(level * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-[2px] h-3" aria-hidden>
              {Array.from({ length: SEGMENTS }).map((_, i) => {
                const lit = i < litSegments;
                const color =
                  i >= SEGMENTS - 2
                    ? "bg-red-500"
                    : i >= SEGMENTS - 5
                      ? "bg-yellow-400"
                      : "bg-green-500";
                return (
                  <div
                    key={i}
                    className={`flex-1 h-full rounded-[1px] transition-colors duration-75 ${
                      lit ? color : "bg-white/10"
                    }`}
                  />
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Speak or play to confirm the right input is selected.
            </p>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
