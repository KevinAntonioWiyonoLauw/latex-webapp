#!/usr/bin/env bun
// Uji dengan klien Hocuspocus ASLI (protokol benar) untuk lihat error sebenarnya.
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { readFileSync } from "node:fs";

const cookie = readFileSync(".tmp-ck.txt", "utf8").trim();
const doc = new Y.Doc();

const provider = new HocuspocusProvider({
  url: "wss://latex.kevinio.my.id/collab",
  name: "7LcV-jjEUaPp::contents/Makalah.tex",
  document: doc,
  // Kirim cookie sesi (node ws tidak otomatis membawa cookie browser).
  WebSocketPolyfill: class extends WebSocket {
    constructor(url, protocols) {
      super(url, protocols, { headers: { Cookie: cookie } });
    }
  },
  onOpen: () => console.log("  onOpen"),
  onStatus: ({ status }) => console.log("  onStatus:", status),
  onSynced: () => console.log("  onSynced ✅"),
  onAuthenticationFailed: (d) => console.log("  onAuthenticationFailed:", JSON.stringify(d).slice(0, 300)),
  onClose: (d) => console.log("  onClose:", JSON.stringify(d).slice(0, 200)),
  onDisconnect: () => console.log("  onDisconnect"),
});

await new Promise((r) => setTimeout(r, 9000));

const text = doc.getText("content");
console.log("\nHASIL:");
console.log("  status:", provider.status ?? "(tidak ada)");
console.log("  isSynced:", provider.isSynced);
console.log("  panjang Y.Text:", text.length);
console.log("  120 char pertama:", JSON.stringify(text.toString().slice(0, 120)));

provider.destroy();
process.exit(0);
