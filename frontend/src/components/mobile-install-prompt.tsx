"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isTauriRuntime } from "@/lib/platform-fetch";

interface InstallEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

const SEEN_KEY = "chatsaver:mobile-install-seen";
let seenThisSession = false;

function hasSeenPrompt() {
  if (seenThisSession) return true;
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}

function rememberPrompt() {
  seenThisSession = true;
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* Remember for this session. */ }
}

export function MobileInstallPrompt() {
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installing, setInstalling] = useState(false);
  const installEvent = useRef<InstallEvent | null>(null);

  useEffect(() => {
    const appleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isTauriRuntime() || (!appleMobile && !/Android/i.test(navigator.userAgent))) return;
    const standalone = window.matchMedia("(display-mode: standalone)");
    const isInstalled = () => standalone.matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
      || document.referrer.startsWith("android-app://");
    if (isInstalled() || hasSeenPrompt()) return;
    setIos(appleMobile);

    let timer: ReturnType<typeof setTimeout>;
    let dismissed = false;
    function onInstallAvailable(event: Event) {
      if (dismissed || isInstalled()) return;
      event.preventDefault();
      installEvent.current = event as InstallEvent;
      setCanInstall(true);
    }
    function onInstalled() {
      dismissed = true;
      rememberPrompt();
      clearTimeout(timer);
      installEvent.current = null;
      setCanInstall(false);
      setOpen(false);
    }
    function onDisplayChange() { if (isInstalled()) onInstalled(); }
    function showWhenIdle() {
      if (dismissed || isInstalled() || hasSeenPrompt()) return;
      // Never interrupt an editor, another dialog, or a background tab.
      if (document.visibilityState !== "visible"
        || document.querySelector('[role="dialog"], [role="alertdialog"]')
        || document.activeElement?.matches('input, textarea, [contenteditable="true"]')) {
        timer = setTimeout(showWhenIdle, 3_000);
        return;
      }
      rememberPrompt();
      setOpen(true);
    }
    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled);
    standalone.addEventListener("change", onDisplayChange);
    timer = setTimeout(showWhenIdle, 3_000);
    return () => {
      dismissed = true;
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
      standalone.removeEventListener("change", onDisplayChange);
    };
  }, []);

  async function install() {
    const event = installEvent.current;
    if (!event) return;
    installEvent.current = null;
    setInstalling(true);
    try {
      await event.prompt();
      setOpen(false);
    } catch {
      // Fall back to browser-menu instructions if the native prompt expired.
      setCanInstall(false);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-auto bottom-[max(1rem,env(safe-area-inset-bottom))] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm translate-y-0 overflow-y-auto rounded-2xl border border-white/10 bg-[#100c0e] p-5 shadow-2xl">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary" aria-hidden="true"><Smartphone className="size-6" /></div>
        <DialogHeader>
          <DialogTitle className="pr-5 text-xl leading-tight">Your private workspace, one tap away.</DialogTitle>
          <DialogDescription className="leading-6">Add ChatSaver to your home screen for a focused app experience and easy access to your offline notes.</DialogDescription>
        </DialogHeader>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" />Private, local-first notes. Your sync settings stay the same.</p>
        {!canInstall && (
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm leading-6">
            {ios ? (
              <p>Open your browser’s <Share className="inline size-4 align-text-bottom" aria-hidden="true" /> <strong>Share</strong> menu, choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>. If that option is missing, open this page in Safari.</p>
            ) : (
              <p>Open your browser’s menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. If neither appears, open this page in Chrome.</p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {canInstall && <Button className="min-h-11 w-full" disabled={installing} onClick={() => void install()}><Download />{installing ? "Opening installer…" : "Install ChatSaver"}</Button>}
          <Button variant={canInstall ? "ghost" : "outline"} className="min-h-11 w-full" onClick={() => setOpen(false)}>{canInstall ? "Not now" : "Got it"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
