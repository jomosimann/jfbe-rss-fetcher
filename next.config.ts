import type { NextConfig } from "next";

const nextConfig: NextConfig  = {
  serverExternalPackages: ['jsdom', '@mozilla/readability'],
}
module.exports = nextConfig

export default nextConfig;
