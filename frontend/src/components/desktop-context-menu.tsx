"use client";

import { useEffect, useRef, useState } from "react";
import { Cloud, Database, FileDown, MonitorSmartphone, RefreshCw } from "lucide-react";
import { isTauriRuntime } from "@/lib/platform-fetch";

export type DesktopAction = "devices" | "sync" | "vault" | "pdf";
export const DESKTOP_ACTION_EVENT = "chatsaver:desktop-action";

const ACTIONS: Array<{
  action?: DesktopAction;
  label: string;
  description: string;
  icon: typeof Cloud;
}> = [
  {
    action: "devices",
    label: "All devices",
    description: "Review and remove synced sessions",
    icon: MonitorSmartphone,
  },
  {
    action: "sync",
    label: "Sync now",
    description: "Back up pending local changes",
    icon: Cloud,
  },
  {
    action: "vault",
    label: "Vault controls",
    description: "Backup, restore, and storage",
    icon: Database,
  },
  {
    action: "pdf",
    label: "Convert to PDF",
    description: "Turn a TXT or Markdown file into PDF",
    icon: FileDown,
  },
  {
    label: "Refresh",
    description: "Reload the desktop workspace",
    icon: RefreshCw,
  },
];

export function DesktopContextMenu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>();

  useEffect(() => {
    if (!isTauriRuntime()) return;
    document.documentElement.classList.add("tauri-runtime");

    function openMenu(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      setPosition({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 268)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 306)),
      });
    }

    function closeMenu(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setPosition(undefined);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPosition(undefined);
    }

    function closeOnBlur() {
      setPosition(undefined);
    }

    window.addEventListener("contextmenu", openMenu);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      document.documentElement.classList.remove("tauri-runtime");
      window.removeEventListener("contextmenu", openMenu);
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, []);

  if (!position) return null;

  function run(action?: DesktopAction) {
    setPosition(undefined);
    if (!action) {
      window.location.reload();
      return;
    }
    window.dispatchEvent(new CustomEvent<DesktopAction>(DESKTOP_ACTION_EVENT, { detail: action }));
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="ChatSaver desktop actions"
      className="fixed z-[100] w-[260px] rounded-xl border border-white/10 bg-[#120b0d]/98 p-1.5 text-white shadow-[0_22px_70px_rgba(0,0,0,.62)] backdrop-blur-2xl"
      style={{ left: position.x, top: position.y }}
    >
      <div className="px-2.5 pb-1.5 pt-1 font-mono text-[8px] uppercase tracking-[0.2em] text-white/38">
        ChatSaver desktop
      </div>
      {ACTIONS.map(({ action, label, description, icon: Icon }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-white/7 focus-visible:bg-white/7"
          onClick={() => run(action)}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/[0.035] text-primary group-hover:border-primary/25 group-hover:bg-primary/10">
            <Icon className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-medium">{label}</span>
            <span className="mt-0.5 block truncate text-[9px] text-white/42">{description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
