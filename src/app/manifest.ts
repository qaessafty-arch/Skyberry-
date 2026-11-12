import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Skyberry",
    short_name: "Skyberry",
    description: "A small, private social world: chats, rooms, Moments, games and Pip.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f9fd",
    theme_color: "#f3f9fd",
    categories: ["social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Chats", url: "/chats" },
      { name: "Camera", url: "/camera" },
      { name: "Universe", url: "/universe" },
    ],
  };
}
