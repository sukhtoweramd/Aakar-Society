"use client";
// Committee logins' names by email, for "Entered by". Committee viewers only (members never load this list).
import { useEffect, useState } from "react";
import { api } from "@/lib/ledgerClient";

export function useCommitteeNames(isCommittee: boolean): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isCommittee) return;
    let live = true;
    api("/api/committee").then((j: any) => {
      if (!live) return;
      const m: Record<string, string> = {};
      for (const x of j.members || []) if (x.email && x.name) m[String(x.email).toLowerCase()] = String(x.name);
      setNames(m);
    }).catch(() => { /* the email alone is still shown */ });
    return () => { live = false; };
  }, [isCommittee]);
  return names;
}
