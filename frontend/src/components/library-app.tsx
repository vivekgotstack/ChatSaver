"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Database,
  Download,
  FileDown,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  FolderHeart,
  Import,
  LoaderCircle,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import type {
  LibraryFilter,
  ManualNoteFormat,
  Note,
  NoteCollection,
  NotesPage,
  NoteSort,
} from "@/domain/models";
import { NoteEditor } from "@/components/note-editor";
import { AccountDialog } from "@/components/account-dialog";
import { ConnectedIntegrationsShortcut } from "@/components/connected-integrations-shortcut";
import {
  activateAccountVault,
  confirmGuestMigration,
  createCollection,
  createBlankNote,
  db,
  deleteCollection,
  endAccountVault,
  getLibraryCounts,
  queryNotesPage,
  renameCollection,
} from "@/lib/db/database";
import { useLiveQuery } from "@/hooks/use-live-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SiteFooter } from "@/components/site-footer";
import { MessageVaultVisual } from "@/components/message-vault-visual";
import {
  DESKTOP_ACTION_EVENT,
  type DesktopAction,
} from "@/components/desktop-context-menu";
import {
  isVaultRealtimeConfigured,
  openVaultSocket,
  parseVaultSocketMessage,
  refreshAccount,
  synchronizeVault,
  type AuthSession,
} from "@/lib/sync";
import { isTauriRuntime } from "@/lib/platform-fetch";

const ImportDialog = dynamic(
  () => import("@/components/import-dialog").then((module) => module.ImportDialog),
  { ssr: false },
);
const VaultDialog = dynamic(
  () => import("@/components/vault-dialog").then((module) => module.VaultDialog),
  { ssr: false },
);
const DocumentToPdfDialog = dynamic(
  () => import("@/components/document-to-pdf-dialog").then((module) => module.DocumentToPdfDialog),
  { ssr: false },
);

const PAGE_SIZE = 12;
const FALLBACK_SYNC_INTERVAL_MS = 2 * 60 * 1_000;
const ACCOUNT_SESSION_MARKER = "chatsaver:account-session";
const ROUTE_NOTE_HANDOFF_KEY = "chatsaver:route-note-handoff";
const EMPTY_PAGE: NotesPage = {
  items: [],
  page: 1,
  pageSize: PAGE_SIZE,
  totalItems: 0,
  totalPages: 1,
};

type DesktopPlatform = "windows" | "macos";

const DESKTOP_DOWNLOADS: Record<DesktopPlatform, string> = {
  windows:
    process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL
    ?? "/downloads/ChatSaver.exe",
  macos:
    process.env.NEXT_PUBLIC_MACOS_DOWNLOAD_URL
    ?? "/downloads/ChatSaver.dmg",
};

function DesktopInstallButton({ compact = false }: { compact?: boolean }) {
  const [platform, setPlatform] = useState<DesktopPlatform>();

  useEffect(() => {
    if (isTauriRuntime()) return;

    const desktopMedia = window.matchMedia(
      "(min-width: 900px) and (hover: hover) and (pointer: fine)",
    );
    const detectPlatform = () => {
      if (!desktopMedia.matches) {
        setPlatform(undefined);
        return;
      }

      const userAgent = navigator.userAgent;
      const isIPad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
      if (/Windows NT/i.test(userAgent)) setPlatform("windows");
      else if (!isIPad && /Macintosh|Mac OS X/i.test(userAgent)) setPlatform("macos");
      else setPlatform(undefined);
    };

    detectPlatform();
    desktopMedia.addEventListener("change", detectPlatform);
    return () => desktopMedia.removeEventListener("change", detectPlatform);
  }, []);

  if (!platform) return null;

  const platformLabel = platform === "windows" ? "Windows" : "macOS";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="outline"
          className={`group/install border-primary/30 bg-primary/8 text-white shadow-[0_0_24px_rgba(167,25,47,.08)] backdrop-blur-md hover:border-primary/55 hover:bg-primary/14 ${
            compact ? "h-8 px-2.5 text-[11px]" : "h-9 px-3 text-xs"
          }`}
        >
          <a href={DESKTOP_DOWNLOADS[platform]} download>
            <Download className="text-primary transition-transform duration-200 group-hover/install:translate-y-0.5" />
            Install on {platformLabel}
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        sideOffset={10}
        className="block w-72 rounded-xl border border-white/10 bg-[#130b0d]/96 px-4 py-3 text-white shadow-2xl backdrop-blur-xl"
      >
        <span className="block text-[12px] font-semibold tracking-[-0.01em]">
          Your library, in its own workspace.
        </span>
        <span className="mt-1 block text-[11px] leading-5 text-white/58">
          Launch ChatSaver directly from your desktop and keep the same private, local-first vault.
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function NewNoteDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (format: ManualNoteFormat) => Promise<void>;
}) {
  const [creating, setCreating] = useState<ManualNoteFormat>();

  async function choose(format: ManualNoteFormat) {
    setCreating(format);
    try {
      await onCreate(format);
    } catch (error) {
      toast.error("Could not create the note", {
        description: error instanceof Error ? error.message : "Your vault was not changed.",
      });
    } finally {
      setCreating(undefined);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0b090a]/98 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose your note format</DialogTitle>
          <DialogDescription>
            Start with a free-form Markdown page or a structured question-and-answer note.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="group rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 text-left transition-colors hover:border-primary/55 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            disabled={Boolean(creating)}
            onClick={() => void choose("markdown")}
          >
            <span className="mb-4 grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
              {creating === "markdown" ? <LoaderCircle className="animate-spin" /> : <FileText />}
            </span>
            <span className="block text-sm font-semibold">Plain Markdown note</span>
            <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
              A heading and free-form page with lists, emphasis, links, quotes, tables, and code.
            </span>
          </button>
          <button
            type="button"
            className="group rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            disabled={Boolean(creating)}
            onClick={() => void choose("qa")}
          >
            <span className="mb-4 grid size-10 place-items-center rounded-xl bg-white/[0.05] text-ivory/75">
              {creating === "qa" ? <LoaderCircle className="animate-spin" /> : <MessageSquareText />}
            </span>
            <span className="block text-sm font-semibold">Q&amp;A note</span>
            <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
              Structured question-and-answer blocks, matching imported ChatGPT conversations.
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const FILTERS: Array<{
  id: LibraryFilter;
  label: string;
  icon: typeof BookOpenText;
}> = [
  { id: "all", label: "All notes", icon: BookOpenText },
  { id: "favorites", label: "Favorites", icon: FolderHeart },
  { id: "imported", label: "Imported chats", icon: Import },
  { id: "archived", label: "Archive", icon: Archive },
];

interface CollectionSummary extends NoteCollection {
  noteCount: number;
}

function CollectionNameDialog({
  collection,
  open,
  onOpenChange,
  onSaved,
}: {
  collection?: NoteCollection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(collection?.name ?? "");

  useEffect(() => {
    if (open) setName(collection?.name ?? "");
  }, [collection?.id, collection?.name, open]);

  async function save() {
    try {
      if (collection) {
        await renameCollection(collection.id, name);
        onSaved(collection.id);
        toast.success("Collection renamed");
      } else {
        const id = await createCollection(name);
        onSaved(id);
        toast.success("Collection created");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The collection could not be saved.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{collection ? "Rename collection" : "New collection"}</DialogTitle>
          <DialogDescription>
            Collections sync with your account while Favorites continues working independently.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            autoFocus
            aria-label="Collection name"
            maxLength={80}
            placeholder="Work, Research, Ideas…"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button className="w-full" type="submit" disabled={!name.trim()}>
            {collection ? "Save name" : "Create collection"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface LibrarySidebarProps {
  page: NotesPage;
  selectedNoteId?: string;
  query: string;
  filter: LibraryFilter;
  sort: NoteSort;
  counts: Record<LibraryFilter, number>;
  collections: CollectionSummary[];
  collectionId?: string;
  stats: {
    conversations: number;
    imports: number;
    pending: number;
  };
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: LibraryFilter) => void;
  onCollectionChange: (collectionId: string) => void;
  onEditCollection: (collection?: NoteCollection) => void;
  onDeleteCollection: (collection: NoteCollection) => void;
  onSortChange: (sort: NoteSort) => void;
  onPageChange: (page: number) => void;
  onSelect: (noteId: string) => void;
  onCreate: () => void;
}

function LibraryLoading() {
  return (
    <div className="relative min-h-dvh overflow-hidden p-0 lg:p-3">
      <div className="paint-backdrop" aria-hidden="true" />
      <div className="oil-grain" aria-hidden="true" />
      <div className="app-surface relative z-10 flex h-dvh overflow-hidden border-white/8 lg:h-[calc(100dvh-1.5rem)] lg:rounded-[1.75rem] lg:border">
        <aside className="hidden w-[322px] border-e border-white/8 p-4 lg:block">
          <Skeleton className="h-10 w-full bg-white/6" />
          <Skeleton className="mt-4 h-9 w-full bg-white/5" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton className="h-12 w-full bg-white/5" key={index} />
            ))}
          </div>
        </aside>
        <main className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-3xl">
            <Skeleton className="h-5 w-48 bg-primary/18" />
            <Skeleton className="mt-6 h-20 w-full bg-white/6" />
            <Skeleton className="mt-3 h-20 w-4/5 bg-white/5" />
            <Skeleton className="mt-8 h-11 w-64 bg-primary/16" />
          </div>
        </main>
      </div>
    </div>
  );
}

function LibraryUnavailable({ detail }: { detail: string }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden p-6">
      <div className="paint-backdrop" aria-hidden="true" />
      <div className="oil-grain" aria-hidden="true" />
      <section
        className="app-surface relative z-10 w-full max-w-lg rounded-3xl border border-white/10 p-8 text-center"
        role="alert"
      >
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/12 text-destructive">
          <AlertTriangle />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.035em]">
          Your local vault could not open.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {detail} Your data has not been cleared. Close other ChatSaver tabs, allow site storage,
          then try again.
        </p>
        <Button className="royal-glow mt-6" onClick={() => window.location.reload()}>
          <RotateCcw />
          Retry ChatSaver
        </Button>
      </section>
    </main>
  );
}

function LibrarySidebar({
  page,
  selectedNoteId,
  query,
  filter,
  sort,
  counts,
  collections,
  collectionId,
  stats,
  onQueryChange,
  onFilterChange,
  onCollectionChange,
  onEditCollection,
  onDeleteCollection,
  onSortChange,
  onPageChange,
  onSelect,
  onCreate,
}: LibrarySidebarProps) {
  return (
    <div className="sidebar-surface flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-3 pt-4">
        <Button className="royal-glow h-10 w-full justify-start gap-2" onClick={onCreate}>
          <Plus />
          New note
          <span className="ms-auto font-mono text-[9px] uppercase tracking-wide opacity-60">
            Local
          </span>
        </Button>
      </div>

      <div className="shrink-0 px-4 pb-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 border-white/8 bg-black/20 ps-9 pe-12 shadow-inner shadow-black/10"
            type="search"
            placeholder="Search notes and answers"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 rounded-md border border-white/8 bg-black/20 px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground">
            Ctrl K
          </span>
        </label>
      </div>

      <nav className="shrink-0 space-y-1 px-3" aria-label="Library sections">
        {FILTERS.map((item) => {
          const active = !collectionId && filter === item.id;
          return (
            <Button
              key={item.id}
              variant={active ? "secondary" : "ghost"}
              className={`h-9 w-full justify-start ${
                active ? "" : "text-muted-foreground"
              }`}
              onClick={() => onFilterChange(item.id)}
            >
              <item.icon />
              {item.label}
              <span className="ms-auto font-mono text-[10px] text-muted-foreground">
                {counts[item.id]}
              </span>
            </Button>
          );
        })}
      </nav>

      <div className="shrink-0 px-3 pt-5">
        <div className="mb-1 flex items-center justify-between px-2">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
            Collections
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Create collection"
            onClick={() => onEditCollection()}
          >
            <FolderPlus />
          </Button>
        </div>
        <div className="max-h-28 space-y-1 overflow-y-auto pe-1">
          {collections.map((collection) => (
            <div className="group flex items-center" key={collection.id}>
              <Button
                variant={collectionId === collection.id ? "secondary" : "ghost"}
                className={`h-9 min-w-0 flex-1 justify-start ${collectionId === collection.id ? "" : "text-muted-foreground"}`}
                onClick={() => onCollectionChange(collection.id)}
              >
                <Folder />
                <span className="truncate">{collection.name}</span>
                <span className="ms-auto font-mono text-[10px] text-muted-foreground">
                  {collection.noteCount}
                </span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Manage ${collection.name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onSelect={() => onEditCollection(collection)}>
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => onDeleteCollection(collection)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {collections.length === 0 ? (
            <button
              type="button"
              className="w-full rounded-lg border border-dashed border-white/10 px-3 py-2 text-start text-[11px] text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground"
              onClick={() => onEditCollection()}
            >
              + Organize notes into a collection
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-end justify-between gap-2 px-4 pb-2 pt-6">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
            {query
              ? "Search results"
              : collections.find((item) => item.id === collectionId)?.name
                ?? FILTERS.find((item) => item.id === filter)?.label}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {page.totalItems} note{page.totalItems === 1 ? "" : "s"}
          </p>
        </div>
        <Select value={sort} onValueChange={(value) => onSortChange(value as NoteSort)}>
          <SelectTrigger
            size="sm"
            className="h-7 w-[104px] border-white/8 bg-black/15 text-[10px]"
            aria-label="Sort notes"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated-desc">Newest</SelectItem>
            <SelectItem value="updated-asc">Oldest</SelectItem>
            <SelectItem value="title-asc">A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden px-2">
        <div className="space-y-1 px-1 pb-4">
          {page.items.map((note) => (
            <Button
              variant="ghost"
              className={`group h-auto w-full items-start justify-start gap-3 px-3 py-3 text-start ${
                note.id === selectedNoteId
                  ? "bg-primary/12 text-foreground hover:bg-primary/16"
                  : "text-muted-foreground"
              }`}
              type="button"
              key={note.id}
              onClick={() => onSelect(note.id)}
            >
              <span
                className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border ${
                  note.id === selectedNoteId
                    ? "border-primary/25 bg-primary/15 text-primary"
                    : "border-white/8 bg-black/15"
                }`}
              >
                {note.isFavorite ? (
                  <Star className="size-3.5 fill-current" />
                ) : (
                  <BookOpenText className="size-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {note.title}
                </span>
                <span className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wide">
                  {note.blockCount} blocks
                  <span className="size-0.5 rounded-full bg-current opacity-50" />
                  {note.source === "chatgpt" ? "Imported" : note.source === "markdown" ? "Markdown" : "Q&A"}
                </span>
              </span>
              <ChevronRight className="mt-2 size-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
            </Button>
          ))}

          {!page.items.length ? (
            <div className="mx-2 mt-3 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-7 text-center">
              <FilePlus2 className="mx-auto mb-3 size-5 text-primary" />
              <p className="text-xs text-muted-foreground">
                {query ? "Nothing matches that search." : "This view is empty."}
              </p>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      {page.totalPages > 1 ? (
        <div className="flex shrink-0 items-center justify-between border-t border-white/7 px-3 py-2">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={page.page <= 1}
            aria-label="Previous notes page"
            onClick={() => onPageChange(page.page - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            Page {page.page} of {page.totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={page.page >= page.totalPages}
            aria-label="Next notes page"
            onClick={() => onPageChange(page.page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-white/7 p-3">
        <div className="rounded-xl border border-white/7 bg-black/15 p-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/12 text-primary">
              <Database className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">Local vault</p>
              <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                {stats.conversations} chats · {stats.pending} queued
              </p>
            </div>
            <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.65)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LibraryApp({ historyView = false }: { historyView?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [collectionId, setCollectionId] = useState<string>();
  const [sort, setSort] = useState<NoteSort>("updated-desc");
  const [page, setPage] = useState(1);
  const [selectedNoteId, setSelectedNoteId] = useState<string>();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [isPdfConverterOpen, setIsPdfConverterOpen] = useState(false);
  const [isNewNoteOpen, setIsNewNoteOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [collectionEditor, setCollectionEditor] = useState<NoteCollection | null | undefined>();
  const [deletingCollection, setDeletingCollection] = useState<NoteCollection>();
  const [isMobileLibraryOpen, setIsMobileLibraryOpen] = useState(false);
  const [session, setSession] = useState<AuthSession>();
  const [vaultKey, setVaultKey] = useState(() => db.name);
  const [databaseState, setDatabaseState] = useState<
    { status: "loading" | "ready" } | { status: "error"; detail: string }
  >({ status: "loading" });
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [realtimeState, setRealtimeState] = useState<"offline" | "connecting" | "connected">("offline");
  const syncInFlight = useRef(false);
  const syncQueued = useRef(false);
  const deferredQuery = useDeferredValue(query);
  const notesPage = useLiveQuery(
    () =>
      queryNotesPage({
        page,
        pageSize: PAGE_SIZE,
        filter,
        query: deferredQuery,
        sort,
        collectionId,
      }),
    [vaultKey, page, filter, deferredQuery, sort, collectionId],
    EMPTY_PAGE,
  );
  const counts = useLiveQuery(
    getLibraryCounts,
    [vaultKey],
    { all: 0, favorites: 0, imported: 0, archived: 0 },
  );
  const totalNotes = useLiveQuery(() => db.notes.count(), [vaultKey], 0);
  const collections = useLiveQuery(
    async () => {
      const [items, notes] = await Promise.all([
        db.collections.orderBy("name").toArray(),
        db.notes.toArray(),
      ]);
      const countsById = new Map<string, number>();
      for (const note of notes) {
        for (const id of note.collectionIds ?? []) {
          countsById.set(id, (countsById.get(id) ?? 0) + 1);
        }
      }
      return items.map((item) => ({ ...item, noteCount: countsById.get(item.id) ?? 0 }));
    },
    [vaultKey],
    [] as CollectionSummary[],
  );
  const commandNotes = useLiveQuery(
    () => db.notes.orderBy("updatedAt").reverse().filter((note) => !note.isArchived).limit(50).toArray(),
    [vaultKey],
    [] as Note[],
  );
  const stats = useLiveQuery(
    async () => {
      const [conversations, imports, pending, latestPending] = await Promise.all([
        db.conversations.count(),
        db.imports.count(),
        db.outbox.count(),
        db.outbox.orderBy("createdAt").last(),
      ]);
      return { conversations, imports, pending, pendingRevision: latestPending?.createdAt ?? "" };
    },
    [vaultKey],
    { conversations: 0, imports: 0, pending: 0, pendingRevision: "" },
  );

  const activeNoteId = selectedNoteId;
  const selectedNote = useLiveQuery(
    () => (activeNoteId ? db.notes.get(activeNoteId) : undefined),
    [vaultKey, activeNoteId],
    undefined,
  );
  const blocks = useLiveQuery(
    () =>
      activeNoteId
        ? db.noteBlocks.where("noteId").equals(activeNoteId).sortBy("position")
        : [],
    [vaultKey, activeNoteId],
    [],
  );

  const requestSync = useEffectEvent((currentSession: AuthSession, announce: boolean) => {
    void runSync(currentSession, announce);
  });

  useEffect(() => {
    function handleDesktopAction(event: Event) {
      const action = (event as CustomEvent<DesktopAction>).detail;
      if (action === "devices") setIsAccountOpen(true);
      if (action === "vault") setIsVaultOpen(true);
      if (action === "pdf") setIsPdfConverterOpen(true);
      if (action === "integrations") window.location.assign("/integrations/");
      if (action === "sync") {
        if (session) requestSync(session, true);
        else setIsAccountOpen(true);
      }
    }

    window.addEventListener(DESKTOP_ACTION_EVENT, handleDesktopAction);
    return () => window.removeEventListener(DESKTOP_ACTION_EVENT, handleDesktopAction);
  }, [session]);

  function changeVault(nextVaultKey: string) {
    // Re-selecting the current vault must not reset the ready state: the key
    // dependency would not change, so the database effect could not run again.
    if (nextVaultKey === vaultKey) return;
    setDatabaseState({ status: "loading" });
    setCollectionId(undefined);
    setFilter("all");
    setVaultKey(nextVaultKey);
  }

  function replaceLibraryRoute(path: "/" | "/history", noteId?: string) {
    try {
      if (noteId) sessionStorage.setItem(ROUTE_NOTE_HANDOFF_KEY, noteId);
      else sessionStorage.removeItem(ROUTE_NOTE_HANDOFF_KEY);
    } catch {
      // Route selection still degrades safely to an unselected dashboard.
    }
    if (isTauriRuntime()) window.location.replace(path === "/" ? "/" : "/history/");
    else router.replace(path);
  }

  useEffect(() => {
    if (!historyView || selectedNoteId) return;
    try {
      const noteId = sessionStorage.getItem(ROUTE_NOTE_HANDOFF_KEY);
      if (!noteId) return;
      sessionStorage.removeItem(ROUTE_NOTE_HANDOFF_KEY);
      setSelectedNoteId(noteId);
    } catch {
      // A denied session store only means History opens without a selection.
    }
  }, [historyView, selectedNoteId, vaultKey]);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active) {
        setDatabaseState({
          status: "error",
          detail: "The browser did not finish opening its local database.",
        });
      }
    }, 8_000);

    void db.notes
      .count()
      .then(() => {
        if (active) setDatabaseState({ status: "ready" });
      })
      .catch((error: unknown) => {
        console.error("IndexedDB initialization failed", error);
        if (active) {
          setDatabaseState({
            status: "error",
            detail: "The browser could not access its local database.",
          });
        }
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [vaultKey]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setIsCommandOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(ACCOUNT_SESSION_MARKER) !== "1") return;
    } catch {
      return;
    }
    let active = true;
    void refreshAccount()
      .then((restored) => {
        if (!active) return;
        return activateAccountVault(restored.user.id).then(({ databaseName }) => {
          if (!active) return;
          changeVault(databaseName);
          setSession(restored);
          requestSync(restored, false);
          if (!historyView) replaceLibraryRoute("/history");
        });
      })
      .catch(() => {
        try { localStorage.removeItem(ACCOUNT_SESSION_MARKER); } catch { /* ignored */ }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function syncWhenOnline() {
      if (session) requestSync(session, false);
    }
    window.addEventListener("online", syncWhenOnline);
    return () => window.removeEventListener("online", syncWhenOnline);
  }, [session]);

  useEffect(() => {
    if (!session || stats.pending === 0) return;
    const timer = window.setTimeout(() => requestSync(session, false), 1_000);
    return () => window.clearTimeout(timer);
  }, [session, stats.pending, stats.pendingRevision]);

  useEffect(() => {
    if (!session || !isVaultRealtimeConfigured()) {
      setRealtimeState("offline");
      return;
    }
    const activeSession = session;
    setRealtimeState("connecting");
    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;

    function scheduleReconnect() {
      if (disposed) return;
      window.clearTimeout(reconnectTimer);
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(reconnectAttempt++, 5));
      reconnectTimer = window.setTimeout(() => void connect(), delay);
    }

    async function connect() {
      if (disposed) return;
      if (!navigator.onLine) {
        scheduleReconnect();
        return;
      }
      if (Date.parse(activeSession.expiresAt) <= Date.now() + 30_000) {
        try {
          const restored = await refreshAccount();
          if (!disposed) setSession(restored);
        } catch {
          scheduleReconnect();
        }
        return;
      }
      try {
        const nextSocket = await openVaultSocket(activeSession.accessToken);
        if (disposed) {
          nextSocket.close();
          return;
        }
        socket = nextSocket;
        nextSocket.onopen = () => {
          reconnectAttempt = 0;
          setRealtimeState("connected");
        };
        nextSocket.onmessage = (event) => {
          if (parseVaultSocketMessage(event.data)) requestSync(activeSession, false);
        };
        nextSocket.onerror = () => nextSocket.close();
        nextSocket.onclose = () => {
          if (!disposed) setRealtimeState("connecting");
          scheduleReconnect();
        };
      } catch {
        if (!disposed) {
          setRealtimeState("connecting");
          scheduleReconnect();
        }
      }
    }

    function reconnectWhenOnline() {
      if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
      window.clearTimeout(reconnectTimer);
      reconnectAttempt = 0;
      void connect();
    }

    void connect();
    window.addEventListener("online", reconnectWhenOnline);
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.removeEventListener("online", reconnectWhenOnline);
      socket?.close();
    };
  }, [session]);

  useEffect(() => {
    if (!session || realtimeState === "connected") return;
    const activeSession = session;
    function pullWhenAvailable() {
      if (navigator.onLine && document.visibilityState === "visible") {
        requestSync(activeSession, false);
      }
    }
    const timer = window.setInterval(pullWhenAvailable, FALLBACK_SYNC_INTERVAL_MS);
    window.addEventListener("focus", pullWhenAvailable);
    document.addEventListener("visibilitychange", pullWhenAvailable);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", pullWhenAvailable);
      document.removeEventListener("visibilitychange", pullWhenAvailable);
    };
  }, [realtimeState, session]);

  async function runSync(currentSession = session, announce = true) {
    if (!currentSession) {
      if (!currentSession) setIsAccountOpen(true);
      return;
    }
    if (syncInFlight.current) {
      syncQueued.current = true;
      return;
    }
    syncInFlight.current = true;
    let nextSession = currentSession;
    setSyncState("syncing");
    try {
      const result = await synchronizeVault(currentSession.accessToken, currentSession.user.id);
      confirmGuestMigration(currentSession.user.id);
      setSyncState("synced");
      if (announce) {
        toast.success("Vault synced", {
          description: `${result.pushed} local changes backed up · ${result.pulled} remote records applied.`,
        });
      }
    } catch (firstError) {
      try {
        const restored = await refreshAccount();
        setSession(restored);
        nextSession = restored;
        const result = await synchronizeVault(restored.accessToken, restored.user.id);
        confirmGuestMigration(restored.user.id);
        setSyncState("synced");
        if (announce) toast.success("Vault synced", { description: `${result.pulled} remote records applied.` });
      } catch {
        setSyncState("error");
        if (announce) {
          toast.error("Sync is unavailable", {
            description: firstError instanceof Error ? firstError.message : "Your changes are still safe locally.",
          });
        }
      }
    } finally {
      syncInFlight.current = false;
      if (syncQueued.current) {
        syncQueued.current = false;
        requestSync(nextSession, false);
      }
    }
  }

  async function authenticated(authenticatedSession: AuthSession) {
    try { localStorage.setItem(ACCOUNT_SESSION_MARKER, "1"); } catch { /* ignored */ }
    const intentionallyOpenNoteId = selectedNote?.id;
    const activation = await activateAccountVault(authenticatedSession.user.id, true);
    changeVault(activation.databaseName);
    setSelectedNoteId(intentionallyOpenNoteId);
    setSession(authenticatedSession);
    setIsAccountOpen(false);
    if (activation.importedNotes > 0) {
      toast.success("Offline notes added to your account", {
        description: `${activation.importedNotes} local ${activation.importedNotes === 1 ? "note is" : "notes are"} safe and ready to sync.`,
      });
    }
    void runSync(authenticatedSession);
    if (!historyView) replaceLibraryRoute("/history", intentionallyOpenNoteId);
  }

  function loggedOut() {
    const intentionallyOpenNoteId = selectedNote?.id;
    try { localStorage.removeItem(ACCOUNT_SESSION_MARKER); } catch { /* ignored */ }
    changeVault(endAccountVault());
    setSession(undefined);
    setSyncState("idle");
    setRealtimeState("offline");
    void (async () => {
      const guestNote = intentionallyOpenNoteId
        ? await db.notes.get(intentionallyOpenNoteId)
        : undefined;
      setSelectedNoteId(guestNote?.id);
      if (guestNote) {
        if (!historyView) replaceLibraryRoute("/history", guestNote.id);
      } else if (historyView) {
        replaceLibraryRoute("/");
      }
    })();
  }

  function selectNote(noteId: string) {
    setSelectedNoteId(noteId);
    setIsMobileLibraryOpen(false);
    setIsCommandOpen(false);
  }

  function createNote() {
    setIsNewNoteOpen(true);
  }

  async function createNoteWithFormat(format: ManualNoteFormat) {
    const noteId = await createBlankNote(format);
    setFilter("all");
    setCollectionId(undefined);
    setPage(1);
    setSelectedNoteId(noteId);
    setIsNewNoteOpen(false);
    setIsMobileLibraryOpen(false);
    setIsCommandOpen(false);
  }

  function changeFilter(nextFilter: LibraryFilter) {
    setFilter(nextFilter);
    setCollectionId(undefined);
    setPage(1);
    setSelectedNoteId(undefined);
  }

  const sidebarProps: LibrarySidebarProps = {
    page: notesPage,
    selectedNoteId: activeNoteId,
    query,
    filter,
    sort,
    counts,
    collections,
    collectionId,
    stats,
    onQueryChange: (nextQuery) => {
      setQuery(nextQuery);
      setPage(1);
    },
    onFilterChange: changeFilter,
    onCollectionChange: (nextCollectionId) => {
      setFilter("all");
      setCollectionId(nextCollectionId);
      setPage(1);
      setSelectedNoteId(undefined);
      setIsMobileLibraryOpen(false);
    },
    onEditCollection: (collection) => setCollectionEditor(collection ?? null),
    onDeleteCollection: setDeletingCollection,
    onSortChange: (nextSort) => {
      setSort(nextSort);
      setPage(1);
    },
    onPageChange: (nextPage) => {
      setPage(nextPage);
      setSelectedNoteId(undefined);
    },
    onSelect: selectNote,
    onCreate: () => void createNote(),
  };

  if (databaseState.status === "loading") return <LibraryLoading />;
  if (databaseState.status === "error") {
    return <LibraryUnavailable detail={databaseState.detail} />;
  }

  if (totalNotes === 0 && !historyView) {
    return (
      <div className="first-run-canvas relative min-h-dvh overflow-hidden">
        <div className="paint-backdrop paint-backdrop-forward" aria-hidden="true" />
        <div className="oil-grain" aria-hidden="true" />
        <div className="first-run-vignette" aria-hidden="true" />

        <header className="relative z-10 flex h-20 items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link className="flex items-center gap-3" href="/" aria-label="ChatSaver home">
            <Image
              src="/cs-transparent.png"
              alt=""
              width={40}
              height={40}
              className="size-10 object-cover"
              priority
            />
            <span className="text-[15px] font-semibold tracking-[-0.03em]">ChatSaver</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-white/55 md:flex">
              <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.7)]" />
              Local-first vault
            </span>
            <DesktopInstallButton />
            <Tooltip>
              <TooltipTrigger asChild>
                <ConnectedIntegrationsShortcut accessToken={session?.accessToken} />
              </TooltipTrigger>
              <TooltipContent>Connect your tools</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Convert text to PDF"
                  onClick={() => setIsPdfConverterOpen(true)}
                >
                  <FileDown />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Convert TXT or Markdown to PDF</TooltipContent>
            </Tooltip>
            {session ? (
              <Button variant="ghost" size="icon-lg" aria-label="Open account and sync" onClick={() => setIsAccountOpen(true)}>
                <Avatar className="size-8 border border-white/10">
                  <AvatarFallback className="bg-ivory text-[11px] font-semibold text-black">
                    {session.user.displayName?.slice(0, 2).toUpperCase() || session.user.email.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            ) : (
              <Button
                variant="outline"
                className="h-9 gap-2 border-white/12 bg-black/25 px-2.5 text-xs text-white backdrop-blur-md hover:border-primary/30 hover:bg-primary/10 sm:px-3"
                aria-label="Sign in or sign up"
                onClick={() => setIsAccountOpen(true)}
              >
                <ShieldCheck className="text-primary" />
                <span className="hidden sm:inline">Sign in / Sign up</span>
              </Button>
            )}
          </div>
        </header>

        <main className="relative z-10 flex min-h-[calc(100dvh-8.75rem)] items-center px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-10">
          <div className="mx-auto grid w-full max-w-[1240px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(320px,390px)] lg:gap-14 xl:gap-20">
          <section className="w-full max-w-[690px]">
            <div className="mb-6 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/62">
              <span className="h-px w-9 bg-primary" />
              Your private knowledge workspace
            </div>
            <h1 className="first-run-title text-balance text-[clamp(3.35rem,8.2vw,7.6rem)] font-semibold leading-[0.86] tracking-[-0.075em] text-white">
              Think freely.
              <span className="block font-normal text-ivory/78">Keep it yours.</span>
            </h1>
            <p className="mt-7 max-w-xl text-pretty text-[15px] leading-7 text-white/66 sm:text-base">
              Capture ideas, shape notes, and build a knowledge library that stays fast offline
              and moves securely across your devices.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="royal-glow h-12 gap-2.5 rounded-xl px-6 text-sm"
                onClick={() => setIsImportOpen(true)}
              >
                <Import />
                Import ChatGPT chats
                <ArrowRight className="ms-1 size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-xl border-white/16 bg-black/22 px-6 text-sm text-white backdrop-blur-md hover:bg-black/36"
                onClick={() => setIsVaultOpen(true)}
              >
                <Database />
                Recover from backup
              </Button>
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                variant="outline"
                className="h-11 rounded-xl border-white/12 bg-black/18 px-5 text-sm text-white backdrop-blur-md hover:bg-black/32"
                onClick={() => void createNote()}
              >
                <FilePlus2 />
                Start a blank note
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={!session}
                title={session ? "Open synced history" : "Sign in to open synced history"}
                className="h-11 rounded-xl border-white/12 bg-black/18 px-5 text-sm text-white backdrop-blur-md hover:bg-black/32"
                onClick={() => {
                  if (!session) return;
                  if (isTauriRuntime()) window.location.assign("/history/");
                  else router.push("/history");
                }}
              >
                <BookOpenText />
                History
              </Button>
            </div>

            <div className="mt-6 flex items-center gap-2 text-xs text-white/48">
              <ShieldCheck className="size-4 text-primary" />
              Imported notes are saved in this device's local vault.
            </div>
          </section>
          <MessageVaultVisual />
          </div>
        </main>

        <SiteFooter />

        {isImportOpen ? (
          <ImportDialog
            onClose={() => setIsImportOpen(false)}
            onImported={(noteId) => {
              if (noteId) {
                setFilter("all");
                setCollectionId(undefined);
                setPage(1);
                setSelectedNoteId(noteId);
              }
              setIsImportOpen(false);
            }}
          />
        ) : null}
        <NewNoteDialog open={isNewNoteOpen} onOpenChange={setIsNewNoteOpen} onCreate={createNoteWithFormat} />
        <VaultDialog
          open={isVaultOpen}
          onOpenChange={setIsVaultOpen}
          accessToken={session?.accessToken}
          vaultKey={vaultKey}
          onConvertToPdf={() => setIsPdfConverterOpen(true)}
        />
        {isPdfConverterOpen ? (
          <DocumentToPdfDialog open onOpenChange={setIsPdfConverterOpen} />
        ) : null}
        <AccountDialog
          open={isAccountOpen}
          session={session}
          syncing={syncState === "syncing"}
          onOpenChange={setIsAccountOpen}
          onAuthenticated={(authenticatedSession) => void authenticated(authenticatedSession)}
          onLoggedOut={loggedOut}
          onSync={() => void runSync()}
          onConvertToPdf={() => setIsPdfConverterOpen(true)}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden p-0 lg:p-3">
      <div className="paint-backdrop" aria-hidden="true" />
      <div className="oil-grain" aria-hidden="true" />

      <div className="app-surface relative z-10 flex h-dvh min-h-0 flex-col overflow-hidden border-white/8 lg:h-[calc(100dvh-1.5rem)] lg:rounded-[1.75rem] lg:border">
        <header className="flex h-16 shrink-0 items-center border-b border-white/8 bg-black/25 px-3 backdrop-blur-2xl sm:px-5">
          <Sheet open={isMobileLibraryOpen} onOpenChange={setIsMobileLibraryOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-lg" className="me-2 lg:hidden" aria-label="Open library">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[88vw] max-w-[340px] border-e-white/10 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>ChatSaver library</SheetTitle>
                <SheetDescription>Browse, filter, and create saved notes.</SheetDescription>
              </SheetHeader>
              <LibrarySidebar {...sidebarProps} />
            </SheetContent>
          </Sheet>

          <Link className="flex items-center gap-2.5" href="/" aria-label="ChatSaver home">
            <Image
              src="/cs-transparent.png"
              alt=""
              width={36}
              height={36}
              className="size-9 object-cover"
              priority
            />
            <span>
              <span className="block text-sm font-semibold leading-none tracking-[-0.025em]">
                ChatSaver
              </span>
              <span className="mt-1 hidden font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground sm:block">
                Knowledge studio
              </span>
            </span>
          </Link>

          <Separator orientation="vertical" className="mx-5 hidden h-7 bg-white/8 lg:block" />
          <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <BookOpenText className="size-3.5" />
            {historyView ? "History" : FILTERS.find((item) => item.id === filter)?.label}
            <ChevronRight className="size-3" />
            <span className="max-w-64 truncate text-foreground">
              {selectedNote?.title ?? "Overview"}
            </span>
          </div>

          <div className="ms-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <ConnectedIntegrationsShortcut accessToken={session?.accessToken} />
              </TooltipTrigger>
              <TooltipContent>Integrations</TooltipContent>
            </Tooltip>
            <DesktopInstallButton compact />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="hidden h-8 gap-2 border-white/8 bg-black/20 font-mono text-[9px] uppercase tracking-wide text-muted-foreground sm:flex"
                  onClick={() => session ? void runSync() : setIsAccountOpen(true)}
                >
                  {syncState === "syncing" ? (
                    <LoaderCircle className="size-3 animate-spin text-primary" />
                  ) : session && realtimeState === "connected" ? (
                    <Cloud className="size-3 text-emerald-300" />
                  ) : (
                    <CloudOff className="size-3 text-amber-300" />
                  )}
                  {syncState === "syncing"
                    ? "Syncing"
                    : session && realtimeState === "connected" && stats.pending === 0
                      ? "Live sync"
                    : session && stats.pending === 0
                      ? "Up to date"
                      : `${stats.pending} local changes`}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {session && realtimeState === "connected"
                  ? "Live sync connected"
                  : session
                    ? "Sync with your PostgreSQL vault"
                    : "Sign in to back up and recover this vault"}
              </TooltipContent>
            </Tooltip>

            <Button
              className="royal-glow h-9 gap-2 px-3 sm:px-4"
              aria-label="Import ChatGPT chats"
              onClick={() => setIsImportOpen(true)}
            >
              <Import />
              <span className="hidden sm:inline">Import chats</span>
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Convert text to PDF"
                  onClick={() => setIsPdfConverterOpen(true)}
                >
                  <FileDown />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Convert TXT or Markdown to PDF</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Open vault controls"
                  onClick={() => setIsVaultOpen(true)}
                >
                  <Settings2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Backup, restore, and storage</TooltipContent>
            </Tooltip>

            {session ? (
              <Button variant="ghost" size="icon-lg" aria-label="Open account and sync" onClick={() => setIsAccountOpen(true)}>
                <Avatar className="size-8 border border-white/10">
                  <AvatarFallback className="bg-ivory text-[11px] font-semibold text-black">
                    {session.user.displayName?.slice(0, 2).toUpperCase() || session.user.email.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            ) : (
              <Button
                variant="outline"
                className="h-9 gap-2 border-white/10 bg-black/20 px-2.5 text-xs hover:border-primary/25 hover:bg-primary/10 sm:px-3"
                aria-label="Sign in or sign up"
                onClick={() => setIsAccountOpen(true)}
              >
                <ShieldCheck className="text-primary" />
                <span className="hidden xl:inline">Sign in / Sign up</span>
                <span className="hidden sm:inline xl:hidden">Sign in</span>
              </Button>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden min-h-0 w-[322px] shrink-0 overflow-hidden border-e border-white/8 lg:block">
            <LibrarySidebar {...sidebarProps} />
          </aside>

          <NoteEditor
            note={selectedNote}
            blocks={blocks}
            collections={collections}
            emptyView={historyView ? "history" : "library"}
            onDeleted={() => {
              setSelectedNoteId(undefined);
              if (session) requestSync(session, false);
            }}
            onArchived={() => {
              setSelectedNoteId(undefined);
              setPage(1);
            }}
            onImport={() => setIsImportOpen(true)}
            onCreate={() => void createNote()}
          />
        </div>

        <SiteFooter compact />
      </div>

      {isImportOpen ? (
        <ImportDialog
          onClose={() => setIsImportOpen(false)}
          onImported={(noteId) => {
            if (noteId) {
              setFilter("all");
              setCollectionId(undefined);
              setPage(1);
              setSelectedNoteId(noteId);
            }
            setIsImportOpen(false);
          }}
        />
      ) : null}

      <NewNoteDialog open={isNewNoteOpen} onOpenChange={setIsNewNoteOpen} onCreate={createNoteWithFormat} />

      <CollectionNameDialog
        collection={collectionEditor ?? undefined}
        open={collectionEditor !== undefined}
        onOpenChange={(open) => {
          if (!open) setCollectionEditor(undefined);
        }}
        onSaved={(id) => {
          setCollectionId(id);
          setFilter("all");
          setPage(1);
        }}
      />

      <AlertDialog
        open={Boolean(deletingCollection)}
        onOpenChange={(open) => {
          if (!open) setDeletingCollection(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deletingCollection?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Notes stay safely in your library. Only this collection and its memberships are removed from every synced device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deletingCollection) return;
                const id = deletingCollection.id;
                void deleteCollection(id).then(() => {
                  if (collectionId === id) changeFilter("all");
                  toast.success("Collection deleted; notes were kept");
                }).catch((error: unknown) => {
                  toast.error(error instanceof Error ? error.message : "The collection could not be deleted.");
                });
                setDeletingCollection(undefined);
              }}
            >
              Delete collection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VaultDialog
        open={isVaultOpen}
        onOpenChange={setIsVaultOpen}
        accessToken={session?.accessToken}
        vaultKey={vaultKey}
        onConvertToPdf={() => setIsPdfConverterOpen(true)}
      />

      {isPdfConverterOpen ? (
        <DocumentToPdfDialog open onOpenChange={setIsPdfConverterOpen} />
      ) : null}

      <AccountDialog
        open={isAccountOpen}
        session={session}
        syncing={syncState === "syncing"}
        onOpenChange={setIsAccountOpen}
        onAuthenticated={(authenticatedSession) => void authenticated(authenticatedSession)}
        onLoggedOut={loggedOut}
        onSync={() => void runSync()}
        onConvertToPdf={() => setIsPdfConverterOpen(true)}
      />

      <CommandDialog
        open={isCommandOpen}
        onOpenChange={setIsCommandOpen}
        title="Search ChatSaver"
        description="Open a note or run a focused library action."
        className="border-white/10 bg-card/96 sm:max-w-xl"
      >
        <CommandInput placeholder="Search notes or actions…" />
        <CommandList>
          <CommandEmpty>No matching notes or actions.</CommandEmpty>
          <CommandGroup heading="Notes">
            {commandNotes.map((note) => (
              <CommandItem
                key={note.id}
                value={`${note.title} ${note.searchText}`}
                onSelect={() => selectNote(note.id)}
              >
                {note.isFavorite ? <Star className="fill-current text-primary" /> : <BookOpenText />}
                <span className="truncate">{note.title}</span>
                <CommandShortcut>{note.blockCount} Q&A</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => void createNote()}>
              <Plus />
              Create a blank note
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setIsCommandOpen(false);
                setIsImportOpen(true);
              }}
            >
              <Import />
              Import ChatGPT history
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setIsCommandOpen(false);
                setIsVaultOpen(true);
              }}
            >
              <WandSparkles />
              Open vault controls
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
