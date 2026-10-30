"use client";
// Complaints (item 19): raised by a flat for an area of responsibility; closed by the responsible member.
import { supabase } from "./supabaseClient";
import { uploadFile } from "./ledgerClient";
import { compressForUpload } from "./compressFile";

export type Complaint = {
  id: string; complaint_no: string; flat_id: string; area_id: string | null; area_name: string | null;
  assigned_flat: string | null; backup_flat: string | null; backup_flats?: string[] | null; description: string; photo_key: string | null;
  status: "open" | "in_progress" | "closed"; progress_note: string | null; close_note: string | null;
  closed_at: string | null; closed_by: string | null; history: { at: string; by: string; status: string; note: string | null }[];
  created_by: string | null; created_at: string; updated_at: string;
};

export const STATUS: Record<Complaint["status"], { text: string; cls: string }> = {
  open: { text: "OPEN", cls: "bg-red-50 text-red-700 border-red-200" },
  in_progress: { text: "IN PROGRESS", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  closed: { text: "CLOSED", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const missing = (m: string) => /complaints|schema cache|does not exist/i.test(m);
/** null = not set up yet (run COMPLAINTS.sql). The database rules decide which complaints come back. */
export async function loadComplaints(): Promise<Complaint[] | null> {
  const { data, error } = await supabase.from("complaints").select("*").order("created_at", { ascending: false });
  if (error) return missing(error.message) ? null : [];
  return (data as Complaint[]) || [];
}

export async function raiseComplaint(flatId: string, areaId: string, description: string, photo: File | null) {
  let photo_key: string | null = null; let note = "";
  if (photo) {
    const c = await compressForUpload(photo);
    if (c.file.size > 4 * 1024 * 1024) throw new Error("The photo is larger than 4 MB even after compressing. Please take a smaller photo.");
    photo_key = (await uploadFile(c.file, `complaints/${flatId}`)).key;
    note = c.changed ? ` Photo compressed ${Math.round(c.before / 1024)} KB → ${Math.round(c.after / 1024)} KB.` : "";
  }
  const { data, error } = await supabase.from("complaints").insert({ flat_id: flatId, area_id: areaId, description: description.trim(), photo_key }).select("*").single();
  if (error) throw new Error(error.message);
  return { complaint: data as Complaint, note };
}

export async function setStatus(id: string, status: Complaint["status"], note: string | null) {
  const { data, error } = await supabase.rpc("update_complaint", { p_id: id, p_status: status, p_note: note });
  if (error) throw new Error(error.message);
  return data as Complaint;
}
export async function moveArea(id: string, areaId: string) {
  const { data, error } = await supabase.rpc("reassign_complaint", { p_id: id, p_area: areaId });
  if (error) throw new Error(error.message);
  return data as Complaint;
}

export const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
export const daysOpen = (c: Complaint) => Math.max(0, Math.floor(((c.closed_at ? new Date(c.closed_at).getTime() : Date.now()) - new Date(c.created_at).getTime()) / 864e5));

/** WhatsApp texts (sent by a person tapping send). */
export const waNewText = (c: Complaint, flatLabel: string) =>
  `Aakar society complaint ${c.complaint_no} from Flat ${flatLabel} (${c.area_name || "General"}): ${c.description}\n\nPlease see MY FLAT → COMPLAINTS (or COMMITTEE → COMPLAINTS) in the society app.`;
export const waDoneText = (c: Complaint) =>
  c.status === "closed"
    ? `Aakar society: your complaint ${c.complaint_no} (${c.area_name || "General"}) is CLOSED.\nWhat was done: ${c.close_note || ""}\n\nIf it is not resolved, please raise it again in the app quoting ${c.complaint_no}.`
    : `Aakar society: your complaint ${c.complaint_no} (${c.area_name || "General"}) is IN PROGRESS.${c.progress_note ? `\n${c.progress_note}` : ""}`;

export { isHandler } from "./areaRules";
