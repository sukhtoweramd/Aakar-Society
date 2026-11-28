"use client";
// ADMIN -> LEGAL DOCUMENTS (PR 1 of the terms / privacy series): the society owner can READ the documents that members will be asked to accept.
// Read only: nothing is stored here and nothing is shown to members yet. The words come from lib/legalDocs.ts (one place); drafts are marked DRAFT.
import { LEGAL_DOCS, renderDoc, type LegalDoc } from "@/lib/legalDocs";
import { societyTitle } from "@/lib/society";

const chip = (s: string) => (s === "published" ? "bg-emerald-50 text-emerald-800 border-emerald-300" : s === "retired" ? "bg-slate-100 text-slate-700 border-slate-300" : "bg-amber-50 text-amber-800 border-amber-300");

function Doc({ doc }: { doc: LegalDoc }) {
  const d = renderDoc(doc, societyTitle());
  return (
    <details className="border border-[var(--border)] bg-[var(--surface)] min-w-0">
      <summary className="p-4 cursor-pointer min-h-[44px] flex flex-wrap items-center gap-2">
        <span className="serif text-[17px] min-w-0">{d.title}</span>
        <span className="mono text-[10px] opacity-70">version {d.version}</span>
        <span className={`mono text-[9px] font-bold border px-1.5 py-0.5 uppercase ${chip(d.status)}`}>{d.status}</span>
      </summary>
      <div className="px-4 pb-4 space-y-3">
        <div className="mono text-[11px] opacity-70">{d.between}</div>
        {d.sections.map((s) => (
          <div key={s.title}>
            <div className="mono text-[12.5px] font-bold">{s.title}</div>
            {s.paras?.map((p, i) => <p key={i} className="mono text-[12px] opacity-85 mt-1 break-words">{p}</p>)}
            {s.bullets && <ul className="list-disc pl-5 mt-1 space-y-1">{s.bullets.map((b, i) => <li key={i} className="mono text-[12px] opacity-85 break-words">{b}</li>)}</ul>}
          </div>
        ))}
      </div>
    </details>
  );
}

export default function LegalDocsPanel() {
  return (
    <div className="space-y-4">
      <div className="border border-[var(--border)] bg-[var(--surface)] p-4 mono text-[12px] space-y-1">
        <div className="text-[10px] font-bold tracking-[0.14em]">LEGAL DOCUMENTS • PREVIEW</div>
        <p className="opacity-85">These are the documents members will be asked to accept in a later step. Nothing is shown to members yet and nothing is recorded. Documents marked DRAFT can still change.</p>
        <p className="opacity-85">They are plain-language texts written with the DPDP Act, 2023 and the DPDP Rules, 2025 in mind. They do not promise that every legal requirement is met and they are not legal advice: please have a lawyer check them before they are published.</p>
      </div>
      {LEGAL_DOCS.map((d) => <Doc key={`${d.key}-${d.version}`} doc={d} />)}
    </div>
  );
}
