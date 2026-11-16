import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// PURRE PETS — build produkcyjny: TanStack Start SSR na Nitro (Node.js 22, preset node-server).
// Wynik buildu: .output/ (serwer: .output/server/index.mjs, statyki: .output/public).
//
// Kolejność pluginów jak w oficjalnym przykładzie TanStack Start:
// tanstackStart() → react() → nitro() — Nitro pakuje finalny output na końcu.
//
// Alias "@" → ./src — KRYTYCZNE: Vite (Rolldown) NIE czyta paths z jsconfig.json. Bez tego
// każdy import "@/components/..." kończy się błędem resolve.
// Every runtime dependency is bundled at startup, for the browser and the SSR server: one first imported
// mid-session makes Vite re-bundle, and a page rendered meanwhile on the server loads a second React.
// Not listed: React itself, the TanStack Start/Router framework (its plugin bundles it) and build-time plugins.
const NOT_PREBUNDLED = new Set(["react", "react-dom", "@tanstack/react-start", "@tanstack/react-router", "@tanstack/react-router-ssr-query", "tailwindcss-animate"]);
const { dependencies } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const PREBUNDLE = Object.keys(dependencies).filter((name) => !NOT_PREBUNDLED.has(name));

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    allowedHosts: ["purrepets.pl", "www.purrepets.pl"],
  },
  optimizeDeps: { include: PREBUNDLE },
  environments: {
    ssr: {
      optimizeDeps: { include: PREBUNDLE },
    },
  },
  plugins: [
    // Custom server entry (src/server.js) zachowuje raportowanie błędów tras (error-capture) na Node.js.
    tanstackStart({ srcDirectory: "src", server: { entry: "./server.js" } }),
    react(),
    nitro(),
  ],
});
