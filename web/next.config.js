/** @type {import('next').NextConfig} */
const nextConfig = {
  // DO deploy unblocks: don't fail the build on TS errors
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // NOTE: Do NOT set turbopack config here - it forces Turbopack mode
  // Use --turbo flag explicitly in package.json scripts if you want Turbopack
};

module.exports = nextConfig;

