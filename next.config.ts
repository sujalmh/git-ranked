import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "github.com",
        pathname: "/**",
      },
    ],
  },
  // pg-boss and pg manage their own timers/connection pooling and must not be
  // bundled into serverless route handlers (only pg is in Next's default list).
  serverExternalPackages: ["pg-boss", "pg"],
};

export default nextConfig;
