import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DeepTutor",
    short_name: "Tutor",
    description: "AI-powered tutoring platform",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#b0501e",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
