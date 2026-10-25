module.exports = {
  reactStrictMode: true,
  // the HELP assistant reads its guide from this file at run time
  experimental: { outputFileTracingIncludes: { "/api/help": ["./content/help-kb.md"] } },
  // pdfjs-dist (PDF compression in the browser) mentions the Node "canvas" package, which is never used in the browser
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false };
    return config;
  },
};
