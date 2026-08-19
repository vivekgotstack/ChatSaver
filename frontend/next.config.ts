import type { NextConfig } from "next";

const isTauriBuild = process.env.TAURI_BUILD === "true";

const nextConfig: NextConfig = {
  ...(isTauriBuild
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        allowedDevOrigins: ["127.0.0.1"],
        async rewrites() {
          const apiOrigin = (process.env.API_ORIGIN ?? "http://localhost:8080").replace(/\/$/, "");
          return [
            {
              source: "/downloads/ChatSaver.exe",
              destination: "/api/downloads/ChatSaver.exe",
            },
            {
              source: "/downloads/ChatSaver.dmg",
              destination: "/api/downloads/ChatSaver.dmg",
            },
            {
              source: "/api/v1/:path*",
              destination: `${apiOrigin}/api/v1/:path*`,
            },
          ];
        },
        async headers() {
          return [
            {
              source: "/sw.js",
              headers: [
                {
                  key: "Cache-Control",
                  value: "no-cache, no-store, must-revalidate",
                },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
