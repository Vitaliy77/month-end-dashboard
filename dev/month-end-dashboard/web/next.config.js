const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },

  turbopack: {
    root: path.join(__dirname, '..'),  // Points to the parent directory
  },
};

module.exports = nextConfig;

