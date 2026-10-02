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
        manualChunks: {
          monaco: ["monaco-editor"],
          pdf: ["pdfjs-dist"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
