import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5174",
      "/ws": {
        target: "ws://127.0.0.1:5174",
        ws: true,
        changeOrigin: true,
      },
    },
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "zustand", "pdfjs-dist", "@monaco-editor/react"],
    exclude: ["monaco-editor"],
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        /**
         * Worker PDF.js diberi nama TETAP (`pdf.worker.min.mjs`, tanpa hash).
         *
         * Alasannya: nama ber-hash berubah setiap build. Tab browser yang
         * masih terbuka memegang bundle lama yang menunjuk hash LAMA, sehingga
         * setelah deploy muncul error
         *   "Failed to fetch dynamically imported module:
         *    /assets/pdf.worker.min-<hash-lama>.mjs"
         * dan preview PDF mati sampai user hard-refresh. Dengan nama tetap,
         * bundle lama & baru menunjuk file yang sama.
         *
         * Aset lain tetap memakai hash (aman untuk cache jangka panjang).
         */
        assetFileNames: (assetInfo) => {
          const names = assetInfo.names ?? (assetInfo.name ? [assetInfo.name] : []);
          if (names.some((n) => n.includes("pdf.worker"))) {
            return "assets/pdf.worker.min.mjs";
          }
          return "assets/[name]-[hash][extname]";
        },
        manualChunks: {
          monaco: ["monaco-editor"],
          pdf: ["pdfjs-dist"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
