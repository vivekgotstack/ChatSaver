import type { Metadata } from "next";
import { LibraryApp } from "@/components/library-app";

export const metadata: Metadata = {
  title: "History | ChatSaver",
  description: "Browse, search, and continue your private knowledge library across devices.",
};

export default function HistoryPage() {
  return <LibraryApp historyView />;
}
