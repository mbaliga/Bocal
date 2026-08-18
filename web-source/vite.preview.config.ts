// Builds a standalone, single-file preview of the app — a plain Vite+React
// mount of app/page.tsx with no server and no Sites/Cloudflare worker, so it
// can be opened directly as a local file (file:// or a transferred content://
// URI) for on-device testing. This is a handoff tool only: the deployable
// app still builds from vite.config.ts / worker / db, entirely untouched by
// this file.
//
// Usage: npx vite build --config vite.preview.config.ts
// Output: preview-dist/index.html — everything (JS, CSS, fonts) inlined.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "preview"),
  base: "./",
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      "next/dynamic": path.resolve(__dirname, "preview/dynamic-shim.tsx"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "preview-dist"),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000, // inline every asset (the cinematic .webp files included)
    cssCodeSplit: false,
  },
});
