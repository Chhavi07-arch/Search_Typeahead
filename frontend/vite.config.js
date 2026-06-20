import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend calls the backend through a "/api" prefix which Vite proxies to
// the Express server during development. This avoids CORS issues and keeps the
// API base URL identical in dev and prod-style builds.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
