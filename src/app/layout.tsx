import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Project Command Center", template: "%s · Project Command Center" },
  description: "Operating system for software project delivery.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f7f9" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
