import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChatSaver",
    short_name: "ChatSaver",
    description: "Save ChatGPT conversations as editable offline notes.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b0507",
    theme_color: "#a7192f",
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
