import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET() {
  const { data, error } = await supabase.from('flats').select('*').limit(90)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
export async function POST(req: Request) {
  const body = await req.json()
  const { data, error } = await supabase.from('flats').upsert({ id: body.id, owner_name: body.owner_name, tower: body.tower }).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
