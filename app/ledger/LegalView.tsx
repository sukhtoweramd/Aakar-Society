// Terms of use and privacy notice as readable cards. Used in ADMIN -> TERMS & PRIVACY and on the public /legal page. Phone first: one column, no tables.
import { LEGAL_UPDATED, privacySections, termsSections, type LegalSection } from "@/lib/legalText";

function Block({ title, items }: { title: string; items: LegalSection[] }) {
  return (
    <section className="space-y-2">
      <h2 className="serif text-[20px]">{title}</h2>
      {items.map((s) => (
        <div key={s.title} className="border border-[var(--border)] bg-[var(--surface)] p-4 min-w-0">
          <div className="mono text-[13px] font-bold">{s.title}</div>
          {s.paras?.map((p, i) => <p key={i} className="mono text-[12.5px] opacity-85 mt-1.5 break-words">{p}</p>)}
          {s.bullets && <ul className="list-disc pl-5 mt-1.5 space-y-1">{s.bullets.map((b, i) => <li key={i} className="mono text-[12.5px] opacity-85 break-words">{b}</li>)}</ul>}
        </div>
      ))}
    </section>
  );
}

export default function LegalView({ society }: { society?: string | null }) {
  return (
    <div className="space-y-6" data-testid="legal-view">
      <div className="mono text-[11px] opacity-60">Last updated {LEGAL_UPDATED}</div>
      <Block title="Privacy notice (DPDP Act, 2023)" items={privacySections(society)} />
      <Block title="Terms of use" items={termsSections(society)} />
    </div>
  );
}
