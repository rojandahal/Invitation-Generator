import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  // Keep the Prisma engine out of the bundler so server code loads it natively.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
