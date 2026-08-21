import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChatSaver",
    short_name: "ChatSaver",
    description: "A private, flexible workspace for notes, ideas, and everything worth remembering.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#050505",
    theme_color: "#050505",
    categories: ["productivity", "utilities"],
    shortcuts: [
      {
        name: "Private Vault",
        short_name: "Private Vault",
        description: "Open PIN-protected encrypted quick saves",
        url: "/private-vault",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
