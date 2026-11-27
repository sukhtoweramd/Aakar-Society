// A society's own address (/<word>): its name for the browser tab and the home-screen label, its manifest and icons.
// The first society (and a word that is not a society) keeps the app's default head from app/layout.tsx. Public facts only (society_public).
import type { Metadata } from "next";
import { fallbackSociety, ownFilesWord, shortNameOf } from "@/lib/societyPwa";
import { lookupSociety } from "@/lib/societyPublicServer";

export async function generateMetadata({ params }: { params: Promise<{ society: string }> }): Promise<Metadata> {
  const { society: raw } = await params;
  const word = ownFilesWord(raw);
  if (!word) return {};
  const { society, failed } = await lookupSociety(word);
  if (!society && !failed) return {};               // the lookup worked: not a society, keep the app's default head
  const s = society || fallbackSociety(word);       // lookup failed: name from the address word, never the first society's
  const name = s.name || word;
  return {
    title: name, description: `${name} society app`, manifest: `/api/society-manifest/${word}`, applicationName: name,
    appleWebApp: { capable: true, title: shortNameOf(name), statusBarStyle: "default" },
    icons: { icon: `/api/society-icon/${word}/192`, apple: `/api/society-icon/${word}/180` },
  };
}

export default function SocietyLayout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
