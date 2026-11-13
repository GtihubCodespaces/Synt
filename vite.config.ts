import { defineConfig } from "vite";

// The island is a transparent, always-on-top Tauri window. `npm run dev` alone
// serves the same front end in a normal browser (the "browser shell"), which is
// how the look and the chat are developed without compiling Rust.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    watch: { ignored: ["**/src-tauri/**", "**/sidecar/**"] },
  },
  build: {
    target: "es2021",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  envPrefix: ["VITE_", "TAURI_"],
});
