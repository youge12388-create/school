import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      allowedOrigins: ["check.medicalchinaway.com"],
    },
  },
};

export default nextConfig;
