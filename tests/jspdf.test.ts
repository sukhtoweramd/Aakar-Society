// Audit PR-6: jspdf 4.x still does what the app needs: a page from a JPEG, compressed, saved as a PDF blob/bytes
// (lib/pdfShare.ts and lib/compressFile.ts use exactly new jsPDF + addPage + addImage + output).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";

const JPEG_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAQABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDKooorzD7gKKKKAP/Z";

test("jspdf builds a 2-page compressed PDF from JPEG images", () => {
  const jpg = new Uint8Array(Buffer.from(JPEG_B64, "base64"));
  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: [595, 842], compress: true });
  pdf.addImage(jpg, "JPEG", 0, 0, 595, 842);
  pdf.addPage([842, 595], "l");
  pdf.addImage(jpg, "JPEG", 0, 0, 842, 595);
  assert.equal(pdf.getNumberOfPages(), 2);
  const bytes = new Uint8Array(pdf.output("arraybuffer"));
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  assert.ok(bytes.length > 500);
});

test("the app only uses the safe jsPDF calls (no file loading, no HTML rendering, no new-window output)", () => {
  const root = join(__dirname, "..");
  for (const f of ["lib/pdfShare.ts", "lib/compressFile.ts"]) {
    const src = readFileSync(join(root, f), "utf8");
    assert.ok(!/\.loadFile\(|\.html\(|pdfobjectnewwindow|pdfjsnewwindow|dataurlnewwindow/.test(src), `${f} uses a risky jsPDF call`);
  }
});
