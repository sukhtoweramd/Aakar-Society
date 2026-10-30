// Copies the browser builds of html2canvas and jsPDF into public/print/vendor/ so print windows
// (public/print/pdf.js) can load them from the app's own address. Runs before `next build` / `next dev`.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const out = join(process.cwd(), "public", "print", "vendor");
mkdirSync(out, { recursive: true });
const files = [
  ["html2canvas/package.json", "dist/html2canvas.min.js", "html2canvas.min.js"],
  ["jspdf/package.json", "dist/jspdf.umd.min.js", "jspdf.umd.min.js"],
];
for (const [pkg, rel, name] of files) {
  copyFileSync(join(dirname(require.resolve(pkg)), rel), join(out, name));
}
console.log("PDF libraries copied to public/print/vendor/");
