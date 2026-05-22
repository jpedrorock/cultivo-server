import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Aumentado pra 1200KB porque o entry inicial fica grande mesmo com
    // splits (React+ícones+capacitor+vendor SDK). Ainda assim, gzip ~230KB
    // que é razoável pra app desse porte.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // IMPORTANTE: separar React (vendor-react) ou libs que dependem de
        // React via peer (wouter, lucide-react, radix) causa "Cannot read
        // properties of null (reading 'useContext')" porque React fica em
        // chunk diferente do consumidor. Mantemos React no chunk principal
        // e splitamos APENAS libs que NÃO dependem de React peer.
        manualChunks: {
          // Three.js — ~600KB. Só carrega no PlantTrainingPage / Plant3DView.
          "vendor-three": ["three"],
          // Recharts separado — ~150KB, só carrega em páginas com gráficos.
          "vendor-charts": ["recharts"],
          // date-fns — ~80KB, sem peer React
          "vendor-dates": ["date-fns"],
          // Validação de schemas
          "vendor-zod": ["zod"],
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
