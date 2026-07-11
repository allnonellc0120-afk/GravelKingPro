import {
  createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode,
} from "react";
import { unzipSync } from "fflate";
import { idbGet, idbSet, idbDel } from "./idbStore";

// App-level store for the Voice Splitter.
//
// Why this exists: previously all splitter state (stage, file name, the result
// stems) lived in the page component's useState. Two consequences on iPad:
//   1. Navigating to another tool unmounted the page → state wiped ("clears the
//      queue every time").
//   2. iOS reloading/killing a backgrounded tab (split screen) wiped everything
//      and the in-flight upload died.
//
// By hoisting state AND the processing routine above the router, an in-progress
// split keeps running while the user browses other tools, and the finished
// result is mirrored to IndexedDB so a tab reload restores it instead of losing
// the user's work.

export type SplitStage =
  | "idle" | "uploading" | "analyzing" | "splitting" | "lyrics" | "done" | "error";

export interface StemPair {
  vocalBlob: Blob;
  instrBlob: Blob;
  vocalUrl: string;
  instrUrl: string;
  lyrics: string;
  filename: string;
  remaining: number | null;
}

// What we persist to IndexedDB — the raw blobs + metadata. Object URLs are
// recreated fresh on rehydrate (URLs don't survive a reload).
interface PersistedResult {
  vocalBlob: Blob;
  instrBlob: Blob;
  lyrics: string;
  filename: string;
  remaining: number | null;
}

const IDB_KEY = "splitter:lastResult";

interface SplitterState {
  stage: SplitStage;
  fileName: string;
  stems: StemPair | null;
  errorMsg: string;
  /** True once the initial IndexedDB rehydrate attempt has finished. */
  hydrated: boolean;
  processFile: (file: File) => Promise<void>;
  reset: () => void;
}

const Ctx = createContext<SplitterState | undefined>(undefined);

export function SplitterProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<SplitStage>("idle");
  const [fileName, setFileName] = useState("");
  const [stems, setStems] = useState<StemPair | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const stageTimer1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageTimer2 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlsRef = useRef<string[]>([]);
  // Monotonic id of the current run. Any async step that resolves after a newer
  // run started (or after reset) is ignored so stale results can't clobber live
  // state. `startedRef` blocks a late IDB rehydrate from overwriting an active
  // job. `abortRef` lets reset / a new run cancel the in-flight request.
  const runIdRef = useRef(0);
  const startedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const clearTimers = () => {
    if (stageTimer1.current) clearTimeout(stageTimer1.current);
    if (stageTimer2.current) clearTimeout(stageTimer2.current);
  };

  const revokeUrls = () => {
    for (const u of urlsRef.current) {
      try { URL.revokeObjectURL(u); } catch { /* noop */ }
    }
    urlsRef.current = [];
  };

  // Rehydrate the last completed result on first mount (survives tab reload).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await idbGet<PersistedResult>(IDB_KEY);
        // Bail if the component unmounted, OR the user already started / reset a
        // job while we were reading IDB — otherwise stale stems would overwrite
        // the live run.
        if (cancelled || startedRef.current) return;
        if (saved?.vocalBlob && saved?.instrBlob) {
          const vocalUrl = URL.createObjectURL(saved.vocalBlob);
          const instrUrl = URL.createObjectURL(saved.instrBlob);
          urlsRef.current.push(vocalUrl, instrUrl);
          setStems({
            vocalBlob: saved.vocalBlob,
            instrBlob: saved.instrBlob,
            vocalUrl,
            instrUrl,
            lyrics: saved.lyrics,
            filename: saved.filename,
            remaining: saved.remaining,
          });
          setFileName(saved.filename);
          setStage("done");
        }
      } catch {
        /* ignore rehydrate failures */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const reset = useCallback(() => {
    startedRef.current = true;   // block any still-pending IDB rehydrate
    runIdRef.current += 1;       // invalidate any in-flight run
    abortRef.current?.abort();
    abortRef.current = null;
    clearTimers();
    revokeUrls();
    setStage("idle");
    setFileName("");
    setStems(null);
    setErrorMsg("");
    void idbDel(IDB_KEY);
  }, []);

  const processFile = useCallback(async (file: File) => {
    clearTimers();
    revokeUrls();
    startedRef.current = true;
    const myRun = ++runIdRef.current;

    // Cancel any previous in-flight run before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFileName(file.name);
    setStems(null);
    setErrorMsg("");
    setStage("uploading");
    void idbDel(IDB_KEY);

    stageTimer1.current = setTimeout(() => { if (runIdRef.current === myRun) setStage("analyzing"); }, 2_000);
    stageTimer2.current = setTimeout(() => { if (runIdRef.current === myRun) setStage("splitting"); }, 5_000);

    // Hard 3-min cap — abort the request so it can never hang forever.
    let timedOut = false;
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, 180_000);

    const fd = new FormData();
    fd.append("audio", file);
    fd.append("mode", "stem_split");
    fd.append("multiplier", "0.75");

    try {
      const resp = await fetch("/api/kernel/process-audio", {
        method: "POST",
        body: fd,
        credentials: "include",
        signal: controller.signal,
      });

      clearTimers();
      if (runIdRef.current !== myRun) return; // superseded by a newer run / reset

      if (resp.status === 413) {
        if (runIdRef.current !== myRun) return;
        setStage("error");
        setErrorMsg("File too large for the server — keep uploads under 30 MB. Try a shorter clip.");
        return;
      }
      if (resp.status === 402) {
        const data = await resp.json() as { error: string };
        if (runIdRef.current !== myRun) return;
        setStage("error");
        setErrorMsg(data.error ?? "Free limit reached.");
        return;
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const data = text.startsWith("{") ? JSON.parse(text) : { error: text || "Processing failed" };
        throw new Error(data.error ?? "Processing failed");
      }

      const rem = resp.headers.get("X-GK-Free-Remaining");
      const remaining = rem !== null ? parseInt(rem) : null;

      setStage("lyrics");

      const files = unzipSync(new Uint8Array(await resp.arrayBuffer()));
      if (runIdRef.current !== myRun) return;

      const vocalData = files["GKP_vocals.wav"];
      const instrData = files["GKP_instrumental.wav"];
      if (!vocalData || !instrData) throw new Error("Missing stems in server response.");

      const vocalBlob = new Blob([vocalData], { type: "audio/wav" });
      const instrBlob = new Blob([instrData], { type: "audio/wav" });

      let lyrics = "";
      try {
        const tfd = new FormData();
        tfd.append("audio", vocalBlob, "vocal.wav");
        const tres = await fetch("/api/audio/transcribe", {
          method: "POST", body: tfd, credentials: "include", signal: controller.signal,
        });
        if (tres.ok) {
          const td = await tres.json() as { fullText?: string };
          lyrics = td.fullText ?? "";
        }
      } catch {
        // Non-critical — lyrics are a bonus
      }

      // Only commit (and create object URLs) for the winning run.
      if (runIdRef.current !== myRun) return;

      const vocalUrl = URL.createObjectURL(vocalBlob);
      const instrUrl = URL.createObjectURL(instrBlob);
      urlsRef.current.push(vocalUrl, instrUrl);

      setStems({ vocalBlob, instrBlob, vocalUrl, instrUrl, lyrics, filename: file.name, remaining });
      setStage("done");

      // Mirror the finished result to IndexedDB so it survives a tab reload /
      // iOS memory kill. Best-effort: failures here don't affect the live UI.
      void idbSet(IDB_KEY, {
        vocalBlob, instrBlob, lyrics, filename: file.name, remaining,
      } satisfies PersistedResult);
    } catch (err: unknown) {
      clearTimers();
      if (runIdRef.current !== myRun) return; // superseded — stay silent
      setStage("error");
      const name = (err as { name?: string } | null)?.name;
      const isTimeout = timedOut || name === "TimeoutError" || name === "AbortError";
      const msg = isTimeout
        ? "The file took too long to process. Try a shorter clip (under 5 minutes) or an MP3/WAV instead of a video file."
        : ((err as { message?: string } | null)?.message ?? "Something went wrong.");
      setErrorMsg(msg);
    } finally {
      clearTimeout(timeoutId);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  return (
    <Ctx.Provider value={{ stage, fileName, stems, errorMsg, hydrated, processFile, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSplitter(): SplitterState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSplitter must be used within SplitterProvider");
  return ctx;
}
