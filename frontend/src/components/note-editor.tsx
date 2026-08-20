"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Archive,
  Check,
  Clock3,
  CloudOff,
  Copy,
  Download,
  FileDown,
  GripVertical,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Note, NoteBlock } from "@/domain/models";
import {
  addNoteBlock,
  deleteNote,
  deleteNoteBlock,
  toggleArchived,
  toggleFavorite,
  updateNoteBlock,
  updateNoteTitle,
} from "@/lib/db/database";
import {
  downloadNoteMarkdown,
  noteToPlainText,
} from "@/lib/portable";
import { toPlainText } from "@/lib/plain-text";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NoteEditorProps {
  note?: Note;
  blocks: NoteBlock[];
  emptyView?: "library" | "history";
  onDeleted: () => void;
  onArchived: () => void;
  onImport: () => void;
  onCreate: () => void;
}

function NoteTitleEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!isEditing || !document.hasFocus()) setTitle(note.title);
  }, [isEditing, note.title]);

  function save(nextTitle: string, delay = 400) {
    clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await updateNoteTitle(note.id, nextTitle);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, delay);
  }

  return (
    <div>
      <Input
        className="h-auto min-w-0 border-0 bg-transparent px-0 py-1 text-3xl font-semibold tracking-[-0.045em] shadow-none focus-visible:ring-0 sm:text-4xl"
        aria-label="Note title"
        value={title}
        onFocus={() => setIsEditing(true)}
        onChange={(event) => {
          setTitle(event.target.value);
          save(event.target.value);
        }}
        onBlur={(event) => {
          setIsEditing(false);
          save(event.target.value, 0);
        }}
      />
      <span
        className={`mt-1 inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] ${
          saveState === "error" ? "text-destructive" : "text-muted-foreground"
        }`}
        aria-live="polite"
      >
        {saveState === "saving" ? (
          <LoaderCircle className="size-3 animate-spin" />
        ) : (
          <Check className="size-3" />
        )}
        {saveState === "saving"
          ? "Saving title"
          : saveState === "error"
            ? "Save failed"
            : "Title saved"}
      </span>
    </div>
  );
}

function QaBlockEditor({
  block,
  index,
  canDelete,
}: {
  block: NoteBlock;
  index: number;
  canDelete: boolean;
}) {
  const [question, setQuestion] = useState(block.question);
  const [answer, setAnswer] = useState(() => toPlainText(block.answer));
  const [isEditing, setIsEditing] = useState(false);
  const [questionExpanded, setQuestionExpanded] = useState(false);
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const questionId = `question-${block.id}`;
  const answerId = `answer-${block.id}`;

  useEffect(() => {
    if (!isEditing || !document.hasFocus()) {
      setQuestion(block.question);
      setAnswer(toPlainText(block.answer));
    }
  }, [block.answer, block.question, isEditing]);

  function save(nextQuestion: string, nextAnswer: string, delay = 500) {
    clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      if (nextQuestion !== block.question || nextAnswer !== block.answer) {
        try {
          await updateNoteBlock(block.id, {
            question: nextQuestion,
            answer: nextAnswer,
          });
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      } else {
        setSaveState("saved");
      }
    }, delay);
  }

  return (
    <Card className="group overflow-hidden border-white/8 bg-card/72 py-0 shadow-xl shadow-black/10 backdrop-blur-xl transition-colors hover:border-primary/25">
      <CardContent className="p-0">
        <div className="flex items-center gap-3 border-b border-white/6 bg-black/15 px-4 py-3">
          <span className="grid size-8 place-items-center rounded-lg bg-primary font-mono text-[11px] font-semibold text-primary-foreground shadow-lg shadow-primary/15">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Question and answer</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Knowledge block
            </p>
          </div>
          <GripVertical className="size-4 text-muted-foreground/50" aria-hidden="true" />
          <span
            className={`hidden items-center gap-1 font-mono text-[8px] uppercase tracking-wide sm:flex ${
              saveState === "error" ? "text-destructive" : "text-muted-foreground"
            }`}
            aria-live="polite"
          >
            {saveState === "saving" ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            {saveState}
          </span>
          {canDelete ? (
            <AlertDialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100"
                      aria-label={`Delete block ${index + 1}`}
                    >
                      <Trash2 />
                    </Button>
                  </AlertDialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Delete block</TooltipContent>
              </Tooltip>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this Q&amp;A block?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the edited question and answer from the local note.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep block</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/85"
                    onClick={() => void deleteNoteBlock(block.id)}
                  >
                    Delete block
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>

        <div className="grid gap-0 lg:grid-cols-2">
          <div className="border-b border-white/6 p-4 lg:border-e lg:border-b-0 sm:p-5">
            <label htmlFor={questionId} className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              Question
            </label>
            <Textarea
              id={questionId}
              className={`${questionExpanded ? "h-80 resize-y overflow-auto" : "h-36 resize-none overflow-hidden"} field-sizing-fixed border-0 bg-black/20 leading-6 shadow-inner shadow-black/10 focus-visible:ring-primary/35`}
              placeholder="What do you want to remember?"
              value={question}
              onFocus={() => setIsEditing(true)}
              onChange={(event) => {
                setQuestion(event.target.value);
                save(event.target.value, answer);
              }}
              onBlur={() => {
                setIsEditing(false);
                save(question, answer, 0);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 px-2 text-xs text-primary"
              aria-controls={questionId}
              aria-expanded={questionExpanded}
              onClick={() => setQuestionExpanded((expanded) => !expanded)}
            >
              {questionExpanded ? "Show less" : "Read more"}
            </Button>
          </div>

          <div className="p-4 sm:p-5">
            <label htmlFor={answerId} className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ivory/70">
              <span className="size-1.5 rounded-full bg-ivory/70" />
              Answer
            </label>
            <Textarea
              id={answerId}
              className={`${answerExpanded ? "h-80 resize-y overflow-auto" : "h-36 resize-none overflow-hidden"} field-sizing-fixed border-0 bg-black/20 leading-6 shadow-inner shadow-black/10 focus-visible:ring-primary/35`}
              placeholder="Write the answer in your own words…"
              value={answer}
              onFocus={() => setIsEditing(true)}
              onChange={(event) => {
                setAnswer(event.target.value);
                save(question, event.target.value);
              }}
              onBlur={() => {
                setIsEditing(false);
                save(question, answer, 0);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 px-2 text-xs text-ivory/70"
              aria-controls={answerId}
              aria-expanded={answerExpanded}
              onClick={() => setAnswerExpanded((expanded) => !expanded)}
            >
              {answerExpanded ? "Show less" : "Read more"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyEditor({
  historyView,
  onImport,
  onCreate,
}: {
  historyView: boolean;
  onImport: () => void;
  onCreate: () => void;
}) {
  return (
    <main className="editor-hero relative flex min-h-0 flex-1 items-start overflow-x-hidden overflow-y-auto p-4 sm:p-8 lg:items-center lg:p-12">
      <div className="relative z-10 mx-auto w-full max-w-5xl">
        <div className="mb-7 flex items-center gap-3">
          <Badge className="royal-glow rounded-full px-3 py-1">
            <Sparkles className="size-3" />
            {historyView ? "Synced history" : "Offline knowledge studio"}
          </Badge>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Private by design
          </span>
        </div>

        <h1 className="text-balance max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.065em] sm:text-6xl lg:text-8xl">
          {historyView ? "Your conversations, " : "Give your best chats a "}
          <span className="bg-gradient-to-r from-crimson-bright via-ivory to-primary bg-clip-text text-transparent">
            {historyView ? "ready when you are." : "second life."}
          </span>
        </h1>
        <p className="mt-7 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          {historyView
            ? "Your synced and imported chats will appear here. Import a new conversation to start building your history."
            : "Turn scattered AI conversations into a private, searchable library of questions, answers, and ideas that stays useful without a network connection."}
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" className="royal-glow h-11 px-5" onClick={onImport}>
            Import ChatGPT history
            <ArrowUpRight />
          </Button>
          <Button size="lg" variant="outline" className="h-11 px-5" onClick={onCreate}>
            <Plus />
            Start a blank note
          </Button>
        </div>

        <div className="mt-14 grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: CloudOff,
              title: "Works offline",
              description: "Your library opens and edits without the backend.",
            },
            {
              icon: MessageSquareText,
              title: "Q&A by default",
              description: "Useful exchanges become clean, editable knowledge.",
            },
            {
              icon: FileDown,
              title: "Portable ownership",
              description: "Exports and backups stay under your control.",
            },
          ].map((feature) => (
            <Card
              className="border-white/8 bg-card/55 shadow-lg shadow-black/10 backdrop-blur-xl"
              key={feature.title}
            >
              <CardContent className="p-5">
                <feature.icon className="mb-4 size-5 text-primary" />
                <p className="text-sm font-medium">{feature.title}</p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}

export function NoteEditor({
  note,
  blocks,
  emptyView = "library",
  onDeleted,
  onArchived,
  onImport,
  onCreate,
}: NoteEditorProps) {
  if (!note) {
    return <EmptyEditor historyView={emptyView === "history"} onImport={onImport} onCreate={onCreate} />;
  }
  const activeNote = note;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(noteToPlainText(activeNote, blocks));
      toast.success("Plain text copied");
    } catch {
      toast.error("Clipboard access was not available.");
    }
  }

  async function archive() {
    const archived = await toggleArchived(activeNote.id);
    if (archived === undefined) return;
    toast.success(archived ? "Note archived" : "Note returned to the library");
    onArchived();
  }

  return (
    <main className="editor-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
        <header className="mb-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/25 bg-primary/8 text-primary-foreground">
                  <MessageSquareText className="size-3" />
                  Q&amp;A note
                </Badge>
                <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                  {note.blockCount} blocks
                </Badge>
              </div>
              <NoteTitleEditor note={note} key={note.id} />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock3 className="size-3.5" />
                  Edited {new Date(note.updatedAt).toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5 capitalize">
                  <span
                    className={`size-1.5 rounded-full ${
                      note.syncStatus === "synced"
                        ? "bg-emerald-400"
                        : note.syncStatus === "conflict"
                          ? "bg-destructive"
                          : "bg-amber-300"
                    }`}
                  />
                  {note.syncStatus}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={note.isFavorite ? "secondary" : "outline"}
                    size="icon-lg"
                    className={note.isFavorite ? "text-primary" : ""}
                    onClick={() => void toggleFavorite(note.id)}
                    aria-label={note.isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star className={note.isFavorite ? "fill-current" : ""} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {note.isFavorite ? "Remove from favorites" : "Add to favorites"}
                </TooltipContent>
              </Tooltip>

              <Button
                variant="outline"
                className="gap-2"
                aria-label="Download note"
                onClick={() => {
                  downloadNoteMarkdown(activeNote, blocks);
                  toast.success("Markdown file downloaded");
                }}
              >
                <Download />
                <span className="hidden sm:inline">Download</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-lg" aria-label="More note actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Note actions</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => void copyText()}>
                    <Copy />
                    Copy plain text
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void archive()}>
                    <Archive />
                    {note.isArchived ? "Unarchive note" : "Archive note"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="icon-lg" aria-label="Delete note">
                    <Trash2 />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{note.title}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {note.conversationId
                        ? "This permanently deletes the imported chat, all messages, and its Q&A note. Its PostgreSQL copy and other devices are cleared on sync. This cannot be undone."
                        : "This permanently deletes this note locally and from PostgreSQL on sync. This cannot be undone."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep note</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/85"
                      onClick={() => void deleteNote(note.id).then(onDeleted)}
                    >
                      Delete note
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </header>

        <Separator className="mb-7 bg-white/8" />

        <div className="space-y-4">
          {blocks.map((block, index) => (
            <QaBlockEditor
              block={block}
              index={index}
              canDelete={blocks.length > 1}
              key={block.id}
            />
          ))}
        </div>

        <Button
          variant="outline"
          className="mt-5 h-11 w-full border-dashed border-primary/25 bg-primary/[0.035] text-muted-foreground hover:border-primary/50 hover:bg-primary/8 hover:text-foreground"
          onClick={() => void addNoteBlock(note.id)}
        >
          <Plus />
          Add another Q&amp;A block
        </Button>
      </div>
    </main>
  );
}
