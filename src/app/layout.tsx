import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Skyberry", template: "%s · Skyberry" },
  description: "Skyberry is a private, expressive social world: chats, rooms, Moments, pets and games.",
};
export const viewport: Viewport = { themeColor: "#f3f9fd", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
