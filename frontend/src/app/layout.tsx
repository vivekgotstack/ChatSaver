import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DesktopContextMenu } from "@/components/desktop-context-menu";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatSaver",
  description: "An offline-first library for turning useful chats into editable notes.",
  applicationName: "ChatSaver",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/cs-transparent.png", sizes: "1254x1254", type: "image/png" }],
    shortcut: "/cs-transparent.png",
    apple: [{ url: "/cs-transparent.png", sizes: "1254x1254", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0507",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} dark`}
      suppressHydrationWarning
    >
      <body>
        <TooltipProvider>
          {children}
          <DesktopContextMenu />
          <ServiceWorkerRegistration />
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </body>
    </html>
  );
}
