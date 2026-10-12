// Excel upload -> adds or updates flats (matched by flat ID). Never deletes flats,
// so linked members / maintenance records stay intact. Admin login required.
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthedClient } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

// Accept common header spellings: "Tower"/"Wing", "Flat No"/"flat_no", etc.
function pick(r: Record<string, any>, names: string[]): string | undefined {
  const keys = Object.keys(r);
  for (const n of names) {
    const k = keys.find((k) => k.toLowerCase().replace(/[^a-z]/g, "") === n);
    if (k !== undefined && r[k] !== null && String(r[k]).trim() !== "") return String(r[k]).trim();
  }
  return undefined;
}
const toInt = (v?: string) => (v === undefined || isNaN(parseInt(v, 10)) ? undefined : parseInt(v, 10));

export async function POST(req: NextRequest) {
  const auth = await getAuthedClient(req);
  if (!auth) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "File is larger than 4 MB." }, { status: 400 });

    const wb = XLSX.read(await file.arrayBuffer());
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

    const problems: string[] = [];
    const records: Record<string, any>[] = [];
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const tower = pick(r, ["tower", "wing"])?.toUpperCase();
      let flatNo = pick(r, ["flatno", "flat", "flatnumber"]);
      if (!tower || !flatNo) { problems.push(`Row ${i + 2}: Tower and Flat No are required`); return; }
      flatNo = flatNo.toUpperCase().startsWith(`${tower}-`) ? flatNo.toUpperCase() : `${tower}-${flatNo}`;
      const id = pick(r, ["id", "flatid"]) || flatNo;
      if (seen.has(id)) { problems.push(`Row ${i + 2}: duplicate flat ${id}`); return; }
      seen.add(id);
      // Only send columns that are filled in, so blanks don't wipe existing data.
      const rec: Record<string, any> = { id, tower, flat_no: flatNo };
      const set = (col: string, v: any) => { if (v !== undefined) rec[col] = v; };
      set("floor", toInt(pick(r, ["floor"])));
      set("owner_name", pick(r, ["ownername", "owner", "name"]));
      set("bhk", pick(r, ["bhk", "type"]));
      set("maintenance", toInt(pick(r, ["maintenance", "maintenanceamount"])));
      set("email", pick(r, ["email", "emailid"]));
      set("status", pick(r, ["status"]));
      const committee = pick(r, ["committee", "iscommittee"]);
      if (committee !== undefined) rec.is_committee = ["yes", "y", "true", "1"].includes(committee.toLowerCase());
      records.push(rec);
    });

    if (problems.length) return NextResponse.json({ error: `Nothing changed. Fix these rows first:\n${problems.slice(0, 10).join("\n")}` }, { status: 400 });
    if (!records.length) return NextResponse.json({ error: "Nothing changed. The sheet has no rows." }, { status: 400 });

    // Upsert row by row so a partially-filled row only updates its own columns.
    let count = 0;
    for (const rec of records) {
      const { error } = await auth.db.from("flats").upsert(rec, { onConflict: "id" });
      if (error) return NextResponse.json({ error: `Stopped at flat ${rec.id} after ${count} saved: ${error.message}` }, { status: 500 });
      count++;
    }
    return NextResponse.json({ ok: true, count });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}
