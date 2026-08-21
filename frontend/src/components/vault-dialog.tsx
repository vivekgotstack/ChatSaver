"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArchiveRestore,
  CloudCog,
  Database,
  Download,
  FileArchive,
  FileDown,
  HardDrive,
  Plug,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { clearLocalVault, createVaultBackup, db, restoreVaultBackup } from "@/lib/db/database";
import { eraseSyncedVault } from "@/lib/sync";
import { downloadVaultBackup } from "@/lib/portable";
import { useLiveQuery } from "@/hooks/use-live-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface VaultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken?: string;
  vaultKey: string;
  onConvertToPdf?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function VaultDialog({ open, onOpenChange, accessToken, vaultKey, onConvertToPdf }: VaultDialogProps) {
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>({});
  const imports = useLiveQuery(
    () => db.imports.orderBy("createdAt").reverse().limit(6).toArray(),
    [vaultKey],
    [],
  );
  const counts = useLiveQuery(
    async () => {
      const [notes, conversations, blocks, pending] = await Promise.all([
        db.notes.count(),
        db.conversations.count(),
        db.noteBlocks.count(),
        db.outbox.count(),
      ]);
      return { notes, conversations, blocks, pending };
    },
    [vaultKey],
    { notes: 0, conversations: 0, blocks: 0, pending: 0 },
  );

  useEffect(() => {
    if (!open || !navigator.storage?.estimate) return;
    void navigator.storage.estimate().then(({ usage, quota }) => setStorage({ usage, quota }));
  }, [open]);

  async function exportBackup() {
    setIsBusy(true);
    try {
      downloadVaultBackup(await createVaultBackup());
      toast.success("Vault backup downloaded");
    } catch {
      toast.error("The vault backup could not be created.");
    } finally {
      setIsBusy(false);
    }
  }

  async function restoreBackup(file: File) {
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Vault backups must be smaller than 100 MB.");
      return;
    }

    setIsBusy(true);
    try {
      const restored = await restoreVaultBackup(JSON.parse(await file.text()) as unknown);
      toast.success(`Recovered ${restored} note${restored === 1 ? "" : "s"} from backup`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The backup could not be restored.");
    } finally {
      setIsBusy(false);
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  }

  async function eraseLocalVault() {
    setIsBusy(true);
    try {
      if (accessToken) await eraseSyncedVault(accessToken);
      await clearLocalVault();
      toast.success(accessToken ? "Vault permanently erased" : "Browser vault permanently erased");
      window.location.replace("/");
    } catch (error) {
      toast.error(accessToken ? "The account vault was not erased." : "The browser vault was not erased.", {
        description: error instanceof Error ? error.message : "Close other ChatSaver tabs and try again.",
      });
      setIsBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-x-hidden overflow-y-auto border-white/10 bg-card/95 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-2xl">
        <DialogHeader className="min-w-0 border-b border-white/8 px-4 py-5 text-left sm:px-6">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="outline" className="border-primary/30 bg-primary/10">
              <ShieldCheck />
              Local-first controls
            </Badge>
          </div>
          <DialogTitle className="text-2xl tracking-[-0.035em]">Backup &amp; storage</DialogTitle>
          <DialogDescription className="max-w-xl leading-6">
            A ChatSaver backup is a .json recovery file containing your notes, chats, and
            import history. Importing one merges its records into this device and queues them for sync.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-5 px-4 py-5 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Notes", value: counts.notes, icon: FileArchive },
              { label: "Chats", value: counts.conversations, icon: ArchiveRestore },
              { label: "Q&A blocks", value: counts.blocks, icon: Database },
              { label: "Pending", value: counts.pending, icon: CloudCog },
            ].map((item) => (
              <Card className="border-white/8 bg-black/18 py-0" key={item.label}>
                <CardContent className="p-4">
                  <item.icon className="mb-4 size-4 text-primary" />
                  <p className="text-2xl font-semibold tracking-[-0.04em]">{item.value}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    {item.label}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden border-white/8 bg-black/18 py-0">
            <CardContent className="p-0">
              <div className="flex items-center gap-3 p-4">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
                  <HardDrive />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Browser storage</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatBytes(storage.usage)} used
                    {storage.quota ? ` of ${formatBytes(storage.quota)} available` : ""}
                  </p>
                </div>
                <Badge variant="secondary">IndexedDB</Badge>
              </div>
              <Separator />
              <div className="grid min-w-0 gap-2 p-4 md:grid-cols-2">
                <Button
                  variant="outline"
                  className="h-auto min-w-0 overflow-hidden whitespace-normal justify-start gap-3 px-4 py-3 text-left"
                  disabled={isBusy}
                  onClick={() => void exportBackup()}
                >
                  <Download className="shrink-0 text-primary" />
                  <span className="min-w-0 overflow-hidden">
                    <span className="block break-words text-sm font-medium leading-tight">Download backup</span>
                    <span className="mt-0.5 block break-words text-xs font-normal leading-snug text-muted-foreground">
                      Full restorable vault (.json)
                    </span>
                  </span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-w-0 overflow-hidden whitespace-normal justify-start gap-3 px-4 py-3 text-left"
                  disabled={isBusy}
                  onClick={() => restoreInputRef.current?.click()}
                >
                  <Upload className="shrink-0 text-primary" />
                  <span className="min-w-0 overflow-hidden">
                    <span className="block break-words text-sm font-medium leading-tight">Import recovery backup</span>
                    <span className="mt-0.5 block break-words text-xs font-normal leading-snug text-muted-foreground">
                      Merge a ChatSaver .json recovery file
                    </span>
                  </span>
                </Button>
                {onConvertToPdf ? (
                  <Button
                    variant="outline"
                    className="h-auto min-w-0 overflow-hidden whitespace-normal justify-start gap-3 px-4 py-3 text-left md:col-span-2"
                    disabled={isBusy}
                    onClick={() => {
                      onOpenChange(false);
                      window.setTimeout(onConvertToPdf, 0);
                    }}
                  >
                    <FileDown className="shrink-0 text-primary" />
                    <span className="min-w-0 overflow-hidden">
                      <span className="block break-words text-sm font-medium leading-tight">Convert text to PDF</span>
                      <span className="mt-0.5 block break-words text-xs font-normal leading-snug text-muted-foreground">
                        Create a named PDF from a local TXT or Markdown file
                      </span>
                    </span>
                  </Button>
                ) : null}
                <Button
                  asChild
                  variant="outline"
                  className="h-auto min-w-0 overflow-hidden whitespace-normal justify-start gap-3 px-4 py-3 text-left md:col-span-2"
                >
                  <Link href="/integrations" onClick={() => onOpenChange(false)}>
                    <Plug className="shrink-0 text-primary" />
                    <span className="min-w-0 overflow-hidden">
                      <span className="block break-words text-sm font-medium leading-tight">Plugins &amp; integrations</span>
                      <span className="mt-0.5 block break-words text-xs font-normal leading-snug text-muted-foreground">
                        Connect and manage GitHub, LinkedIn, Slack, Gmail, Drive, and Notion
                      </span>
                    </span>
                  </Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-auto min-w-0 overflow-hidden whitespace-normal justify-start gap-3 border-destructive/25 px-4 py-3 text-left text-destructive hover:bg-destructive/10 hover:text-destructive md:col-span-2"
                      disabled={isBusy}
                    >
                      <Trash2 className="shrink-0" />
                      <span className="min-w-0 overflow-hidden">
                        <span className="block break-words text-sm font-medium leading-tight">
                          {accessToken ? "Erase vault everywhere" : "Erase browser vault"}
                        </span>
                        <span className="mt-0.5 block break-words text-xs font-normal leading-snug text-muted-foreground">
                          {accessToken
                            ? "Permanently remove local and PostgreSQL data"
                            : "Permanently remove IndexedDB data on this browser"}
                        </span>
                      </span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {accessToken ? "Permanently erase this vault everywhere?" : "Erase this browser's vault?"}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {accessToken
                          ? "This permanently deletes chats, messages, notes, import history, shares, pending changes, and their PostgreSQL copies. Other devices will be told to remove them at their next sync. This cannot be undone."
                          : "This permanently removes notes, chats, import history, and pending changes from this browser. You are signed out, so any data already synced to an account is not deleted. This cannot be undone."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        disabled={isBusy}
                        onClick={() => void eraseLocalVault()}
                      >
                        {accessToken ? "Erase everywhere" : "Erase browser data"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <input
                  ref={restoreInputRef}
                  className="sr-only"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void restoreBackup(file);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <div>
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Recent imports</p>
                <p className="text-xs text-muted-foreground">Local history of processed imports.</p>
              </div>
              <Badge variant="outline">{imports.length}</Badge>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/8 bg-black/15">
              {imports.length ? (
                imports.map((item, index) => (
                  <div
                    className={`flex min-w-0 flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap ${
                      index ? "border-t border-white/6" : ""
                    }`}
                    key={item.id}
                  >
                    <ArchiveRestore className="size-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{item.filename}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.importedConversationCount} imported
                        {item.skippedConversationCount
                          ? ` · ${item.skippedConversationCount} duplicates skipped`
                          : ""}
                      </p>
                    </div>
                    <time className="shrink-0 font-mono text-[9px] uppercase text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                ))
              ) : (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No ChatGPT exports have been imported yet.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 border-t border-white/8 bg-black/15 px-4 py-4 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
