"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, DatabaseBackup, ExternalLink, FileDown, LoaderCircle, Search, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createMarkdownNote, createMarkdownVaultBackup } from "@/lib/db/database";
import {
  executeIntegrationAction,
  type IntegrationConnection,
  type IntegrationDefinition,
  type IntegrationSearchItem,
  type IntegrationOperationResult,
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
  const [operation, setOperation] = useState<IntegrationOperationResult>();
  const [writeConfirmed, setWriteConfirmed] = useState(false);
  const [repository, setRepository] = useState("");
  const [newRepository, setNewRepository] = useState("ChatSaverBackup");
  const [backupPath, setBackupPath] = useState("ChatSaverBackup/README.md");
  const [backupBranch, setBackupBranch] = useState("main");
  const [privateRepository, setPrivateRepository] = useState(true);
  const [slackChannel, setSlackChannel] = useState("");
  const canSubmit = value.trim().length > 0 && !busy;
  const accountName = connection.alias || definition.name;
  const title = useMemo(() => `Work with ${definition.name}`, [definition.name]);
  const supportsWrites = definition.actions.some((action) => !action.readOnly);

  if (!workflow) return null;

  async function saveDocument(document: ImportedIntegrationDocument, content = document.content, title = document.title) {
    const source = document.sourceUrl
      ? `> Imported from [${document.sourceLabel}](${document.sourceUrl})\n\n`
      : `> Imported from ${document.sourceLabel}\n\n`;
    const noteId = await createMarkdownNote(title, `${source}${content}`);
    setSavedNoteId(noteId);
    void synchronizeVault(session.accessToken, session.user.id).catch(() => {
      toast.info("Saved locally", { description: "The note will sync with the next vault sync." });
    });
  }

  async function submit(buildInsightWorkspace = false) {
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
        const document = result.result.document;
        const enriched = definition.slug === "linkedin" && buildInsightWorkspace
          ? `${document.content}\n\n---\n\n## Insight workspace\n\n### Key takeaways\n\n- \n- \n- \n\n### Why this matters to my work\n\n\n\n### Ideas to apply or discuss\n\n- [ ] \n- [ ] \n\n### My response draft\n\n`
          : document.content;
        await saveDocument(document, enriched, buildInsightWorkspace ? `Insights · ${document.title}` : document.title);
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

  async function saveLinkedInProfile(buildCareerWorkspace = false) {
    setBusy(buildCareerWorkspace ? "career" : "profile");
    setError(undefined);
    try {
      const result = await executeIntegrationAction(
        session.accessToken,
        connection.id,
        "linkedin-import-profile",
      );
      if (!result.result.document) throw new Error("LinkedIn did not return profile data.");
      const document = result.result.document;
      if (buildCareerWorkspace) {
        const workspace = `${document.content}\n\n---\n\n## Professional positioning\n\n### The value I create\n\n\n\n### Proof points and outcomes\n\n- \n- \n- \n\n### Skills to foreground\n\n- \n- \n\n## Profile improvement checklist\n\n- [ ] Make the headline outcome-focused\n- [ ] Add measurable results to recent experience\n- [ ] Align About, headline, and featured work\n- [ ] Add a clear invitation to connect\n\n## Next career actions\n\n- [ ] \n- [ ] `;
        await saveDocument(document, workspace, "LinkedIn career workspace");
      } else {
        await saveDocument(document);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The LinkedIn profile could not be imported.");
    } finally {
      setBusy(undefined);
    }
  }

  async function publishGithubBackup(createRepository: boolean) {
    if (!writeConfirmed) return;
    if (!createRepository && !repository.trim()) {
      setError("Enter the existing repository as owner/repository.");
      return;
    }
    setBusy(createRepository ? "github-create" : "github-publish");
    setError(undefined);
    try {
      const backup = await createMarkdownVaultBackup();
      if (backup.noteCount === 0) throw new Error("Create at least one note before publishing a backup.");
      const result = await executeIntegrationAction(
        session.accessToken,
        connection.id,
        createRepository ? "github-create-backup-repo" : "github-publish-backup",
        {
          repository: createRepository ? newRepository.trim() : repository.trim(),
          private: String(privateRepository),
          path: createRepository ? "README.md" : backupPath.trim(),
          branch: backupBranch.trim() || "main",
          message: `ChatSaver backup · ${new Date(backup.exportedAt).toLocaleDateString()}`,
          content: backup.content,
        },
      );
      if (!result.result.operation) throw new Error("GitHub did not confirm the backup commit.");
      setOperation(result.result.operation);
      toast.success("GitHub backup published", { description: `${backup.noteCount} notes committed as Markdown.` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The GitHub backup could not be published.");
    } finally {
      setBusy(undefined);
    }
  }

  async function publishSlackDigest() {
    if (!writeConfirmed || !slackChannel.trim()) return;
    setBusy("slack-publish");
    setError(undefined);
    try {
      const backup = await createMarkdownVaultBackup();
      if (backup.noteCount === 0) throw new Error("Create at least one note before publishing a digest.");
      const contents = backup.content.split("\n---\n", 1)[0];
      const result = await executeIntegrationAction(
        session.accessToken,
        connection.id,
        "slack-send-digest",
        { channel: slackChannel.trim().replace(/^#/, ""), content: `${contents}\n\n_Open ChatSaver for the full knowledge vault._` },
      );
      if (!result.result.operation) throw new Error("Slack did not confirm the published digest.");
      setOperation(result.result.operation);
      toast.success("Vault digest published", { description: `Sent ${backup.noteCount} note titles to ${slackChannel.trim()}.` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Slack digest could not be published.");
    } finally {
      setBusy(undefined);
    }
  }

  async function importItem(item: IntegrationSearchItem, action = workflow.importAction, buildWorkspace = false) {
    const operationId = `${item.id}:${action}${buildWorkspace ? ":workspace" : ""}`;
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
      const document = result.result.document;
      const workspace = buildWorkspace ? buildKnowledgeWorkspace(definition.slug, document.content) : document.content;
      await saveDocument(document, workspace, buildWorkspace ? `${document.title} · working brief` : document.title);
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
            <Badge variant="outline" className={supportsWrites ? "border-amber-300/18 bg-amber-300/6 text-amber-100" : "border-emerald-300/18 bg-emerald-300/6 text-emerald-100"}>
              <ShieldCheck /> {supportsWrites ? "Read + confirmed writes" : "Read only"}
            </Badge>
            <span className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">{accountName}</span>
          </div>
          <DialogTitle className="text-2xl tracking-[-0.04em]">{title}</DialogTitle>
          <DialogDescription className="leading-6">
            {supportsWrites
              ? "Import knowledge freely. Write actions are separate, explicit, and run only after your confirmation."
              : "Select one useful item. ChatSaver creates an editable Markdown copy; the source is never changed."}
          </DialogDescription>
        </DialogHeader>

        {savedNoteId || operation ? (
          <div className="grid place-items-center px-5 py-12 text-center sm:px-8">
            <span className="grid size-14 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-300/8 text-emerald-200">
              <CheckCircle2 className="size-7" />
            </span>
            <h3 className="mt-5 text-xl font-semibold tracking-[-0.035em]">{operation ? operation.message : "Knowledge saved"}</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {operation ? `The confirmed ${operation.service} action completed successfully.` : "The imported copy is editable and queued through your existing ChatSaver sync."}
            </p>
            {operation?.url ? (
              <Button asChild className="royal-glow mt-6"><a href={operation.url} target="_blank" rel="noreferrer">Open result <ExternalLink /></a></Button>
            ) : (
              <Button asChild className="royal-glow mt-6"><Link href="/history">Open in History <ArrowRight /></Link></Button>
            )}
          </div>
        ) : (
          <div className="space-y-5 px-5 py-5 sm:px-6">
            {definition.slug === "github" ? (
              <section className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <div><h3 className="text-sm font-medium text-white/90">Versioned Markdown backup</h3><p className="mt-1 text-xs leading-5 text-white/48">Publish every current note into a clean Markdown README. Updating the same path creates recoverable Git history.</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs text-white/70">New backup repository<Input value={newRepository} onChange={(event) => setNewRepository(event.target.value)} maxLength={100} className="bg-black/30" /></label>
                  <label className="grid gap-1.5 text-xs text-white/70">Existing owner/repository<Input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/professional-notes" maxLength={240} className="bg-black/30" /></label>
                  <label className="grid gap-1.5 text-xs text-white/70">Backup Markdown path<Input value={backupPath} onChange={(event) => setBackupPath(event.target.value)} maxLength={240} className="bg-black/30" /></label>
                  <label className="grid gap-1.5 text-xs text-white/70">Existing repo branch<Input value={backupBranch} onChange={(event) => setBackupBranch(event.target.value)} maxLength={100} className="bg-black/30" /></label>
                </div>
                <label className="flex items-center gap-2 text-xs text-white/65"><Checkbox checked={privateRepository} onCheckedChange={(checked) => setPrivateRepository(checked === true)} /> Create new repository as private</label>
                <WriteConfirmation checked={writeConfirmed} onCheckedChange={setWriteConfirmed} service="GitHub" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" disabled={!writeConfirmed || !newRepository.trim() || Boolean(busy)} onClick={() => void publishGithubBackup(true)}>{busy === "github-create" ? <LoaderCircle className="animate-spin" /> : <DatabaseBackup />} Create backup repo</Button>
                  <Button type="button" variant="outline" className="border-white/10 bg-black/25" disabled={!writeConfirmed || !repository.trim() || !backupPath.trim() || Boolean(busy)} onClick={() => void publishGithubBackup(false)}>{busy === "github-publish" ? <LoaderCircle className="animate-spin" /> : <DatabaseBackup />} Update existing repo</Button>
                </div>
              </section>
            ) : null}

            {definition.slug === "slack" ? (
              <section className="grid gap-4 rounded-xl border border-[#4a154b]/45 bg-[#4a154b]/12 p-4">
                <div><h3 className="text-sm font-medium text-white/90">Publish a vault digest</h3><p className="mt-1 text-xs leading-5 text-white/48">Send the current note index to a channel so a team can discover what ChatSaver contains.</p></div>
                <label className="grid gap-1.5 text-xs text-white/70">Channel name or ID<Input value={slackChannel} onChange={(event) => setSlackChannel(event.target.value)} placeholder="knowledge-sharing" maxLength={128} className="bg-black/30" /></label>
                <WriteConfirmation checked={writeConfirmed} onCheckedChange={setWriteConfirmed} service="Slack" />
                <Button type="button" disabled={!writeConfirmed || !slackChannel.trim() || Boolean(busy)} onClick={() => void publishSlackDigest()}>{busy === "slack-publish" ? <LoaderCircle className="animate-spin" /> : <Send />} Publish digest</Button>
              </section>
            ) : null}
            {definition.slug === "linkedin" ? (
              <section className="grid gap-4 rounded-xl border border-[#0a66c2]/30 bg-[#0a66c2]/8 p-4">
                <div>
                  <h3 className="text-sm font-medium text-white/90">LinkedIn professional toolkit</h3>
                  <p className="mt-1 text-xs leading-5 text-white/48">Turn your connected profile into something you can actively improve and use.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="outline" className="border-white/10 bg-black/25" disabled={Boolean(busy)} onClick={() => void saveLinkedInProfile()}>
                    {busy === "profile" ? <LoaderCircle className="animate-spin" /> : <FileDown />}
                    Save profile snapshot
                  </Button>
                  <Button type="button" className="bg-[#0a66c2] text-white hover:bg-[#0a66c2]/85" disabled={Boolean(busy)} onClick={() => void saveLinkedInProfile(true)}>
                    {busy === "career" ? <LoaderCircle className="animate-spin" /> : <FileDown />}
                    Build career workspace
                  </Button>
                </div>
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
                {definition.slug === "linkedin" ? (
                  <Button type="button" variant="outline" className="h-11 border-[#0a66c2]/35 bg-[#0a66c2]/8 sm:min-w-44" disabled={!canSubmit} onClick={() => void submit(true)}>
                    {busy === "submit" ? <LoaderCircle className="animate-spin" /> : <FileDown />}
                    Build insight workspace
                  </Button>
                ) : null}
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
                      {(["gmail", "googledrive", "notion", "slack"] as string[]).includes(definition.slug) ? (
                        <Button type="button" variant="outline" size="sm" className="flex-1 border-primary/20 bg-primary/5" disabled={Boolean(busy)} onClick={() => void importItem(item, definition.slug === "gmail" ? "gmail-import-message" : workflow.importAction, true)}>
                          {busy === `${item.id}:${definition.slug === "gmail" ? "gmail-import-message" : workflow.importAction}:workspace` ? <LoaderCircle className="animate-spin" /> : <DatabaseBackup />}
                          Build working brief
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

function WriteConfirmation({ checked, onCheckedChange, service }: { checked: boolean; onCheckedChange: (checked: boolean) => void; service: string }) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/5 p-3 text-[11px] leading-4 text-amber-50/70">
      <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      I confirm ChatSaver may write this content to my connected {service} account. No delete action is enabled.
    </label>
  );
}

function buildKnowledgeWorkspace(toolkit: string, content: string): string {
  const section = toolkit === "slack"
    ? "## Decision log\n\n### Decision\n\n\n\n### Owners and deadlines\n\n- [ ] \n\n### Open questions\n\n- "
    : toolkit === "gmail"
      ? "## Action brief\n\n### Required response\n\n\n\n### Commitments and dates\n\n- [ ] \n\n### Reply draft\n\n"
      : "## Working brief\n\n### Executive summary\n\n\n\n### Key evidence\n\n- \n- \n\n### Decisions and next actions\n\n- [ ] \n- [ ] ";
  return `${content}\n\n---\n\n${section}`;
}
