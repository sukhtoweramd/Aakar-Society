# Aakar Society - Real Next.js + Supabase + R2

Real folders .tsx .ts, no index.html, no memory blob.

1. npm install
2. Create .env.local from .env.example (7 ENV)
3. Supabase: Create table flats (id text primary key, owner_name text, tower text) and flat_docs if needed
4. R2: Create bucket aakar-vault, enable public dev URL, set CORS: AllowedOrigins https://aakarsociety.vercel.app
5. npm run dev -> localhost:3000
6. Push to GitHub sukhtoweramd/Aakar-Society, Vercel auto deploy reads ENV (2 PLAIN NEXT_PUBLIC_ + 5 R2, 2 secret)
