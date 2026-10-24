"use client";
// Pictures and links for stored files, shown through short-lived signed links (lib/fileLinks.ts).
import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";
import { openFile, useFileLink } from "@/lib/fileLinks";

/** <img> for a stored file. Draws nothing until the signed link is ready (or if this login may not see it). */
export function SecureImg({ src, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string | null | undefined }) {
  const url = useFileLink(src);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={url} {...rest} />;
}

/** Link that opens a stored file in a new tab with a fresh link, after the login check. */
export function FileLink({ file, children, onClick, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target"> & { file: string | null | undefined; children: ReactNode }) {
  return (
    <a href="#" role="link" {...rest} onClick={(e) => { e.preventDefault(); onClick?.(e); openFile(file); }}>
      {children}
    </a>
  );
}
