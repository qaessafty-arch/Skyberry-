import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/pwa";

export const metadata: Metadata = {
  title: { default: "Skyberry", template: "%s · Skyberry" },
  description: "Skyberry is a private, expressive social world: chats, rooms, Moments, pets and games.",
  appleWebApp: { capable: true, title: "Skyberry", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#f3f9fd", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<RegisterServiceWorker /></body>
    </html>
  );
}
