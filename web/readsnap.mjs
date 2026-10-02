import * as Y from "yjs";
import fs from "node:fs";

const p = process.argv[2];
const doc = new Y.Doc();
Y.applyUpdate(doc, new Uint8Array(fs.readFileSync(p)));

// Cek semua shared type yang ada di dokumen.
console.log("=== shared types di snapshot ===");
for (const [key, type] of doc.share.entries()) {
  const kind = type.constructor.name;
  let preview = "";
  if (type instanceof Y.Text) preview = JSON.stringify(type.toString().slice(0, 120));
  console.log(`  ${key} -> ${kind} ${preview}`);
}

const t = doc.getText("content");
console.log("\n=== panjang 'content':", t.length, "===");
console.log("=== ISI ===");
console.log(t.toString());
