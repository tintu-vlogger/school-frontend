import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Smaller production image, no source maps shipped.
  output: "standalone",
  // Keep the dev-only badge away from the bottom of the navigation rail.
  devIndicators: { position: "bottom-right" },
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      { source: "/:path*\\.(png|jpg|jpeg|svg|ico|webp|woff2)", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  turbopack: {
    resolveAlias: {
      fs: { browser: "./src/lib/empty.ts" },
      path: { browser: "./src/lib/empty.ts" },
    },
  },
  webpack: (config) => {
    config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false, path: false };
    return config;
  },
};

export default nextConfig;
