"use client";
// Makes uploads smaller in the browser before they are stored.
//  • Photos (JPG / PNG / WEBP / HEIC where the phone can read it): up to 2000 px, JPEG.
//  • PDFs: each page is re-saved as a picture (about 150 dpi, JPEG) — good for scans and phone-camera PDFs.
//    Text in the PDF is then no longer selectable, so the smaller copy is used only when it saves at least 25%.
//  • Anything else (Word, Excel…) and anything that does not get smaller is uploaded as it is.

export type Compressed = { file: File; before: number; after: number; changed: boolean };
const MAX_PX = 2000;
const PDF_MAX_PAGES = 30;
const keep = (file: File): Compressed => ({ file, before: file.size, after: file.size, changed: false });

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not compress"))), "image/jpeg", quality));
}

async function compressImage(file: File): Promise<Compressed> {
  if (file.size < 300 * 1024) return keep(file);
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, canvas.width, canvas.height);   // transparent PNGs get a white page
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToJpeg(canvas, 0.8);
  if (blob.size >= file.size * 0.9) return keep(file);
  return { file: new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }), before: file.size, after: blob.size, changed: true };
}

async function compressPdf(file: File): Promise<Compressed> {
  if (file.size < 500 * 1024) return keep(file);
  const pdfjs: any = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (doc.numPages > PDF_MAX_PAGES) return keep(file);
  const { jsPDF } = await import("jspdf");
  let out: any = null;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });                         // size in points (1/72 inch)
    const scale = Math.min(150 / 72, MAX_PX / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    const jpg = new Uint8Array(await (await canvasToJpeg(canvas, 0.7)).arrayBuffer());
    const orient = base.width > base.height ? "l" : "p";
    if (!out) out = new jsPDF({ orientation: orient, unit: "pt", format: [base.width, base.height], compress: true });
    else out.addPage([base.width, base.height], orient);
    out.addImage(jpg, "JPEG", 0, 0, base.width, base.height);
    page.cleanup();
  }
  await doc.destroy();
  if (!out) return keep(file);
  const blob: Blob = out.output("blob");
  if (blob.size > file.size * 0.75) return keep(file);
  return { file: new File([blob], file.name, { type: "application/pdf" }), before: file.size, after: blob.size, changed: true };
}

/** Smaller copy of the file when that helps; never throws (falls back to the original). */
export async function compressForUpload(file: File): Promise<Compressed> {
  try {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || ["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) return await compressImage(file);
    if (file.type === "application/pdf" || ext === "pdf") return await compressPdf(file);
  } catch { /* phone could not read it: upload the original */ }
  return keep(file);
}

export const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const sizeNote = (c: Compressed) =>
  c.changed ? `Compressed ${mb(c.before)} → ${mb(c.after)} (${Math.round((1 - c.after / c.before) * 100)}% smaller)` : `Uploaded as it is (${mb(c.before)})`;
