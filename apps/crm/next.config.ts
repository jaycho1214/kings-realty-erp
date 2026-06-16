import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kingsrealty/db"],
  // Dev-only: allow loading the dev server from a LAN IP (phone/tablet field
  // testing). No effect on production builds.
  allowedDevOrigins: ["192.168.0.151"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },
};

export default nextConfig;
