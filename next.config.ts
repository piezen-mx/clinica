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
      // El logo del comprobante lo aloja Facturapi (spec 31), en un bucket de Google
      // Cloud Storage — confirmado con un `logo_url` real:
      // https://storage.googleapis.com/cdn.facturapi.io/organization/<uid>/logo.<ext>.
      // El host real es `storage.googleapis.com`; se restringe además el `pathname`
      // al bucket de Facturapi, en vez de abrir todo Google Cloud Storage.
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/cdn.facturapi.io/**",
      },
    ],
  },
};

export default nextConfig;
