import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["cloudinary"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    remotePatterns: [
      // El logo del comprobante lo aloja Facturapi (spec 31); la vista previa de
      // `next/image` necesita este host permitido explícitamente, no un comodín.
      {
        protocol: "https",
        hostname: "cdn.facturapi.io",
      },
    ],
  },
};

export default nextConfig;
