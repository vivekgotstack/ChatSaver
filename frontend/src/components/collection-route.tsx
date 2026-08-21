"use client";

import { useSearchParams } from "next/navigation";
import { LibraryApp } from "@/components/library-app";

export function CollectionRoute() {
  const collectionId = useSearchParams().get("collection")?.trim();
  return <LibraryApp historyView collectionRouteId={collectionId || undefined} />;
}
