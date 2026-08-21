"use client";

import Link from "next/link";
import { Plug } from "lucide-react";
import { useEffect, useState } from "react";
import {
  INTEGRATION_CONNECTED_EVENT,
  listIntegrationConnections,
  type IntegrationConnection,
} from "@/lib/integrations";

const SERVICE_MARKS: Record<string, { label: string; className: string }> = {
  linkedin: { label: "in", className: "bg-[#0a66c2] text-white" },
  gmail: { label: "M", className: "bg-white text-[#d93025]" },
  googledrive: { label: "▲", className: "bg-white text-[#188038]" },
  github: { label: "GH", className: "bg-[#24292f] text-white" },
  notion: { label: "N", className: "bg-white text-black" },
  slack: { label: "#", className: "bg-[#4a154b] text-white" },
};

export function ConnectedIntegrationsShortcut({ accessToken }: { accessToken?: string }) {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);

  useEffect(() => {
    if (!accessToken) {
      setConnections([]);
      return;
    }

    let active = true;
    const load = () => {
      void listIntegrationConnections(accessToken)
        .then((items) => {
          if (active) setConnections(items.filter((item) => item.status === "ACTIVE"));
        })
        .catch(() => {
          if (active) setConnections([]);
        });
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === INTEGRATION_CONNECTED_EVENT) load();
    };

    load();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(INTEGRATION_CONNECTED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(INTEGRATION_CONNECTED_EVENT, load);
    };
  }, [accessToken]);

  const toolkits = [...new Set(connections.map((connection) => connection.toolkit))];
  if (toolkits.length === 0) {
    return (
      <Link
        href="/integrations"
        aria-label="Open integrations"
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plug className="size-4" />
      </Link>
    );
  }

  return (
    <Link
      href="/integrations"
      aria-label={`Open ${toolkits.length} connected ${toolkits.length === 1 ? "integration" : "integrations"}`}
      className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.045] px-1.5 transition-colors hover:border-emerald-300/30 hover:bg-emerald-300/[0.08]"
    >
      {toolkits.slice(0, 4).map((toolkit, index) => {
        const mark = SERVICE_MARKS[toolkit] ?? { label: toolkit.slice(0, 2).toUpperCase(), className: "bg-white/10 text-white" };
        return (
          <span
            key={toolkit}
            title={toolkit}
            className={`${index ? "hidden sm:inline-flex" : "inline-flex"} size-6 items-center justify-center rounded-md text-[9px] font-bold shadow-sm ${mark.className}`}
          >
            {mark.label}
          </span>
        );
      })}
      {toolkits.length > 4 ? (
        <span className="hidden px-0.5 font-mono text-[8px] text-emerald-100/70 sm:inline">+{toolkits.length - 4}</span>
      ) : null}
    </Link>
  );
}
