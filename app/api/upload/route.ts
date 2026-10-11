import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from '@/lib/r2Client'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File
    const flatId = form.get('flatId') as string
    if (!file || !flatId) return NextResponse.json({ error: 'Missing file or flatId' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `members/${flatId}/${timestamp}_${safeName}`

    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type || 'application/pdf',
    }))

    const publicUrl = `${R2_PUBLIC_URL}/${key}`
    return NextResponse.json({ success: true, key, url: publicUrl })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
