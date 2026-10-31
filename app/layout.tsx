import "./globals.css";
import type { Metadata, Viewport } from "next";
import PwaRegister from "./ledger/PwaRegister";

export const metadata: Metadata = {
  title: "Aakar Co-op • Sukh Tower",
  description: "Aakar Co-op Housing Society Ltd. G-16551 • Sukh Tower, Naranpura, Ahmedabad",
  manifest: "/manifest.webmanifest",
  applicationName: "Aakar Co-op",
  appleWebApp: { capable: true, title: "Aakar Co-op", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f1d3d",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1, // iPhone Safari zooms the whole page OUT to fit anything wider than the screen; this stops that (pinch-zoom in still works)
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
