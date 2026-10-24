module.exports = {
  reactStrictMode: true,
  // the HELP assistant reads its guide from this file at run time
  experimental: { outputFileTracingIncludes: { "/api/help": ["./content/help-kb.md"] } },
};
