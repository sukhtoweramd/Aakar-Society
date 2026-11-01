// Security headers (audit PR-2, Nov 2026). Sent on every page and API route.
// Deliberately NOT set: Cross-Origin-Opener-Policy (the print windows use window.opener) and an enforced
// Content-Security-Policy (print windows and Next.js use inline scripts). The CSP below is Report-Only: it only
// logs problems in the browser console and blocks nothing.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.r2.cloudflarestorage.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

module.exports = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  // the HELP assistant reads its guide from this file at run time
  experimental: { outputFileTracingIncludes: { "/api/help": ["./content/help-kb.md"] } },
  // pdfjs-dist (PDF compression in the browser) mentions the Node "canvas" package, which is never used in the browser
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false };
    return config;
  },
};
