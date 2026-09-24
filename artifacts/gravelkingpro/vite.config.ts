import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

const isBuild = process.env.NODE_ENV === "production" || process.argv.includes("build");

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

if (!isBuild) {
  if (!rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
  }
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
}

const basePath = process.env.BASE_PATH ?? "/";
const buildVersion = new Date().toISOString();
const proxyGatewayTarget = process.env.VITE_PROXY_GATEWAY ?? "http://127.0.0.1:8080";
const gravelKingArtistId = process.env.GRAVELKING_ARTIST_ID ?? "customer-zero";
const gravelKingKernelVersion = "Morris-Law-V2";

function gravelKingGatewayProxy() {
  return {
    target: proxyGatewayTarget,
    changeOrigin: true,
    ws: true,
    secure: false,
    configure(proxy: { on: (event: string, listener: (proxyReq: { setHeader: (name: string, value: string) => void }, req: { headers: { host?: string } }) => void) => void }) {
      proxy.on("proxyReq", (proxyReq, req) => {
        proxyReq.setHeader("X-GravelKing-Artist-ID", gravelKingArtistId);
        proxyReq.setHeader("X-Forwarded-Host", req.headers.host ?? proxyGatewayTarget);
        proxyReq.setHeader("X-GravelKing-Kernel-Version", gravelKingKernelVersion);
      });
    },
  };
}

const injectBuildVersion = {
  name: "inject-build-version",
  transformIndexHtml(html: string) {
    return html.replaceAll("__GKP_BUILD_VERSION__", buildVersion);
  },
};

export default defineConfig({
  base: basePath,
  define: {
    __APP_BUILD__: JSON.stringify(buildVersion),
  },
  plugins: [
    injectBuildVersion,
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        skipWaiting: true,
        clientsClaim: true,
        // The production SPA bundle is currently just over Workbox's 2 MiB
        // default. Keep it precached so offline/PWA behavior remains intact.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // CRITICAL: never serve the SPA shell for server-side routes.
        // Without this, the service worker hijacks navigations to /api/*
        // (incl. the Clerk proxy at /api/__clerk) and renders the SPA 404 page.
        navigateFallbackDenylist: [/^\/api\//, /^\/news(?:\/|$)/, /^\/mobile\//, /^\/mlk-licensing/, /^\/gravelkingpro-promo/],
      },
      manifest: {
        name: "GravelKing Pro",
        short_name: "GravelKing",
        description: "Pro audio mastering, vocal booth, DAW, and IP certification",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
    proxy: {
      "/api": gravelKingGatewayProxy(),
      "/news": gravelKingGatewayProxy(),
      "/signaling": gravelKingGatewayProxy(),
      "/auth": gravelKingGatewayProxy(),
      "/session": gravelKingGatewayProxy(),
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
