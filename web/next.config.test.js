/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Explicitly set output to undefined (default server mode)
  output: undefined,
};
module.exports = nextConfig;
