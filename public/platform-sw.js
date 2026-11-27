// GrihSahara Platform service worker (scope /platform only; the society app's own /sw.js is not touched).
// Privacy first, same rule as the society app: nothing from the server is cached on the phone.
// The offline page is written into this file, so it needs no cache that another service worker could clear.
const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline • GrihSahara Platform</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fdfcf5;color:#1a1a18;font-family:Inter,Arial,sans-serif;text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 8px;color:#0f1d3d}p{font-size:14px;opacity:.75;margin:0 0 16px}button{min-height:44px;padding:0 20px;background:#0f1d3d;color:#fff;border:0;font-weight:700}</style></head>
<body><div><h1>You are offline</h1><p>GrihSahara Platform needs an internet connection. Check your Wi-Fi or mobile data and try again.</p><button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("install", (event) => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;   // data, API calls and files go straight to the network
  event.respondWith(fetch(req).catch(() => new Response(OFFLINE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
