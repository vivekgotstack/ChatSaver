"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { hasPrivateVault, PRIVATE_VAULT_DISMISSED_KEY } from "@/lib/private-vault";

export function PrivateVaultShortcut() {
  const [spotlight, setSpotlight] = useState(false);

  useEffect(() => {
    let active = true;
    void hasPrivateVault().then((configured) => {
      let dismissed = false;
      try { dismissed = localStorage.getItem(PRIVATE_VAULT_DISMISSED_KEY) === "1"; } catch { /* ignored */ }
      if (active) setSpotlight(!configured && !dismissed);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  return (
    <Link
      href="/private-vault"
      aria-label={spotlight ? "Discover Private Vault" : "Open Private Vault"}
      className={`relative inline-flex size-9 items-center justify-center rounded-lg border transition-colors ${spotlight ? "border-primary/35 bg-primary/12 text-primary shadow-[0_0_24px_rgba(219,0,44,.22)] ring-2 ring-primary/10 motion-safe:animate-pulse" : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"}`}
    >
      <LockKeyhole className="size-4" />
      {spotlight ? <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary shadow-[0_0_10px_currentColor]" /> : null}
    </Link>
  );
}
