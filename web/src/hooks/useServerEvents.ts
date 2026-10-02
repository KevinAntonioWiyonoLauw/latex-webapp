import { useEffect, useRef } from "react";
import type { ClientEvent, ServerEvent } from "@latex/shared";

/**
 * Tentukan URL WebSocket.
 * - Jika VITE_WS_URL diset, pakai itu.
 * - Di dev (Vite di :5173), sambung langsung ke backend :5174 agar tidak
 *   bergantung pada WS proxy (lebih andal).
 * - Di produksi, pakai origin yang sama.
 */
function resolveWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  // Di dev, sambung langsung ke backend (5174) — lebih andal dari WS proxy.
  if (import.meta.env.DEV && location.port === "5173") {
    return `${proto}//${location.hostname}:5174/ws`;
  }
  return `${proto}//${location.host}/ws`;
}

/**
 * Hook WebSocket: subscribe ke event server untuk satu project.
 * Reconnect otomatis jika koneksi putus.
 */
export function useServerEvents(
  projectId: string | null,
  onEvent: (e: ServerEvent) => void,
): void {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!projectId) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const socket = new WebSocket(resolveWsUrl());
      ws = socket;

      socket.onopen = () => {
        const msg: ClientEvent = { type: "subscribe", projectId };
        socket.send(JSON.stringify(msg));
      };

      socket.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as ServerEvent;
          cbRef.current(data);
        } catch {
          /* ignore */
        }
      };

      socket.onclose = () => {
        // hanya reconnect jika belum sengaja ditutup & socket ini masih aktif
        if (closed || ws !== socket) return;
        retry = setTimeout(connect, 1500);
      };

      socket.onerror = () => {
        // biarkan onclose yang menangani reconnect
      };
    };

    // Delay singkat: hindari pembuatan WS yang langsung dibatalkan oleh
    // StrictMode double-invoke (menghilangkan warning "closed before established").
    startTimer = setTimeout(connect, 50);

    return () => {
      closed = true;
      if (startTimer) clearTimeout(startTimer);
      if (retry) clearTimeout(retry);
      // tutup tanpa memicu error/warning
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, [projectId]);
}
