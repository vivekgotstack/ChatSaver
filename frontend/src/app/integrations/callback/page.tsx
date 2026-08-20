import type { Metadata } from "next";
import { Suspense } from "react";
import { IntegrationCallback } from "@/components/integration-callback";

export const metadata: Metadata = {
  title: "Confirm integration | ChatSaver",
  robots: { index: false, follow: false },
};

export default function IntegrationCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#050505]" />}>
      <IntegrationCallback />
    </Suspense>
  );
}
