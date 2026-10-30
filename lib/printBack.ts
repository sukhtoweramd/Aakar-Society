// "← BACK TO APP" for print/preview windows. On phones the print view opens as a new tab
// with no obvious way back, so this closes it (returning to the app tab) or, if the
// browser refuses to close it, goes to the app's home page.
export function backButton(): string {
  const home = typeof window !== "undefined" ? window.location.origin + "/" : "/";
  return `<button type="button" onclick="__aakarBack()" style="background:#fff;color:#0f1d3d;border:0;padding:8px 14px;font-weight:700;cursor:pointer;font:inherit;font-weight:700;border-radius:2px">← BACK TO APP</button>`
    + `<script>function __aakarBack(){try{if(window.opener&&!window.opener.closed){window.opener.focus()}}catch(e){}window.close();setTimeout(function(){location.href=${JSON.stringify(home)}},300)}</script>`;
}

/** SAVE / SHARE PDF for print windows: makes the PDF in the page (public/print/pdf.js), so it also works in the
 *  iPhone home-screen app, where window.print() does nothing, and always on A4 in the report's own orientation. */
export function pdfButton(name = "", cls = ""): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `<button type="button" class="${cls}" onclick="window.__aakarPdf&&window.__aakarPdf(${escAttr(JSON.stringify(name))})">SAVE / SHARE PDF</button>`
    + `<script src="${escAttr(origin)}/print/pdf.js"></script>`;
}
function escAttr(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** A complete top bar (for print windows that don't have one). Hidden when printing. */
export function backBar(extra = "", pdfName = ""): string {
  return `<style>.aakar-bar{position:sticky;top:0;z-index:9;background:#0f1d3d;color:#fff;padding:10px 14px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font:13px Arial,sans-serif;margin:0 0 14px}.aakar-bar .p{background:#c9a227;color:#000;border:0;padding:8px 16px;font-weight:700;cursor:pointer}@media print{.aakar-bar{display:none}}</style>`
    + `<div class="aakar-bar">${backButton()}${pdfButton(pdfName, "p")}<button class="p" onclick="window.print()">PRINT</button>${extra}</div>`;
}
