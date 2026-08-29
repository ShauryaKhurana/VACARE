import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VA CARE",
    short_name: "VA CARE",
    description:
      "A free guide to help you file your VA claim, working with a real accredited Veteran Service Officer.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF8F5",
    theme_color: "#2B6E63",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
