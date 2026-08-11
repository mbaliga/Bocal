import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "assets",
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: "bocal.js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
