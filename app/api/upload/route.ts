export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/r2Client";
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File;
    const flat_no = form.get("flat_no") as string;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const key = `members/${flat_no}/${Date.now()}-${file.name}`;
    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: buf,
      ContentType: file.type,
    }));
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    return NextResponse.json({ url: publicUrl });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
