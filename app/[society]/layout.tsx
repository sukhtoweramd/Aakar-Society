// A society's own address (/<word>): its name for the browser tab and the home-screen label, its manifest and icons.
// The first society (and a word that is not a society) keeps the app's default head from app/layout.tsx. Public facts only (society_public).
import type { Metadata } from "next";
import { ownFilesWord, shortNameOf } from "@/lib/societyPwa";
import { publicSociety } from "@/lib/societyPublicServer";

export async function generateMetadata({ params }: { params: Promise<{ society: string }> }): Promise<Metadata> {
  const { society } = await params;
  const word = ownFilesWord(society);
  const s = word ? await publicSociety(word) : null;
  if (!word || !s) return {};
  const name = s.name || word;
  return {
    title: name, description: `${name} society app`, manifest: `/api/society-manifest/${word}`, applicationName: name,
    appleWebApp: { capable: true, title: shortNameOf(name), statusBarStyle: "default" },
    icons: { icon: `/api/society-icon/${word}/192`, apple: `/api/society-icon/${word}/180` },
  };
}

export default function SocietyLayout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
