"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, FileDown, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createMarkdownNote } from "@/lib/db/database";
import {
  executeIntegrationAction,
  type IntegrationConnection,
  type IntegrationDefinition,
  type IntegrationSearchItem,
  type ImportedIntegrationDocument,
} from "@/lib/integrations";
import { synchronizeVault, type AuthSession } from "@/lib/sync";

interface IntegrationImportDialogProps {
  definition: IntegrationDefinition;
  connection: IntegrationConnection;
  session: AuthSession;
  onClose: () => void;
}

interface Workflow {
  mode: "search" | "url";
  fieldLabel: string;
  placeholder: string;
  searchAction?: string;
  importAction: string;
  submitLabel: string;
}

const WORKFLOWS: Record<string, Workflow> = {
  gmail: {
    mode: "search",
    fieldLabel: "Email search",
    placeholder: "from:team@example.com project update",
    searchAction: "gmail-search",
    importAction: "gmail-import-message",
    submitLabel: "Search email",
  },
  googledrive: {
    mode: "search",
    fieldLabel: "File name",
    placeholder: "Research brief",
    searchAction: "drive-search",
    importAction: "drive-import",
    submitLabel: "Find files",
  },
  notion: {
    mode: "search",
    fieldLabel: "Page search",
    placeholder: "Product strategy",
    searchAction: "notion-search",
    importAction: "notion-import",
    submitLabel: "Find pages",
  },
  slack: {
    mode: "search",
    fieldLabel: "Message search",
    placeholder: "launch decision",
    searchAction: "slack-search",
    importAction: "slack-import-thread",
    submitLabel: "Find messages",
  },
  github: {
    mode: "url",
    fieldLabel: "GitHub URL",
    placeholder: "https://github.com/owner/repo/issues/123",
    importAction: "github-import",
    submitLabel: "Import from URL",
  },
  linkedin: {
    mode: "url",
    fieldLabel: "LinkedIn post URL or URN",
    placeholder: "https://www.linkedin.com/posts/...activity-1234567890...",
    importAction: "linkedin-import-post",
    submitLabel: "Import post",
  },
};

export function IntegrationImportDialog({
  definition,
  connection,
  session,
  onClose,
}: IntegrationImportDialogProps) {
  const workflow = WORKFLOWS[definition.slug];
  const [value, setValue] = useState("");
  const [items, setItems] = useState<IntegrationSearchItem[]>([]);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [savedNoteId, setSavedNoteId] = useState<string>();
  const canSubmit = value.trim().length > 0 && !busy;
  const accountName = connection.alias || definition.name;
  const title = useMemo(() => `Import from ${definition.name}`, [definition.name]);

  if (!workflow) return null;

  async function saveDocument(document: ImportedIntegrationDocument) {
    const source = document.sourceUrl
      ? `> Imported from [${document.sourceLabel}](${document.sourceUrl})\n\n`
      : `> Imported from ${document.sourceLabel}\n\n`;
    const noteId = await createMarkdownNote(document.title, `${source}${document.content}`);
    setSavedNoteId(noteId);
    void synchronizeVault(session.accessToken, session.user.id).catch(() => {
      toast.info("Saved locally", { description: "The note will sync with the next vault sync." });
    });
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy("submit");
    setError(undefined);
    try {
      if (workflow.mode === "url") {
        const result = await executeIntegrationAction(
          session.accessToken,
          connection.id,
          workflow.importAction,
          { url: value.trim() },
        );
        if (!result.result.document) throw new Error("GitHub did not return importable content.");
        await saveDocument(result.result.document);
        return;
      }
      const result = await executeIntegrationAction(
        session.accessToken,
        connection.id,
        workflow.searchAction!,
        { query: value.trim() },
      );
      setItems(result.result.items ?? []);
      if (!result.result.items?.length) setError("No matching items were found.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The connected service could not complete that request.");
    } finally {
      setBusy(undefined);
    }
  }

  async function saveLinkedInProfile() {
    setBusy("profile");
    setError(undefined);
    try {
      const result = await executeIntegrationAction(
        session.accessToken,
        connection.id,
        "linkedin-import-profile",
      );
      if (!result.result.document) throw new Error("LinkedIn did not return profile data.");
      await saveDocument(result.result.document);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The LinkedIn profile could not be imported.");
    } finally {
      setBusy(undefined);
    }
  }

  async function importItem(item: IntegrationSearchItem, action = workflow.importAction) {
    const operationId = `${item.id}:${action}`;
    setBusy(operationId);
    setError(undefined);
    try {
      const result = await executeIntegrationAction(
        session.accessToken,
        connection.id,
        action,
        { ...item.reference, title: item.title },
      );
      if (!result.result.document) throw new Error("That item did not contain importable text.");
      await saveDocument(result.result.document);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That item could not be imported.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[min(90dvh,760px)] overflow-y-auto border-white/10 bg-[#100a0c]/98 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-2xl">
        <DialogHeader className="border-b border-white/8 px-5 py-5 text-left sm:px-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-emerald-300/18 bg-emerald-300/6 text-emerald-100">
              <ShieldCheck /> Read only
            </Badge>
            <span className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">{accountName}</span>
          </div>
          <DialogTitle className="text-2xl tracking-[-0.04em]">{title}</DialogTitle>
          <DialogDescription className="leading-6">
            Select one useful item. ChatSaver creates an editable Markdown copy; the source is never changed.
          </DialogDescription>
        </DialogHeader>

        {savedNoteId ? (
          <div className="grid place-items-center px-5 py-12 text-center sm:px-8">
            <span className="grid size-14 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-300/8 text-emerald-200">
              <CheckCircle2 className="size-7" />
            </span>
            <h3 className="mt-5 text-xl font-semibold tracking-[-0.035em]">Knowledge saved</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              The imported copy is editable and queued through your existing ChatSaver sync.
            </p>
            <Button asChild className="royal-glow mt-6">
              <Link href="/history">Open in History <ArrowRight /></Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-5 px-5 py-5 sm:px-6">
            {definition.slug === "linkedin" ? (
              <section className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-medium text-white/90">My professional profile</h3>
                  <p className="mt-1 text-xs leading-5 text-white/48">Save a private, editable snapshot of your connected profile.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 border-white/10 bg-black/25"
                  disabled={Boolean(busy)}
                  onClick={() => void saveLinkedInProfile()}
                >
                  {busy === "profile" ? <LoaderCircle className="animate-spin" /> : <FileDown />}
                  Save my profile
                </Button>
              </section>
            ) : null}

            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <label htmlFor="integration-import-value" className="text-xs font-medium text-white/72">
                {workflow.fieldLabel}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="integration-import-value"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={workflow.placeholder}
                  autoComplete="off"
                  maxLength={workflow.mode === "url" ? 2048 : 300}
                  className="h-11 min-w-0 flex-1 border-white/10 bg-black/35"
                />
                <Button type="submit" className="royal-glow h-11 sm:min-w-36" disabled={!canSubmit}>
                  {busy === "submit" ? <LoaderCircle className="animate-spin" /> : workflow.mode === "url" ? <FileDown /> : <Search />}
                  {workflow.submitLabel}
                </Button>
              </div>
            </form>

            {error ? (
              <div role="alert" className="rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            {items.length > 0 ? (
              <div className="grid max-h-[42dvh] gap-2 overflow-y-auto pe-1" aria-label="Search results">
                {items.map((item) => (
                  <article key={item.id} className="grid gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium text-white/90">{item.title}</h3>
                      {item.subtitle ? <p className="mt-1 truncate text-[10px] text-white/42">{item.subtitle}</p> : null}
                      {item.preview ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/55">{item.preview}</p> : null}
                    </div>
                    <div className="flex gap-2 sm:flex-col">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 border-white/10 bg-black/25"
                        disabled={Boolean(busy)}
                        onClick={() => void importItem(item, definition.slug === "gmail" ? "gmail-import-message" : workflow.importAction)}
                      >
                        {busy === `${item.id}:${definition.slug === "gmail" ? "gmail-import-message" : workflow.importAction}` ? <LoaderCircle className="animate-spin" /> : <FileDown />}
                        {definition.slug === "gmail" ? "Save email" : "Save note"}
                      </Button>
                      {definition.slug === "gmail" && item.reference.threadId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 border-white/10 bg-black/25"
                          disabled={Boolean(busy)}
                          onClick={() => void importItem(item, "gmail-import-thread")}
                        >
                          {busy === `${item.id}:gmail-import-thread` ? <LoaderCircle className="animate-spin" /> : <FileDown />}
                          Save thread
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
