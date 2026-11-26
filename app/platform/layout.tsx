// The product owner page is its own installable app: its own name, icons and manifest (scope /platform), separate from the society app.
import type { Metadata } from "next";
import PlatformPwa from "./PlatformPwa";

export const metadata: Metadata = {
  title: "AanganOne Platform",
  description: "Product owner page: create and look after societies.",
  manifest: "/platform.webmanifest",
  applicationName: "AanganOne Platform",
  appleWebApp: { capable: true, title: "AanganOne", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<PlatformPwa /></>;
}
