import type { Metadata } from "next";
import { IntegrationsMarketplace } from "@/components/integrations-marketplace";

export const metadata: Metadata = {
  title: "Integrations | ChatSaver",
  description: "Connect trusted tools to ChatSaver through a secure, account-scoped integration layer.",
};

export default function IntegrationsPage() {
  return <IntegrationsMarketplace />;
}
