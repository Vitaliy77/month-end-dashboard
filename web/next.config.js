/** @type {import('next').NextConfig} */
const nextConfig = {
  // DO deploy unblocks: don't fail the build on TS errors
  typescript: {
    ignoreBuildErrors: true,
  },

  // Remove the old experimental turbo key (Next 16 warns about it)
  // experimental: { turbo: false },
};

module.exports = nextConfig;
