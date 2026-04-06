import type { NextConfig } from "next";

const nextConfig: NextConfig  = {
  experimental: {
    serverComponentsExternalPackages: ['jsdom', '@mozilla/readability'],
  },
}
module.exports = nextConfig

export default nextConfig;
