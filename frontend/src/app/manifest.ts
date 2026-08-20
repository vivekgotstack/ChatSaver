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
    orientation: "any",
    background_color: "#050505",
    theme_color: "#050505",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/cs-transparent.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
