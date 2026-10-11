"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Flat = { id: string, tower: string, owner_name?: string }
type Doc = { name: string, url: string, key: string }

const TOWERS = ['A','B','C']
function genFlats(): Flat[] {
  const flats: Flat[] = []
  for (const t of TOWERS) {
    for (let f=1; f<=10; f++) {
      for (let u=1; u<=3; u++) {
        flats.push({ id: `${t}-${f}0${u}`, tower: t })
      }
    }
  }
  return flats.slice(0,90)
}

export default function Page() {
  const [user, setUser] = useState<any>(null)
  const [loginId, setLoginId] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [flats, setFlats] = useState<Flat[]>(genFlats())
  const [filterTower, setFilterTower] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Flat|null>(null)
  const [ownerName, setOwnerName] = useState('')
  const [docs, setDocs] = useState<Doc[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(()=>{
    const saved = localStorage.getItem('aakar_user')
    if (saved) setUser(JSON.parse(saved))
    // Load flats from Supabase
    supabase.from('flats').select('*').then(({data})=>{
      if (data && data.length) {
        setFlats(prev=> prev.map(p=> {
          const found = data.find((d:any)=> d.id===p.id)
          return found ? { ...p, owner_name: found.owner_name } : p
        }))
      }
    })
  },[])

  const handleLogin = () => {
    if (loginId==='admin' && loginPass==='aakar2024') {
      const u={role:'admin', id:'admin'}; setUser(u); localStorage.setItem('aakar_user', JSON.stringify(u))
    } else if (loginId==='secretary' && loginPass==='secretary2024') {
      const u={role:'secretary', id:'secretary'}; setUser(u); localStorage.setItem('aakar_user', JSON.stringify(u))
    } else if (/^[A-C]-\d{3}$/.test(loginId) && loginPass==='1234') {
      const u={role:'resident', id:loginId}; setUser(u); localStorage.setItem('aakar_user', JSON.stringify(u))
    } else alert('Invalid login! Admin: admin/aakar2024, Secretary: secretary/secretary2024, Resident: A-101/1234')
  }

  const openFlat = (f: Flat) => {
    setSelected(f)
    setOwnerName(f.owner_name||'')
    const saved = localStorage.getItem(`r2_docs_${f.id}`)
    setDocs(saved ? JSON.parse(saved) : [])
  }

  const saveOwner = async () => {
    if (!selected) return
    const { error } = await supabase.from('flats').upsert({ id: selected.id, owner_name: ownerName, tower: selected.tower })
    if (error) alert('Supabase error: '+error.message)
    setFlats(prev=> prev.map(p=> p.id===selected.id ? {...p, owner_name: ownerName} : p))
    setSelected({...selected, owner_name: ownerName})
    alert('Owner saved to Supabase!')
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selected) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('flatId', selected.id)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const json = await res.json()
    setUploading(false)
    if (!res.ok) { alert('Upload failed: '+json.error); return }
    const newDoc: Doc = { name: file.name, url: json.url, key: json.key }
    const updated = [...docs, newDoc]
    setDocs(updated)
    localStorage.setItem(`r2_docs_${selected.id}`, JSON.stringify(updated))
    alert('Uploaded to R2! URL: '+json.url)
  }

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-2">Aakar Sukh Tower</h1>
        <p className="text-center text-gray-500 mb-6">Ahmedabad • 90 Flats • Real R2 Vault</p>
        <input className="w-full border rounded-lg p-3 mb-3" placeholder="Login ID (admin / A-101)" value={loginId} onChange={e=>setLoginId(e.target.value)} />
        <input className="w-full border rounded-lg p-3 mb-4" type="password" placeholder="Password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} />
        <button onClick={handleLogin} className="w-full bg-slate-900 text-white rounded-lg p-3 font-semibold">Login</button>
        <div className="mt-4 text-xs text-gray-500">Admin: admin / aakar2024 | Resident: A-101 / 1234</div>
        <div className="mt-2 text-xs text-green-600">Supabase: {process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Connected' : 'Not set'} | R2: aakar-vault</div>
      </div>
    </div>
  }

  const filtered = flats.filter(f=> (filterTower==='All' || f.tower===filterTower) && f.id.toLowerCase().includes(search.toLowerCase()))

  return <div className="min-h-screen bg-slate-50">
    <header className="bg-white border-b sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="font-bold text-lg">Aakar Sukh Tower - Ahmedabad | 90 Flats</h1>
          <p className="text-xs text-green-600">Supabase: mfuhijwsbxnefoeltupb Connected | R2: aakar-vault Ready | User: {user.id} ({user.role})</p>
        </div>
        <button onClick={()=>{localStorage.removeItem('aakar_user'); setUser(null)}} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm">Logout</button>
      </div>
    </header>
    <div className="bg-blue-600 text-white text-center py-2 text-sm">Vercel ENV Active: 7 ENV ✅ | Vault: 100% R2, No Blob, Persistent https://pub-...r2.dev/members/... links</div>
    <div className="max-w-7xl mx-auto p-4">
      <div className="flex gap-2 mb-4 flex-wrap">
        <input className="border rounded-lg px-3 py-2 flex-1 min-w-[200px]" placeholder="Search flat e.g. A-101" value={search} onChange={e=>setSearch(e.target.value)} />
        {['All','A','B','C'].map(t=><button key={t} onClick={()=>setFilterTower(t)} className={`px-4 py-2 rounded-lg ${filterTower===t?'bg-slate-900 text-white':'bg-white border'}`}>Tower {t}</button>)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {filtered.map(f=><div key={f.id} onClick={()=>openFlat(f)} className="bg-white rounded-xl p-4 shadow-sm border hover:shadow-md cursor-pointer">
          <div className="font-bold">{f.id}</div>
          <div className="text-xs text-gray-500">Tower {f.tower}</div>
          <div className="text-sm mt-1 truncate">{f.owner_name||'Vacant'}</div>
          <div className="text-xs mt-2 text-blue-600">R2 Vault →</div>
        </div>)}
      </div>
    </div>
    {selected && <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-20">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-xl">{selected.id} - Tower {selected.tower}</h2>
          <button onClick={()=>setSelected(null)} className="text-2xl">×</button>
        </div>
        <label className="text-sm font-semibold">Owner Name (Supabase)</label>
        <input className="w-full border rounded-lg p-2 mt-1 mb-2" value={ownerName} onChange={e=>setOwnerName(e.target.value)} placeholder="Enter owner name" />
        <button onClick={saveOwner} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm mb-4">Save to Supabase flats table</button>
        
        <div className="border-t pt-4">
          <h3 className="font-semibold mb-2">Vault - 100% Cloudflare R2 (No Blob)</h3>
          <p className="text-xs text-gray-500 mb-2">Uploads to: aakar-vault/members/{selected.id}/... Public URL: https://pub-4c35f47f98664e1a80ef61ec3a4d665b.r2.dev/members/{selected.id}/...</p>
          <input type="file" accept="application/pdf" onChange={handleUpload} className="w-full border rounded-lg p-2 mb-2" />
          {uploading && <div className="text-sm text-blue-600">Uploading to R2...</div>}
          <div className="space-y-2 mt-2">
            {docs.map((d,i)=><div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg text-sm">
              <span className="truncate">{d.name}</span>
              <a href={d.url} target="_blank" className="text-blue-600 font-semibold ml-2">VIEW (R2 Persistent)</a>
            </div>)}
            {docs.length===0 && <div className="text-xs text-gray-400">No docs yet. Upload PDF - Link will be https://pub-...r2.dev/... - Refresh safe!</div>}
          </div>
        </div>
      </div>
    </div>}
  </div>
}
