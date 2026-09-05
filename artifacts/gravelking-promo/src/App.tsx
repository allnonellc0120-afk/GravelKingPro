import VideoTemplate from "@/components/video/VideoTemplate";
import { Switch, Route, Router } from "wouter";

function VideoPlayer() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 gap-8 font-sans">
      <div className="w-full max-w-7xl flex flex-col lg:flex-row gap-12 items-center justify-center">
        <div className="flex flex-col items-center gap-4 w-full lg:w-2/3 max-w-4xl">
          <h2 className="text-white/80 font-mono text-sm tracking-widest uppercase">16:9 Landscape</h2>
          <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#0a0a0a]">
            <video 
              poster={`${import.meta.env.BASE_URL}posters/poster_16x9.jpg`}
              className="w-full h-full object-contain"
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
            >
              <source src={`${import.meta.env.BASE_URL}videos/preview_59s_16x9.mp4`} type="video/mp4" />
              <source src={`${import.meta.env.BASE_URL}videos/preview_59s_16x9.webm`} type="video/webm" />
            </video>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 w-full max-w-[320px] shrink-0">
          <h2 className="text-white/80 font-mono text-sm tracking-widest uppercase">9:16 Vertical</h2>
          <div className="w-full aspect-[9/16] rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#0a0a0a]">
            <video 
              poster={`${import.meta.env.BASE_URL}posters/poster_9x16.jpg`}
              className="w-full h-full object-contain"
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
            >
              <source src={`${import.meta.env.BASE_URL}videos/preview_59s_9x16.mp4`} type="video/mp4" />
              <source src={`${import.meta.env.BASE_URL}videos/preview_59s_9x16.webm`} type="video/webm" />
            </video>
          </div>
        </div>
      </div>
      
      <div className="mt-12 text-white/40 text-xs font-mono">
        GravelKing Pro • Lyrics Generator Promo
      </div>
    </div>
  );
}

export default function App() {
  const isExport = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("export") === "1";
  const format = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("format") === "vertical" ? "vertical" : "landscape";
  
  if (isExport) {
    return <VideoTemplate format={format} loop={false} muted={false} />;
  }

  return (
    <Router base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Switch>
        <Route path="/" component={VideoPlayer} />
      </Switch>
    </Router>
  );
}
