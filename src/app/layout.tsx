import type { Metadata, Viewport } from "next";
import { PageAnimations } from "@/components/page-animations";
import "lenis/dist/lenis.css";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Football Viral",
  title: "Football Viral Analyzer",
  description: "Analysez les mécaniques des vidéos football et créez votre prochain format viral.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Football Viral",
  },
  icons: {
    icon: [
      { url: "/icons/app-icon.svg", type: "image/svg+xml" },
      { url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#07111f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><PageAnimations>{children}</PageAnimations></body></html>;
}
