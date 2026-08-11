import VideoTemplate from "@/components/video/VideoTemplate";

export default function App() {
  const isExport = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("export") === "1";
  return <VideoTemplate loop={!isExport} muted={!isExport} />;
}
