// Turn print pages (A4 <section class="page"> blocks) into a PDF in the browser, and hand it
// to the phone's share sheet (WhatsApp etc.). On browsers that can't share files, it downloads.

export async function pagesToPdf(pages: string[], css: string, fileName: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1300px;border:0;visibility:hidden";
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>${css}
      body{background:#fff!important;margin:0} .page{margin:0!important;box-shadow:none!important}</style></head><body>${pages.join("")}</body></html>`);
    doc.close();
    // wait for images (signature, stamp) and fonts, but never hang
    const imgs = Array.from(doc.images).map((im) => (im.complete ? Promise.resolve() : new Promise<void>((r) => { im.onload = im.onerror = () => r(); })));
    await Promise.race([Promise.all([...imgs, (doc as any).fonts?.ready]), new Promise((r) => setTimeout(r, 2500))]);
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    const els = Array.from(doc.querySelectorAll<HTMLElement>("section.page"));
    for (let i = 0; i < els.length; i++) {
      const canvas = await html2canvas(els[i], { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
    }
    return new File([pdf.output("blob")], fileName, { type: "application/pdf" });
  } finally {
    frame.remove();
  }
}

export const canShareFile = (file: File) => {
  const nav = navigator as any;
  try { return !!(nav.canShare && nav.share && nav.canShare({ files: [file] })); } catch { return false; }
};

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** "shared" | "cancelled" | "needs-tap" (browser wants a fresh tap) */
export async function shareFile(file: File, text: string): Promise<"shared" | "cancelled" | "needs-tap"> {
  try {
    await (navigator as any).share({ files: [file], title: file.name, text });
    return "shared";
  } catch (e: any) {
    if (e?.name === "AbortError") return "cancelled";
    return "needs-tap";
  }
}
