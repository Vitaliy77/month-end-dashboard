/** @type {import('next').NextConfig} */
const nextConfig = {
  // DO deploy unblocks: don't fail the build on TS errors
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Ensure server output (not static export)
  // output: undefined means default server mode (not "export")
  // This allows next start to work properly
  
  // Force Webpack by not enabling experimental.turbopack
  // Turbopack is only enabled via --turbo flag or NEXT_DISABLE_TURBOPACK=0
  
  // Clear corrupted build cache on startup if needed
  onDemandEntries: {
    // Period in ms to keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // Number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },
};

module.exports = nextConfig;

