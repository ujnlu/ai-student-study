import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/grassland-trip", destination: "/grassland-trip.html" }];
  },
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "@prisma/client", "sharp", "pg", "pdfjs-dist"],
  experimental: {
    serverActions: { bodySizeLimit: "30mb" },
  },
};

export default nextConfig;
