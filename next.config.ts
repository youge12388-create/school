import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    // Releases may live below an older application directory on the server.
    // Keep build tracing and standalone assets rooted at this release.
    root: process.cwd(),
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["check.medicalchinaway.com"],
    },
  },
};

export default nextConfig;
