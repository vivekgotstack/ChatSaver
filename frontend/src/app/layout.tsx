import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DesktopContextMenu } from "@/components/desktop-context-menu";
import { NavigationTransition } from "@/components/navigation-transition";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://chatsaver.viveknigam.co.in"),
  title: {
    default: "ChatSaver — Your Private, Connected Knowledge Workspace",
    template: "%s · ChatSaver",
  },
  description: "Capture notes and AI chats, organize synced collections, protect links in an encrypted Private Vault, and publish backups through connected tools.",
  applicationName: "ChatSaver",
  keywords: [
    "private notes app",
    "cross-device notes",
    "offline notes",
    "ChatGPT conversation importer",
    "encrypted private vault",
    "knowledge workspace",
    "Markdown backup",
    "GitHub notes backup",
  ],
  authors: [{ name: "Vivek Nigam" }],
  creator: "Vivek Nigam",
  category: "productivity",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ChatSaver",
    title: "ChatSaver — Your Private, Connected Knowledge Workspace",
    description: "Save notes and conversations, sync custom collections, protect important links, and connect the tools where your knowledge already lives.",
    images: [{ url: "/ChatSaver.png", width: 1254, height: 1254, alt: "ChatSaver" }],
  },
  twitter: {
    card: "summary",
    title: "ChatSaver — Your Private, Connected Knowledge Workspace",
    description: "Private notes, synced collections, an encrypted vault, useful integrations, and portable backups—across web, PWA, and desktop.",
    images: ["/ChatSaver.png"],
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ChatSaver",
  },
  icons: {
    icon: [{ url: "/cs-transparent.png", sizes: "1254x1254", type: "image/png" }],
    shortcut: "/cs-transparent.png",
    apple: [{ url: "/cs-transparent.png", sizes: "1254x1254", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} dark`}
      style={{ backgroundColor: "#050505", colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <body style={{ backgroundColor: "#050505" }}>
        <TooltipProvider>
          <div id="route-frame">{children}</div>
          <Suspense fallback={null}><NavigationTransition /></Suspense>
          <DesktopContextMenu />
          <ServiceWorkerRegistration />
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </body>
    </html>
  );
}
