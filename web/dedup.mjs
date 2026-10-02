import * as Y from "yjs";
import fs from "node:fs";

const p = process.argv[2];
const doc = new Y.Doc();
Y.applyUpdate(doc, new Uint8Array(fs.readFileSync(p)));
const text = doc.getText("content").toString();

// Deteksi duplikasi: dokumen terduplikasi = isi yang sama muncul 2x berurutan.
const half = Math.floor(text.length / 2);
const a = text.slice(0, half);
const b = text.slice(half);
const duplicated = text.length > 100 && text.slice(0, 200) === text.slice(half, half + 200);

console.log("panjang:", text.length);
console.log("duplikat?", duplicated);
console.log("separuh pertama == separuh kedua?", a.trim() === b.trim());

if (process.argv[3] === "--emit") {
  // Tulis versi bersih: bila terduplikasi, ambil separuh pertama saja.
  const clean = duplicated || a.trim() === b.trim() ? a : text;
  fs.writeFileSync(process.argv[4], clean, "utf8");
  console.log("ditulis ke:", process.argv[4], "panjang:", clean.length);
}
