import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // En développement, toutes les requêtes /api/* sont redirigées vers le backend
      "/api": {
        target:       "http://localhost:4000",
        changeOrigin: true,
        // SSE : désactiver la mise en buffer pour avoir les logs en temps réel
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["x-accel-buffering"] = "no";
          });
        },
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
