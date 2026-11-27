// Public page: terms of use and privacy notice (DPDP Act, 2023). No login and no society data, so it speaks of "your housing society".
import type { Metadata } from "next";
import LegalView from "../ledger/LegalView";

export const metadata: Metadata = { title: "Terms & Privacy", description: "Terms of use and privacy notice (DPDP Act, 2023).", robots: { index: false, follow: false } };

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="bg-[var(--navy)] text-[#fdfcf5] mono text-[12px] tracking-[0.06em]">
        <div className="mx-auto max-w-[720px] px-4 min-h-[48px] flex items-center justify-between gap-3">
          <div className="font-semibold uppercase">Terms &amp; Privacy</div>
          <a href="javascript:history.back()" className="min-h-[44px] px-3 inline-flex items-center underline">← Back</a>
        </div>
      </div>
      <div className="mx-auto max-w-[720px] px-4 py-5"><LegalView /></div>
    </div>
  );
}
