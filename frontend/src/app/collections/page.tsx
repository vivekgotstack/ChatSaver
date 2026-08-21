import type { Metadata } from "next";
import { Suspense } from "react";
import { CollectionRoute } from "@/components/collection-route";

export const metadata: Metadata = {
  title: "Collection | ChatSaver",
  description: "Browse every note and resource saved in a custom ChatSaver collection.",
};

export default function CollectionsPage() {
  return (
    <Suspense fallback={null}>
      <CollectionRoute />
    </Suspense>
  );
}
