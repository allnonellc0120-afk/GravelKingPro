import { useEffect, useState } from "react";
import VideoTemplate from "@/components/video/VideoTemplate";
import { Switch, Route, Router } from "wouter";

function VideoPlayer() {
  const [mp4Ready, setMp4Ready] = useState(false);
  const mp4Path = `${import.meta.env.BASE_URL}videos/gka_main_stage_duet_30s_16x9.mp4`;

  useEffect(() => {
    let active = true;
    fetch(mp4Path, { method: "HEAD" })
      .then((response) => {
        if (active && response.ok) setMp4Ready(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [mp4Path]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030509] p-4 font-sans">
      <div className="absolute left-6 top-6 z-[60] flex items-center gap-3 gka-mono text-[11px] uppercase tracking-[0.18em] text-cyan-100/65">
        <span className="h-2 w-2 rounded-full bg-[#8dffb3] shadow-[0_0_10px_#8dffb3]" />
        GravelKing Pro / Main Stage
      </div>
      <div className="absolute right-6 top-6 z-[60] gka-mono text-[11px] uppercase tracking-[0.18em] text-white/35">
        Auto-play preview / 30 sec
      </div>
      <div className="relative w-full max-w-[1440px] overflow-hidden rounded-2xl border border-cyan-200/15 shadow-[0_0_80px_rgba(98,246,255,.08)]">
        <VideoTemplate loop muted />
        <div className="absolute bottom-5 right-5 z-[60]">
          {mp4Ready ? (
            <a
              href={mp4Path}
              download
              className="inline-flex items-center gap-2 rounded-full border border-[#8dffb3]/35 bg-[#081a13]/90 px-4 py-2.5 gka-mono text-xs uppercase tracking-[0.12em] text-[#8dffb3] shadow-[0_0_24px_rgba(141,255,179,.12)] transition hover:border-[#8dffb3] hover:bg-[#8dffb3]/10"
            >
              Export MP4
              <span aria-hidden="true">↓</span>
            </a>
          ) : (
            <span className="rounded-full border border-white/10 bg-black/55 px-4 py-2.5 gka-mono text-xs uppercase tracking-[0.12em] text-white/35">
              MP4 export rendering
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const isExport = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("export") === "1";
  
  if (isExport) {
    return <VideoTemplate loop={false} muted={false} />;
  }

  return (
    <Router base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Switch>
        <Route path="/" component={VideoPlayer} />
      </Switch>
    </Router>
  );
}
