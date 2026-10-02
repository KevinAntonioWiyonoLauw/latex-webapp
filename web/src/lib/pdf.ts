import * as pdfjsLib from "pdfjs-dist";
// `?url` membuat Vite menyalin worker ke `assets/` dan mengembalikan URL-nya.
// Ini lebih andal daripada `new URL("pdfjs-dist/...", import.meta.url)` karena
// Vite ikut menjejak file worker saat build (hash selalu sinkron dengan bundle).
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** Versi pdf.js yang dipakai — untuk fallback CDN bila aset lokal tak termuat. */
const PDFJS_VERSION: string = pdfjsLib.version;

/** URL worker lokal hasil build (mis. `/assets/pdf.worker.min-<hash>.mjs`). */
const LOCAL_WORKER = new URL(workerUrl, import.meta.url).href;

/** Fallback CDN dengan versi pdf.js yang sama persis. */
const CDN_WORKERS = [
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`,
  `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`,
];

let configured = false;

/** Set workerSrc ke aset lokal (idempoten). */
export function configurePdfWorker(): void {
  if (configured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = LOCAL_WORKER;
  configured = true;
}

/**
 * Muat dokumen PDF dengan strategi berlapis:
 *  1. worker lokal hasil build (normal),
 *  2. worker CDN versi sama (jsDelivr, lalu unpkg).
 *
 * Tujuannya: preview tidak pernah lagi gagal total hanya karena satu aset
 * worker tidak bisa dimuat (mis. cache basi / aset terblokir).
 */
export async function loadPdfDocument(
  params: Parameters<typeof pdfjsLib.getDocument>[0],
): Promise<pdfjsLib.PDFDocumentProxy> {
  configurePdfWorker();

  const attempts = [LOCAL_WORKER, ...CDN_WORKERS];
  let lastErr: unknown = null;

  for (let i = 0; i < attempts.length; i++) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = attempts[i];
      return await pdfjsLib.getDocument(params).promise;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Bukan masalah worker (mis. PDF rusak / 404) → tak perlu ganti worker.
      if (!/worker|dynamically imported module|Failed to fetch|fake worker|mjs/i.test(msg)) {
        throw e;
      }
      console.warn(`[pdf] worker gagal (${attempts[i]}), mencoba berikutnya:`, msg);
    }
  }

  throw lastErr ?? new Error("Gagal memuat PDF");
}

export { pdfjsLib };
export type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
