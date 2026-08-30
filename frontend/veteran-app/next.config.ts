import type { NextConfig } from "next";

const apiOrigin = process.env.VACARE_API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // One-container deploys copy `.next/standalone` into the runtime image.
  output: "standalone",
  async rewrites() {
    // Browser calls same-origin `/api/...`; this process forwards to Python.
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
