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
  description: "A private, flexible workspace for notes, ideas, and everything worth remembering.",
  applicationName: "ChatSaver",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/cs-transparent.png", sizes: "1254x1254", type: "image/png" }],
    shortcut: "/cs-transparent.png",
    apple: [{ url: "/cs-transparent.png", sizes: "1254x1254", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
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
          {children}
          <DesktopContextMenu />
          <ServiceWorkerRegistration />
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </body>
    </html>
  );
}
