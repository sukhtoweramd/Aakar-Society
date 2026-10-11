export const dynamic = 'force-dynamic';
"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Flat = {
  id: string;
  flat_no: string;
  tower: string;
  owner_name: string | null;
  mobile: string | null;
  r2_url: string | null;
  created_at?: string;
};

const TOWERS = ["All", "A", "B", "C"];
const ADMIN_USER = "admin";
const ADMIN_PASS = "aakar2024";

export default function Home() {
  const [flats, setFlats] = useState<Flat[]>([]);
  const [filterTower, setFilterTower] = useState("All");
  const [search, setSearch] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    fetchFlats();
    const saved = localStorage.getItem("aakar_user");
    if (saved) {
      const u = JSON.parse(saved);
      setIsLoggedIn(true);
      setUser(u.user);
      setRole(u.role);
    }
  }, []);

  async function fetchFlats() {
    const { data } = await supabase.from("flats").select("*").order("flat_no");
    if (data) {
      if (data.length === 0) {
        // seed 90 flats if empty
        const seed: any[] = [];
        for (let t of ["A", "B", "C"]) {
          for (let f = 1; f <= 3; f++) {
            for (let n = 1; n <= 10; n++) {
              const flatNo = `${t}-${f}0${n}`.replace("00", "0").replace(/(\d)0(\d)/, "$1$2");
              // simpler: A-101 to A-310 etc
              const floor = f;
              const flatNum = n;
              const finalNo = `${t}-${floor}${flatNum.toString().padStart(2, "0")}`;
              seed.push({ flat_no: finalNo, tower: t, owner_name: null, r2_url: null });
            }
          }
        }
        // Actually correct generation A-101..A-310, B-101.. etc
        const correct: any[] = [];
        ["A","B","C"].forEach(tower => {
          for (let floor=1; floor<=3; floor++) {
            for (let flat=1; flat<=10; flat++) {
              correct.push({ flat_no: `${tower}-${floor}${String(flat).padStart(2,"0")}`, tower, owner_name: null, r2_url: null });
            }
          }
        });
        if (correct.length) {
          await supabase.from("flats").insert(correct);
          const { data: data2 } = await supabase.from("flats").select("*").order("flat_no");
          if (data2) setFlats(data2);
        }
      } else {
        setFlats(data);
      }
    }
  }

  function handleLogin() {
    if (loginUser === ADMIN_USER && loginPass === ADMIN_PASS) {
      setIsLoggedIn(true);
      setUser("admin");
      setRole("admin");
      localStorage.setItem("aakar_user", JSON.stringify({ user: "admin", role: "admin" }));
    } else if (loginUser.match(/^[A-C]-\d{3}$/i) && loginPass === "1234") {
      setIsLoggedIn(true);
      setUser(loginUser.toUpperCase());
      setRole("resident");
      localStorage.setItem("aakar_user", JSON.stringify({ user: loginUser.toUpperCase(), role: "resident" }));
    } else {
      alert("Invalid: Admin admin/aakar2024 | Resident A-101/1234");
    }
  }

  function handleLogout() {
    setIsLoggedIn(false);
    setUser("");
    setRole("");
    localStorage.removeItem("aakar_user");
  }

  async function handleUpload(flat: Flat, e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(flat.flat_no);
    const form = new FormData();
    form.append("file", file);
    form.append("flat_no", flat.flat_no);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const json = await res.json();
    if (json.url) {
      await supabase.from("flats").update({ r2_url: json.url }).eq("flat_no", flat.flat_no);
      fetchFlats();
    }
    setUploading(null);
  }

  const filtered = flats.filter(f => {
    const towerOk = filterTower === "All" || f.tower === filterTower;
    const searchOk = search === "" || f.flat_no.toLowerCase().includes(search.toLowerCase()) || (f.owner_name && f.owner_name.toLowerCase().includes(search.toLowerCase()));
    return towerOk && searchOk;
  });

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Aakar Sukh Tower</h1>
          <p className="text-slate-500 mb-6">Ahmedabad • 90 Flats • Secure Vault</p>
          <input className="w-full border rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Username: admin or A-101" value={loginUser} onChange={e=>setLoginUser(e.target.value)} />
          <input className="w-full border rounded-lg px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Password" type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} />
          <button onClick={handleLogin} className="w-full bg-blue-600 text-white rounded-lg py-3 font-semibold hover:bg-blue-700">Login</button>
          <div className="mt-4 text-xs text-slate-400">Admin: admin / aakar2024 | Resident: A-101 / 1234</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">Aakar Sukh Tower - Ahmedabad | 90 Flats</h1>
            <p className="text-sm text-slate-500">Welcome {user} ({role}) • Tower {filterTower === "All" ? "All" : filterTower}</p>
          </div>
          <button onClick={handleLogout} className="border px-4 py-1.5 rounded-lg hover:bg-slate-50">Logout</button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-2 mb-6">
          <input className="border rounded-lg px-4 py-2 w-64" placeholder="Search flat e.g. A-101" value={search} onChange={e=>setSearch(e.target.value)} />
          {TOWERS.map(t => (
            <button key={t} onClick={()=>setFilterTower(t)} className={`px-4 py-2 rounded-lg border ${filterTower===t ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"}`}>Tower {t}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(flat => (
            <div key={flat.flat_no} className="bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="text-lg font-bold">{flat.flat_no}</div>
                  <div className="text-sm text-slate-500">Tower {flat.tower}</div>
                </div>
                <div className={`text-xs px-2 py-1 rounded-full ${flat.owner_name ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>{flat.owner_name ? "Occupied" : "Vacant"}</div>
              </div>
              <div className="text-sm mb-3 min-h-[20px]">{flat.owner_name || <span className="text-slate-400">No owner assigned</span>}</div>
              <div className="flex gap-2">
                {flat.r2_url ? (
                  <a href={flat.r2_url} target="_blank" className="text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100">View Document</a>
                ) : (
                  <span className="text-xs text-slate-400 py-1.5">No document</span>
                )}
                {(role === "admin" || user === flat.flat_no) && (
                  <label className="ml-auto text-sm bg-slate-900 text-white px-3 py-1.5 rounded-lg cursor-pointer hover:bg-black">
                    {uploading === flat.flat_no ? "Uploading..." : "Upload"}
                    <input type="file" className="hidden" onChange={(e)=>handleUpload(flat,e)} />
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
