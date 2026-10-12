"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type Flat = { id: string; tower: string | null; floor: number | null; flat_no: string | null; bhk: string | null; maintenance: number | null; email: string | null; owner_name: string | null; is_committee: boolean | null; status: string | null; r2_url?: string | null };
type Notice = { id: string; title: string | null; content: string | null; tower: string | null; file_url?: string | null; created_by?: string | null; created_at: string };

// "101" in tower A -> "A-101"; "A-101" stays "A-101"
const flatLabel = (f: Flat) => {
  const no = f.flat_no || f.id;
  return !f.tower || no.toUpperCase().startsWith(`${f.tower.toUpperCase()}-`) ? no : `${f.tower}-${no}`;
};
const statusColor = (s: string | null) => {
  const v = (s || "").toLowerCase();
  if (["sold", "occupied", "approved", "active", "paid"].includes(v)) return { border: "border-green-500", pill: "bg-green-100 text-green-700" };
  if (["pending", "vacant", "available"].includes(v)) return { border: "border-amber-400", pill: "bg-amber-100 text-amber-700" };
  return { border: "border-slate-300", pill: "bg-slate-100 text-slate-600" };
};
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loginError, setLoginError] = useState("");

  const [flats, setFlats] = useState<Flat[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<"flats" | "notices" | "reports">("flats");
  const [filterTower, setFilterTower] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeDesc, setNoticeDesc] = useState("");
  const [noticeFile, setNoticeFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) { loadFlats(); loadNotices(); } }, [session?.user.id]);

  async function loadFlats() {
    const { data, error } = await supabase.from("flats").select("*").order("tower").order("flat_no");
    if (error) setLoadError(`Could not load flats: ${error.message}`);
    else setFlats(data || []);
  }
  async function loadNotices() {
    const { data, error } = await supabase.from("notices").select("*").order("created_at", { ascending: false });
    if (error) setLoadError(`Could not load notices: ${error.message}`);
    else setNotices(data || []);
  }

  // Calls our API routes with the logged-in user's token.
  async function api(path: string, init: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${data.session?.access_token || ""}` } });
    const j = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
    if (!res.ok || j.error) throw new Error(j.error || `Server error ${res.status}`);
    return j;
  }

  async function uploadFile(file: File, folder: "notices" | "flats"): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", folder);
    return (await api("/api/file", { method: "POST", body: fd })).url;
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setBusy("login");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setBusy(null);
    if (error) setLoginError(error.message === "Invalid login credentials" ? "Wrong email or password" : error.message);
    else setPass("");
  }

  async function logout() {
    await supabase.auth.signOut();
    setFlats([]); setNotices([]);
  }

  async function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!confirm(`Add/update flats from "${file.name}"? Existing flats with the same ID will be updated; nothing is deleted.`)) return;
    setBusy("excel");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const j = await api("/api/upload", { method: "POST", body: fd });
      alert(`Saved ${j.count} flats.`);
      loadFlats();
    } catch (err: any) { alert(err.message); }
    setBusy(null);
  }

  async function handleFlatDoc(flat: Flat, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(`flat-${flat.id}`);
    try {
      const url = await uploadFile(file, "flats");
      const { error } = await supabase.from("flats").update({ r2_url: url }).eq("id", flat.id);
      if (error) throw error;
      if (flat.r2_url) api("/api/file", { method: "DELETE", body: JSON.stringify({ url: flat.r2_url }) }).catch(() => {});
      loadFlats();
    } catch (err: any) { alert(err.message); }
    setBusy(null);
  }

  async function addNotice() {
    if (!noticeTitle.trim()) { alert("Enter a title"); return; }
    setBusy("notice");
    try {
      const fileUrl = noticeFile ? await uploadFile(noticeFile, "notices") : null;
      const { error } = await supabase.from("notices").insert([{ title: noticeTitle.trim(), content: noticeDesc.trim(), file_url: fileUrl, created_by: session?.user.email }]);
      if (error) throw error;
      setNoticeTitle(""); setNoticeDesc(""); setNoticeFile(null); setFileInputKey((k) => k + 1);
      loadNotices();
    } catch (err: any) { alert(err.message); }
    setBusy(null);
  }

  async function deleteNotice(n: Notice) {
    if (!confirm(`Delete notice "${n.title}"?`)) return;
    const { error } = await supabase.from("notices").delete().eq("id", n.id);
    if (error) { alert(error.message); return; }
    if (n.file_url) api("/api/file", { method: "DELETE", body: JSON.stringify({ url: n.file_url }) }).catch(() => {});
    loadNotices();
  }

  function exportCSV() {
    const headers = ["Tower", "Floor", "Flat No", "Owner Name", "BHK", "Maintenance", "Email", "Committee", "Status"];
    const rows = flats.map((f) => [f.tower ?? "", f.floor ?? "", flatLabel(f), f.owner_name ?? "", f.bhk ?? "", f.maintenance ?? "", f.email ?? "", f.is_committee ? "Yes" : "", f.status ?? ""]);
    const csv = "﻿" + [headers, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "Aakar_Society_Directory.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportPDF() {
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to create the PDF."); return; }
    const html = `<html><head><title>Aakar Sukh Tower - Directory</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#1e293b}h1{text-align:center;color:#4338ca;margin-bottom:4px}.meta{text-align:center;color:#64748b;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#4338ca;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr:nth-child(even) td{background:#f8fafc}</style></head><body><h1>Aakar Sukh Tower - Directory Report</h1><div class="meta">Ahmedabad &middot; Date: ${esc(new Date().toLocaleDateString("en-IN"))} &middot; Total flats: ${flats.length} &middot; With owner: ${flats.filter((f) => f.owner_name).length} &middot; By: ${esc(session?.user.email)}</div><table><tr><th>Tower</th><th>Flat No</th><th>Owner</th><th>BHK</th><th>Maintenance</th><th>Email</th><th>Status</th></tr>${flats.map((f) => `<tr><td>${esc(f.tower)}</td><td>${esc(flatLabel(f))}</td><td>${esc(f.owner_name)}${f.is_committee ? " (Committee)" : ""}</td><td>${esc(f.bhk)}</td><td>${esc(f.maintenance)}</td><td>${esc(f.email)}</td><td>${esc(f.status)}</td></tr>`).join("")}</table></body></html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  if (checking) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 p-4">
      <form onSubmit={login} className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <h1 className="text-2xl font-bold text-center text-indigo-700">Aakar Sukh Tower</h1>
        <p className="text-center text-sm text-slate-500 mb-6">Ahmedabad · Committee login</p>
        <input className="w-full border p-3 rounded-lg mb-3" type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full border p-3 rounded-lg mb-4" type="password" autoComplete="current-password" placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} required />
        {loginError && <p className="text-red-600 text-sm mb-3">{loginError}</p>}
        <button disabled={busy === "login"} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white p-3 rounded-lg font-bold">{busy === "login" ? "Logging in…" : "Login"}</button>
      </form>
    </div>
  );

  const q = search.trim().toLowerCase();
  const filtered = flats.filter((f) =>
    (filterTower === "All" || f.tower === filterTower) &&
    (filterStatus === "All" || f.status === filterStatus) &&
    (!q || flatLabel(f).toLowerCase().includes(q) || (f.owner_name || "").toLowerCase().includes(q)));
  const towers = Array.from(new Set(flats.map((f) => f.tower).filter(Boolean))).sort() as string[];
  const statuses = Array.from(new Set(flats.map((f) => f.status).filter(Boolean))).sort() as string[];
  const withOwner = flats.filter((f) => f.owner_name).length;
  const tabBtn = (t: typeof tab, label: string) => (
    <button onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-bold ${tab === t ? "bg-white text-indigo-700" : "bg-white/20 hover:bg-white/30"}`}>{label}</button>
  );

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4">
        <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-2">
          <div>
            <h1 className="font-bold text-lg">Aakar Sukh Tower</h1>
            <p className="text-xs text-white/80">{session.user.email}</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {tabBtn("flats", `Flats (${flats.length})`)}
            {tabBtn("notices", `Notices (${notices.length})`)}
            {tabBtn("reports", "Reports")}
            <button onClick={logout} className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg text-sm">Logout</button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        {loadError && <div className="m-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{loadError}</div>}

        {tab === "flats" && <>
          <div className="p-4 flex gap-2 flex-wrap items-center">
            <input className="border p-2 rounded-lg w-full sm:w-56" placeholder="Search flat or owner" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={filterTower} onChange={(e) => setFilterTower(e.target.value)} className="border p-2 rounded-lg bg-white">
              <option value="All">All towers</option>{towers.map((t) => <option key={t} value={t}>Tower {t}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border p-2 rounded-lg bg-white">
              <option value="All">All status</option>{statuses.map((s) => <option key={s}>{s}</option>)}
            </select>
            <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg cursor-pointer font-bold text-sm sm:ml-auto">
              {busy === "excel" ? "Uploading…" : "📤 Upload Excel"}
              <input type="file" hidden accept=".xlsx,.xls" onChange={handleExcel} disabled={!!busy} />
            </label>
          </div>
          {flats.length === 0 && !loadError && <p className="px-4 text-slate-500">No flats yet. Upload an Excel sheet with columns: Tower, Floor, Flat No, Owner Name, BHK, Maintenance, Email, Status.</p>}
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((f) => (
              <div key={f.id} className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${statusColor(f.status).border}`}>
                <div className="flex justify-between items-start">
                  <b className="text-lg">{flatLabel(f)}</b>
                  {f.status && <span className={`text-xs px-2 py-1 rounded-full ${statusColor(f.status).pill}`}>{f.status}</span>}
                </div>
                <div className="text-sm mt-1">{f.owner_name || <span className="text-slate-400">No owner</span>}{f.is_committee && <span className="ml-2 text-xs text-indigo-600 font-semibold">Committee</span>}</div>
                <div className="text-xs text-slate-500">{[f.bhk && `${f.bhk} BHK`.replace(/BHK BHK/i, "BHK"), f.maintenance != null && `₹${f.maintenance}/month`, f.email].filter(Boolean).join(" · ")}</div>
                <div className="flex gap-2 mt-3 items-center">
                  {f.r2_url ? <a href={f.r2_url} target="_blank" rel="noopener noreferrer" className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100">📎 Document</a> : <span className="text-xs text-slate-400">No document</span>}
                  <label className="ml-auto text-xs bg-slate-800 hover:bg-black text-white px-3 py-1.5 rounded-lg cursor-pointer">
                    {busy === `flat-${f.id}` ? "Uploading…" : f.r2_url ? "Replace" : "Upload"}
                    <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(e) => handleFlatDoc(f, e)} disabled={!!busy} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </>}

        {tab === "notices" && (
          <div className="p-4 max-w-4xl mx-auto">
            <div className="bg-white rounded-xl p-6 shadow-sm mb-6 border border-indigo-100">
              <h2 className="font-bold text-lg mb-4">📢 Add Notice</h2>
              <input className="w-full border p-3 rounded-lg mb-3" placeholder="Title" value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} />
              <textarea className="w-full border p-3 rounded-lg mb-3" rows={4} placeholder="Type notice…" value={noticeDesc} onChange={(e) => setNoticeDesc(e.target.value)} />
              <div className="flex flex-wrap gap-2 items-center mb-3">
                <input key={fileInputKey} type="file" onChange={(e) => setNoticeFile(e.target.files?.[0] || null)} className="text-sm" accept=".pdf,.jpg,.jpeg,.png,.docx" />
                <span className="text-xs text-slate-500">Optional · PDF, JPG, PNG or DOCX · max 4 MB</span>
              </div>
              <button onClick={addNotice} disabled={!!busy} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-6 py-2 rounded-lg font-bold">{busy === "notice" ? "Publishing…" : "Publish"}</button>
            </div>
            <div className="space-y-3">
              {notices.length === 0 && <p className="text-slate-500">No notices yet.</p>}
              {notices.map((n) => (
                <div key={n.id} className="bg-white rounded-xl p-4 shadow-sm flex justify-between gap-4">
                  <div>
                    <div className="font-bold">{n.title}{n.tower && n.tower !== "All" && <span className="ml-2 text-xs text-slate-500 font-normal">Tower {n.tower}</span>}</div>
                    {n.content && <div className="text-sm text-slate-600 whitespace-pre-wrap">{n.content}</div>}
                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(n.created_at).toLocaleString("en-IN")}{n.created_by ? ` · ${n.created_by}` : ""}
                      {n.file_url && <a href={n.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 ml-2 underline">📎 View file</a>}
                    </div>
                  </div>
                  <button onClick={() => deleteNotice(n)} className="text-red-500 text-sm self-start">Delete</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "reports" && (
          <div className="p-4 max-w-4xl mx-auto">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[["Total flats", flats.length, "text-slate-800"], ["With owner", withOwner, "text-green-600"], ["No owner", flats.length - withOwner, "text-amber-600"]].map(([l, v, c]) => (
                <div key={l as string} className="bg-white rounded-xl p-4 shadow-sm text-center"><div className={`text-3xl font-bold ${c}`}>{v}</div><div className="text-xs text-slate-500">{l}</div></div>
              ))}
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="font-bold text-xl mb-4">Directory Reports</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border rounded-xl p-4"><h3 className="font-bold">📊 CSV / Excel</h3><p className="text-xs text-slate-500 mb-2">All flats with headings</p><button onClick={exportCSV} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold">Download CSV</button></div>
                <div className="border rounded-xl p-4"><h3 className="font-bold">📄 PDF Report</h3><p className="text-xs text-slate-500 mb-2">Choose “Save as PDF” in the print window</p><button onClick={exportPDF} className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-bold">Create PDF</button></div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
