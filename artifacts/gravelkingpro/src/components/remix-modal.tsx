/**
 * MLK v3.5 Remix Engine modal (Mastering Tool).
 *
 * The loaded track's original prompt + MLK profile stay server-side as the
 * hidden base anchor — the user only supplies an optional new twist. Vocals
 * can be toggled ON (model-written lyrics) or OFF (strict instrumental).
 * The remix runs the REAL MLK v3.5 master pipeline and gets a child IP cert
 * linked to the parent track, then auto-loads back into the Mastering Tool.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Shuffle, AlertTriangle, Mic, MicOff, Sparkles } from "lucide-react";
import { StyleTagPills, appendStyleTag } from "@/components/style-tag-pills";
import { useToast } from "@/hooks/use-toast";

export function RemixModal({
  open,
  onOpenChange,
  parentTrackId,
  parentTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentTrackId: string;
  parentTitle: string;
}) {
  const { toast } = useToast();
  const [twist, setTwist] = useState("");
  const [vocalsOn, setVocalsOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemix = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mlk/v35/remix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ parentTrackId, twist: twist.trim(), vocalsOn }),
      });
      const data = (await res.json()) as { error?: string; code?: string; trackId?: string; title?: string };
      if (!res.ok || !data.trackId) {
        const msg = data.error || `Remix failed (HTTP ${res.status})`;
        // Upstream AI safety filter rejected the prompt — coach, don't scare.
        if (res.status === 422 || data.code === "content_blocked") {
          toast({ title: "Prompt flagged", description: msg, variant: "destructive" });
        }
        throw new Error(msg);
      }
      // Full reload with the new track id re-runs the Mastering Tool's vault
      // preload — the remix lands ready to master, exactly like a generation.
      window.location.assign(
        `${window.location.pathname}?gkTrack=${encodeURIComponent(data.trackId)}&gkTitle=${encodeURIComponent(data.title ?? `${parentTitle} (Remix)`)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remix failed.");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shuffle className="w-4 h-4 text-emerald-400" />
            Remix with MLK v3.5
          </DialogTitle>
          <DialogDescription>
            Spins a new variation of <span className="font-semibold text-foreground">“{parentTitle}”</span> that
            keeps its identity, remasters it through the MLK v3.5 kernel, and issues a child IP
            cert linked to the original.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vocal toggle: ON = model-written lyrics, OFF = strict instrumental */}
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/40 px-3 py-2.5">
            <div className="flex items-center gap-2">
              {vocalsOn ? <Mic className="w-4 h-4 text-emerald-400" /> : <MicOff className="w-4 h-4 text-muted-foreground" />}
              <div>
                <p className="text-sm font-semibold">Lyrics {vocalsOn ? "ON" : "OFF"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {vocalsOn ? "AI writes and sings new lyrics for the remix." : "Instrumental only — no vocals."}
                </p>
              </div>
            </div>
            <Switch checked={vocalsOn} onCheckedChange={setVocalsOn} aria-label="Lyrics on or off" />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Your twist <span className="opacity-70">(optional — the original’s style stays as the base)</span>
            </p>
            <Textarea
              value={twist}
              onChange={(e) => setTwist(e.target.value)}
              placeholder={"e.g. slow it down, swap the drums for live percussion, add southern harmonica…"}
              className="min-h-[80px] resize-none bg-background/60 border-border/50 focus:border-emerald-500/50"
              maxLength={400}
            />
            <StyleTagPills
              lyricsOn={vocalsOn}
              onAppend={(tag) => setTwist((p) => appendStyleTag(p, tag).slice(0, 400))}
            />
          </div>

          <Button
            onClick={() => void handleRemix()}
            disabled={busy}
            className="w-full font-bold bg-emerald-500 hover:bg-emerald-600 text-black"
          >
            {busy
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Remixing + mastering (2–4 min)…</>
              : <><Shuffle className="w-4 h-4 mr-2" />Remix Track with MLK v3.5</>}
          </Button>
          {busy && (
            <p className="text-[10px] font-medium text-sky-300/80 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3" /> AI Optimized for Production Sound
            </p>
          )}

          {error && (
            <p className="text-xs text-rose-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
