"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Link2,
  LoaderCircle,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import type { NormalizedConversation } from "@/domain/models";
import { persistImportedConversations } from "@/lib/db/database";
import { platformFetch } from "@/lib/platform-fetch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ImportDialogProps {
  onClose: () => void;
  onImported: (noteId?: string) => void;
}

interface LinkImportResponse {
  conversation?: NormalizedConversation;
  error?: string;
}

function questionAnswerCount(conversation: NormalizedConversation): number {
  let pendingQuestion = false;
  let count = 0;

  for (const message of conversation.messages) {
    if (message.role === "user") pendingQuestion = true;
    if (message.role === "assistant" && pendingQuestion) {
      count += 1;
      pendingQuestion = false;
    }
  }

  return count;
}

export function ImportDialog({ onClose, onImported }: ImportDialogProps) {
  const [shareUrl, setShareUrl] = useState("");
  const [conversation, setConversation] = useState<NormalizedConversation>();
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const qaCount = useMemo(
    () => (conversation ? questionAnswerCount(conversation) : 0),
    [conversation],
  );

  async function readSharedChat() {
    setIsReading(true);
    setError(undefined);

    try {
      const response = await platformFetch("/api/imports/chatgpt-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: shareUrl.trim() }),
      });
      const payload = (await response.json()) as LinkImportResponse;

      if (!response.ok || !payload.conversation) {
        throw new Error(payload.error ?? "The shared chat could not be read.");
      }
      if (questionAnswerCount(payload.conversation) === 0) {
        throw new Error("This shared chat does not contain a complete question and answer yet.");
      }

      setConversation(payload.conversation);
    } catch (caught) {
      setConversation(undefined);
      setError(caught instanceof Error ? caught.message : "The shared chat could not be read.");
    } finally {
      setIsReading(false);
    }
  }

  async function saveConversation() {
    if (!conversation) return;
    setIsSaving(true);
    setError(undefined);

    try {
      const result = await persistImportedConversations(
        shareUrl.trim(),
        [conversation],
        "chatgpt-share-link",
      );
      if (!result.firstNoteId && result.skipped) {
        throw new Error("This shared chat is already in your library.");
      }
      onImported(result.firstNoteId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The shared chat could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden border-white/10 bg-card/95 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-xl">
        <DialogHeader className="border-b border-white/8 px-5 py-5 text-left sm:px-6">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary-foreground">
              Shared link
            </Badge>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              One chat at a time
            </span>
          </div>
          <DialogTitle className="text-2xl tracking-[-0.035em]">
            Turn a shared chat into a note.
          </DialogTitle>
          <DialogDescription className="leading-6">
            In ChatGPT, open the chat, choose Share, copy its public link, and paste it here.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-5 sm:px-6">
          {!conversation ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!isReading && shareUrl.trim()) void readSharedChat();
              }}
            >
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted-foreground">
                  ChatGPT shared link
                </span>
                <span className="relative block">
                  <Link2 className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    className="h-12 border-white/10 bg-black/20 ps-10 pe-3"
                    inputMode="url"
                    placeholder="https://chatgpt.com/share/..."
                    type="url"
                    value={shareUrl}
                    onChange={(event) => {
                      setShareUrl(event.target.value);
                      setError(undefined);
                    }}
                  />
                </span>
              </label>

              <Button
                type="submit"
                className="royal-glow h-11 w-full"
                disabled={isReading || !shareUrl.trim()}
              >
                {isReading ? <LoaderCircle className="animate-spin" /> : <ExternalLink />}
                {isReading ? "Reading shared chat…" : "Read shared chat"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-primary/20 bg-primary/7 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/14 text-primary">
                    <MessagesSquare className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{conversation.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {conversation.messages.length} messages · {qaCount} question{qaCount === 1 ? "" : "s"} and answer{qaCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-300" />
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setConversation(undefined);
                  setError(undefined);
                }}
              >
                <ArrowLeft />
                Use another link
              </Button>
            </div>
          )}

          {error ? (
            <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm leading-5 text-destructive">
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            The public link is read once. After import, the editable note is stored in your local vault.
          </div>
        </div>

        <DialogFooter className="border-t border-white/8 bg-black/15 px-5 py-4 sm:justify-between sm:px-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {conversation ? (
            <Button
              className="royal-glow"
              disabled={isSaving}
              onClick={() => void saveConversation()}
            >
              {isSaving ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
              {isSaving ? "Saving note…" : "Save as editable note"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
