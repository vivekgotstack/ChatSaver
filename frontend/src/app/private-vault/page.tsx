import type { Metadata } from "next";
import { PrivateVaultApp } from "@/components/private-vault-app";

export const metadata: Metadata = {
  title: "Private Vault | ChatSaver",
  description: "Locally encrypted quick saves protected by your six-digit PIN.",
};

export default function PrivateVaultPage() {
  return <PrivateVaultApp />;
}
