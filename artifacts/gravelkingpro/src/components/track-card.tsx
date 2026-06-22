import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Play, Pause, Loader2 } from "lucide-react";

export interface LabelTrack {
  id: string;
  title: string;
  artistName: string;
  audioPreviewKey: string;
  coverArtKey: string;
  price: number;
}

const PREVIEW_MAX_SECONDS = 30;

export function TrackCard({
  t,
  buying,
  onBuy,
  showArtist = true,
}: {
  t: LabelTrack;
  buying: string | null;
  onBuy: (id: string) => void;
  showArtist?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const stop = () => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPlaying(false);
    setElapsed(0);
  };

  const togglePreview = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      stop();
    } else {
      el.currentTime = 0;
      el.play().then(() => { if (!el.paused) setPlaying(true); }).catch(() => setPlaying(false));
    }
  };

  const onTimeUpdate = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.currentTime >= PREVIEW_MAX_SECONDS) {
      stop();
      return;
    }
    setElapsed(el.currentTime);
  };

  const remaining = Math.max(0, PREVIEW_MAX_SECONDS - Math.floor(elapsed));

  return (
    <Card className="border-border/40 bg-card/40 overflow-hidden group">
      <div className="relative aspect-square bg-secondary/20 overflow-hidden">
        <img
          src={`/api/storage/public-objects/${t.coverArtKey}`}
          alt={t.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <button
          type="button"
          onClick={togglePreview}
          aria-label={playing ? "Stop preview" : "Play 30 second preview"}
          className="absolute bottom-2 right-2 w-11 h-11 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg hover:bg-amber-400 transition-colors"
        >
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>
        <audio
          ref={audioRef}
          src={`/api/storage/public-objects/${t.audioPreviewKey}`}
          onEnded={stop}
          onTimeUpdate={onTimeUpdate}
          preload="none"
        />
      </div>
      <CardContent className="pt-4 pb-3">
        <div className="font-semibold text-sm truncate">{t.title}</div>
        {showArtist && <div className="text-xs text-muted-foreground truncate">{t.artistName}</div>}
        <Button
          variant={playing ? "secondary" : "outline"}
          size="sm"
          onClick={togglePreview}
          className="w-full mt-3 gap-1.5"
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {playing ? `Stop preview · 0:${remaining.toString().padStart(2, "0")}` : "Preview · 30 sec"}
        </Button>
        <div className="flex items-center justify-between mt-3">
          <span className="text-sm font-bold text-amber-500">${t.price.toFixed(2)}</span>
          <Button size="sm" className="gap-1" disabled={buying === t.id} onClick={() => onBuy(t.id)}>
            {buying === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShoppingCart className="w-3 h-3" />}
            Buy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
