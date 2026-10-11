import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
export async function GET() {
  const { data } = await supabase.from("flats").select("*").order("flat_no");
  return NextResponse.json(data);
}
