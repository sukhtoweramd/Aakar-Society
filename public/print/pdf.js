/* Aakar print windows: SAVE / SHARE PDF without the browser's print dialog (30 Oct 2026).
   Why: in the iPhone home-screen app, window.print() does nothing; in a Safari tab iPhone prints on US Letter
   portrait and ignores the app's A4 / landscape / footer settings. This builds the PDF in the page itself.
   Loaded by every print window (lib/printBack.ts pdfButton()). Libraries are copied from node_modules into
   /print/vendor/ at build time (scripts/copy-pdf-libs.mjs).
   - Pages made of A4 blocks (<section class="page">: flat cards, bills, letters, minutes): one PDF page each.
   - Flowing reports (directory, dues list, vehicles …): cut into A4 pages, never inside a table row where possible,
     with the society footer and "Page x of y". Orientation comes from the window's @page rule. */
(function (root) {
  "use strict";

  /** Pure: where to cut a flowing report. total / pageH in px; cuts = y positions where a cut is allowed.
      opts.forced = y positions where a new page must start (CSS page breaks, e.g. each tower);
      opts.headerAt(y) = height of the column headings repeated at the top of a page that starts at y (0 = none). */
  function slicePages(total, pageH, cuts, opts) {
    opts = opts || {};
    var out = [], start = 0, sort = function (a, b) { return a - b; };
    var sorted = (cuts || []).slice().sort(sort), forced = (opts.forced || []).slice().sort(sort);
    if (!(total > 0) || !(pageH > 0)) return out;
    while (start < total - 0.5) {
      var head = start > 0 && opts.headerAt ? Math.min(opts.headerAt(start) || 0, pageH / 3) : 0;
      var room = pageH - head, limit = start + room, end = limit, i;
      var hard = -1;
      for (i = 0; i < forced.length; i++) if (forced[i] > start + 0.5 && forced[i] <= Math.min(limit, total)) { hard = forced[i]; break; }
      if (hard > 0) end = hard;
      else if (limit >= total) end = total;
      else {
        var best = -1;
        for (i = 0; i < sorted.length; i++) {
          var c = sorted[i];
          if (c > start + room * 0.5 && c <= limit) best = c;
        }
        if (best > 0) end = best;
      }
      out.push([start, end, head]);
      start = end;
    }
    return out;
  }
  root.__aakarSlicePages = slicePages;
  if (typeof document === "undefined") return; // tests

  var MM = 96 / 25.4; // CSS px per mm
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/pdf\.js(\?.*)?$/, "") : "/print/";
  })();

  // Phone layout: fit the screen instead of a 980-px desktop page, and stop iPhone enlarging text by itself.
  (function () {
    if (!document.querySelector('meta[name="viewport"]')) {
      var m = document.createElement("meta");
      m.name = "viewport"; m.content = "width=device-width, initial-scale=1";
      document.head.appendChild(m);
    }
    var st = document.createElement("style");
    st.textContent = "html{-webkit-text-size-adjust:100%;text-size-adjust:100%}"
      + ".aakar-capturing .aakar-bar,.aakar-capturing .bar,.aakar-capturing .aakar-pdf-box{display:none!important}"
      + ".aakar-pdf-box{position:fixed;left:12px;right:12px;bottom:16px;z-index:99;background:#0f1d3d;color:#fff;padding:14px;border-radius:6px;"
      + "font:14px Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);text-align:center}"
      + ".aakar-pdf-box button{background:#c9a227;color:#000;border:0;padding:12px 16px;margin:10px 6px 0;font-weight:700;font-size:14px;min-height:44px;cursor:pointer}"
      + ".aakar-pdf-box button.w{background:#fff}";
    document.head.appendChild(st);
  })();

  // Phones: skip the automatic print dialog that some windows open on load (the member uses SAVE / SHARE PDF);
  // PRINT pressed by hand still works. Only where the browser can tell a tap from an automatic call.
  try {
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches && navigator.userActivation) {
      var realPrint = window.print.bind(window);
      window.print = function () { if (navigator.userActivation.isActive) realPrint(); };
    }
  } catch (e) {}

  function load(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = BASE + src; s.onload = res;
      s.onerror = function () { rej(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }
  var libs;
  function getLibs() {
    if (!libs) libs = Promise.all([load("vendor/html2canvas.min.js"), load("vendor/jspdf.umd.min.js")]).catch(function (e) { libs = null; throw e; });
    return libs;
  }

  function box(html) {
    var b = document.querySelector(".aakar-pdf-box");
    if (!b) { b = document.createElement("div"); b.className = "aakar-pdf-box"; document.body.appendChild(b); }
    b.innerHTML = html;
    return b;
  }
  function closeBox() { var b = document.querySelector(".aakar-pdf-box"); if (b) b.remove(); }
  function escHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function isLandscape() {
    var css = Array.prototype.map.call(document.querySelectorAll("style"), function (s) { return s.textContent || ""; }).join(" ");
    var m = css.match(/@page\s*\{[^}]*?size\s*:\s*([^;}]*)/i);
    return !!(m && /landscape/i.test(m[1]));
  }
  function today() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "-" + p(d.getMonth() + 1) + "-" + d.getFullYear();
  }
  function fileName(name) {
    var base = String(name || document.title || "Aakar report")
      .replace(/\s*[-–•,]?\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\s*$/, "") // the date is added below
      .replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    return base + " " + today() + ".pdf";
  }
  function waitReady() {
    var imgs = Array.prototype.map.call(document.images, function (i) {
      return i.complete ? 0 : new Promise(function (r) { i.onload = i.onerror = r; });
    });
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : 0;
    return Promise.race([Promise.all(imgs.concat([fonts])), new Promise(function (r) { setTimeout(r, 3000); })]);
  }
  function frame() { return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 30); }); }); }

  async function buildPages(pages, jsPDF) {
    var pdf = null;
    for (var i = 0; i < pages.length; i++) {
      box("Preparing PDF… page " + (i + 1) + " of " + pages.length);
      await frame();
      var el = pages[i], land = el.offsetWidth > el.offsetHeight;
      var canvas = await root.html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      var orient = land ? "landscape" : "portrait";
      if (!pdf) pdf = new jsPDF({ unit: "mm", format: "a4", orientation: orient, compress: true });
      else pdf.addPage("a4", orient);
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, land ? 297 : 210, land ? 210 : 297);
      canvas.width = canvas.height = 0;
    }
    return pdf;
  }

  async function buildFlow(jsPDF) {
    var land = isLandscape();
    var pw = land ? 297 : 210, ph = land ? 210 : 297, margin = 10, foot = 8;
    var cw = pw - 2 * margin, chMm = ph - 2 * margin - foot;
    var body = document.body, old = body.getAttribute("style") || "";
    document.documentElement.classList.add("aakar-capturing");
    body.setAttribute("style", old + ";width:" + (cw * MM) + "px!important;max-width:none!important;margin:0!important;padding:0!important;background:#fff!important");
    try {
      await frame();
      var top = body.getBoundingClientRect().top + window.scrollY, total = body.scrollHeight;
      var cuts = [];
      Array.prototype.forEach.call(body.querySelectorAll("tr,li,p,h1,h2,h3,h4,section,.r,table,body>div"), function (e) {
        var r = e.getBoundingClientRect();
        if (r.height > 0) cuts.push(r.top + window.scrollY - top);
      });
      var forced = [];
      Array.prototype.forEach.call(body.querySelectorAll("*"), function (e) {
        var cs = getComputedStyle(e), r;
        if (cs.breakBefore === "page" || cs.pageBreakBefore === "always" || cs.breakBefore === "always") {
          r = e.getBoundingClientRect(); if (r.height > 0) forced.push(r.top + window.scrollY - top);
        }
      });
      // column headings of each table: the last heading row (with <th>) of its <thead>, else its first <th> row
      var heads = [];
      Array.prototype.forEach.call(body.querySelectorAll("table"), function (t) {
        var rows = Array.prototype.filter.call(t.querySelectorAll("tr"), function (tr) { return tr.querySelector("th"); });
        var inHead = rows.filter(function (tr) { return tr.parentNode && tr.parentNode.tagName === "THEAD"; });
        var hr = inHead.length ? inHead[inHead.length - 1] : rows[0];
        if (!hr) return;
        var tb = t.getBoundingClientRect(), rb = hr.getBoundingClientRect();
        heads.push({ top: tb.top + window.scrollY - top, bottom: tb.bottom + window.scrollY - top,
          y: rb.top + window.scrollY - top, h: rb.height, after: rb.bottom + window.scrollY - top });
      });
      function headAt(y) {
        for (var k = 0; k < heads.length; k++) { var t = heads[k]; if (y > t.after + 0.5 && y < t.bottom - 0.5) return t; }
        return null;
      }
      var slices = slicePages(total, chMm * MM, cuts, { forced: forced, headerAt: function (y) { var t = headAt(y); return t ? t.h : 0; } });
      var pdf = new jsPDF({ unit: "mm", format: "a4", orientation: land ? "landscape" : "portrait", compress: true });
      var footer = "Aakar Co-op Housing Society Ltd. - " + today();
      for (var i = 0; i < slices.length; i++) {
        box("Preparing PDF… page " + (i + 1) + " of " + slices.length);
        document.documentElement.classList.add("aakar-capturing");
        await frame();
        var y = slices[i][0], h = slices[i][1] - y, hh = slices[i][2], th = hh ? headAt(y) : null;
        if (i > 0) pdf.addPage("a4", land ? "landscape" : "portrait");
        var offset = 0;
        if (th) { // repeat the table's column headings at the top of this page
          var hc = await root.html2canvas(body, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
            x: 0, y: th.y, width: cw * MM, height: th.h, windowWidth: Math.ceil(cw * MM), scrollY: -window.scrollY });
          pdf.addImage(hc.toDataURL("image/jpeg", 0.88), "JPEG", margin, margin, cw, th.h / MM);
          hc.width = hc.height = 0;
          offset = th.h / MM;
        }
        var canvas = await root.html2canvas(body, {
          scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
          x: 0, y: y, width: cw * MM, height: h, windowWidth: Math.ceil(cw * MM), scrollY: -window.scrollY
        });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", margin, margin + offset, cw, h / MM);
        canvas.width = canvas.height = 0;
        pdf.setFontSize(8); pdf.setTextColor(122, 117, 104);
        pdf.text(footer, margin, ph - margin + 2);
        pdf.text("Page " + (i + 1) + " of " + slices.length, pw - margin, ph - margin + 2, { align: "right" });
      }
      return pdf;
    } finally {
      body.setAttribute("style", old);
      if (!old) body.removeAttribute("style");
      document.documentElement.classList.remove("aakar-capturing");
    }
  }

  function canShare(file) {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch (e) { return false; }
  }
  function openBlob(file) {
    var url = URL.createObjectURL(file);
    var a = document.createElement("a");
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function offer(file) {
    var b = box("PDF ready: <b>" + escHtml(file.name) + "</b><br>"
      + (canShare(file) ? '<button type="button" data-a="share">SHARE PDF</button>' : "")
      + '<button type="button" data-a="save">SAVE / OPEN PDF</button><button type="button" class="w" data-a="close">CLOSE</button>');
    b.onclick = function (ev) {
      var a = ev.target && ev.target.getAttribute && ev.target.getAttribute("data-a");
      if (a === "share") navigator.share({ files: [file], title: file.name }).catch(function () {});
      else if (a === "save") openBlob(file);
      else if (a === "close") closeBox();
    };
  }

  var busy = false;
  root.__aakarPdf = async function (name) {
    if (busy) return;
    busy = true;
    try {
      box("Preparing PDF…");
      await waitReady();
      await getLibs();
      var jsPDF = root.jspdf && root.jspdf.jsPDF;
      if (!root.html2canvas || !jsPDF) throw new Error("PDF tools did not load");
      var pages = Array.prototype.slice.call(document.querySelectorAll("section.page"));
      var pdf = pages.length ? await buildPages(pages, jsPDF) : await buildFlow(jsPDF);
      var file = new File([pdf.output("blob")], fileName(name), { type: "application/pdf" });
      if (canShare(file)) {
        try { await navigator.share({ files: [file], title: file.name }); closeBox(); return; }
        catch (e) { if (e && e.name === "AbortError") { closeBox(); return; } }
      }
      offer(file); // iPhone wants a fresh tap to share after the PDF took a while
    } catch (e) {
      box("Could not make the PDF: " + escHtml(e && e.message ? e.message : e) + '<br><button type="button" class="w" onclick="this.parentNode.remove()">CLOSE</button>');
    } finally {
      busy = false;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
