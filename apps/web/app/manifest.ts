import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sui Sports — Athletes & Fans",
    short_name: "Sui Sports",
    description:
      "Connect with verified athletes: live sessions, tiers, and paywalled content.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0e1a",
    theme_color: "#0a0e1a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/sui-sport.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/sui-sport.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
  };
}
