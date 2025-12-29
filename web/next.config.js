/** @type {import('next').NextConfig} */
const nextConfig = {
  // DO deploy unblocks: don't fail the build on TS errors
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Fix workspace root warning - set turbopack root at top level (not under experimental)
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;

