import type { MetadataRoute } from "next";

// Installierbar auf dem Handy-Startbildschirm („Zum Home-Bildschirm“): öffnet ohne Browserleiste wie eine App.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "forumWHU Logistik",
    short_name: "Logistik",
    description: "Bestand, Lagerorte, Bewegungen und Leergut",
    start_url: "/",
    display: "standalone",
    background_color: "#061638",
    theme_color: "#061638",
    lang: "de",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
