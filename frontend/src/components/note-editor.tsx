"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUpRight,
  Archive,
  Bold,
  Check,
  Clock3,
  CloudOff,
  Code2,
  Copy,
  Download,
  Eye,
  FileDown,
  FileText,
  Folder,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  LoaderCircle,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Quote,
  SlidersHorizontal,
  Sparkles,
  Star,
  Strikethrough,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Note, NoteBlock, NoteCollection } from "@/domain/models";
import {
  addNoteBlock,
  deleteNote,
  deleteNoteBlock,
  toggleArchived,
  toggleFavorite,
  toggleNoteCollection,
  updateNoteBlock,
  updateNoteTitle,
} from "@/lib/db/database";
import {
  downloadNoteMarkdown,
  noteToPlainText,
} from "@/lib/portable";
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
  DropdownMenuCheckboxItem,
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
  collections: NoteCollection[];
  emptyView?: "library" | "history";
  onDeleted: () => void;
  onArchived: () => void;
  onImport: () => void;
  onCreate: () => void;
  focusMode?: boolean;
  onFocusModeChange?: (focusMode: boolean) => void;
}

function NoteTitleEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestTitle = useRef(note.title);
  const queuedTitle = useRef(note.title);

  useEffect(() => {
    if (!isEditing || !document.hasFocus()) {
      setTitle(note.title);
      latestTitle.current = note.title;
      queuedTitle.current = note.title;
    }
  }, [isEditing, note.title]);

  async function persist(nextTitle: string) {
    if (nextTitle === queuedTitle.current) return;
    queuedTitle.current = nextTitle;
    try {
      await updateNoteTitle(note.id, nextTitle);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function flush() {
    clearTimeout(saveTimer.current);
    void persist(latestTitle.current);
  }

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      flush();
    };
  }, [note.id]);

  function save(nextTitle: string, delay = 400) {
    clearTimeout(saveTimer.current);
    latestTitle.current = nextTitle;
    setSaveState("saving");
    saveTimer.current = setTimeout(() => void persist(nextTitle), delay);
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
          latestTitle.current = event.target.value;
          flush();
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

function MarkdownView({ content, empty }: { content: string; empty: string }) {
  const normalized = content.trim();
  if (!normalized) {
    return <p className="py-8 text-sm italic text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="note-prose min-w-0 leading-7 text-foreground/88 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="mb-4 mt-8 text-3xl font-semibold tracking-[-0.04em]" {...props} />,
          h2: (props) => <h2 className="mb-3 mt-7 border-b border-white/8 pb-2 text-2xl font-semibold tracking-[-0.03em]" {...props} />,
          h3: (props) => <h3 className="mb-2 mt-6 text-xl font-semibold" {...props} />,
          h4: (props) => <h4 className="mb-2 mt-5 text-lg font-semibold" {...props} />,
          h5: (props) => <h5 className="mb-2 mt-4 text-base font-semibold" {...props} />,
          h6: (props) => <h6 className="mb-2 mt-4 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground" {...props} />,
          p: (props) => <p className="my-3 whitespace-pre-wrap" {...props} />,
          ul: (props) => <ul className="my-3 list-disc space-y-1.5 ps-6 marker:text-primary" {...props} />,
          ol: (props) => <ol className="my-3 list-decimal space-y-1.5 ps-6 marker:text-primary" {...props} />,
          li: (props) => <li className="ps-1" {...props} />,
          blockquote: (props) => <blockquote className="my-4 border-s-2 border-primary/60 bg-primary/[0.05] px-4 py-2 text-foreground/75" {...props} />,
          strong: (props) => <strong className="font-semibold text-ivory" {...props} />,
          em: (props) => <em className="rounded bg-primary/10 px-0.5 text-ivory" {...props} />,
          a: (props) => <a className="text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary" target="_blank" rel="noreferrer" {...props} />,
          hr: (props) => <hr className="my-7 border-white/10" {...props} />,
          pre: (props) => <pre className="my-4 overflow-x-auto rounded-xl border border-white/8 bg-black/45 p-4 font-mono text-[13px] leading-6 text-ivory/85" {...props} />,
          code: ({ className, ...props }) => className
            ? <code className={className} {...props} />
            : <code className="rounded-md border border-white/8 bg-black/35 px-1.5 py-0.5 font-mono text-[0.88em] text-primary-foreground" {...props} />,
          table: (props) => <div className="my-5 overflow-x-auto"><table className="w-full border-collapse text-sm" {...props} /></div>,
          th: (props) => <th className="border border-white/10 bg-white/[0.05] px-3 py-2 text-left font-semibold" {...props} />,
          td: (props) => <td className="border border-white/10 px-3 py-2 align-top" {...props} />,
          input: (props) => <input className="me-2 accent-primary" disabled {...props} />,
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

function CollapsibleMarkdown({ content, empty }: { content: string; empty: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 900 || content.split("\n").length > 16;

  return (
    <div>
      <div className={`relative ${isLong && !expanded ? "max-h-80 overflow-hidden" : ""}`}>
        <MarkdownView content={content} empty={empty} />
        {isLong && !expanded ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card via-card/90 to-transparent" aria-hidden="true" />
        ) : null}
      </div>
      {isLong ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3 h-8 px-2 text-xs text-primary"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Read more"}
        </Button>
      ) : null}
    </div>
  );
}

function PlainNoteEditor({
  block,
  view,
}: {
  block: NoteBlock;
  view: "write" | "preview";
}) {
  const [content, setContent] = useState(block.answer);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const latestContent = useRef(block.answer);
  const queuedContent = useRef(block.answer);

  useEffect(() => {
    if (document.activeElement !== textareaRef.current) {
      setContent(block.answer);
      latestContent.current = block.answer;
      queuedContent.current = block.answer;
    }
  }, [block.answer]);

  async function persist(nextContent: string) {
    if (nextContent === queuedContent.current) return;
    queuedContent.current = nextContent;
    try {
      await updateNoteBlock(block.id, { question: "", answer: nextContent });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function flush() {
    clearTimeout(saveTimer.current);
    void persist(latestContent.current);
  }

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      flush();
    };
  }, [block.id]);

  function save(nextContent: string, delay = 450) {
    clearTimeout(saveTimer.current);
    latestContent.current = nextContent;
    setSaveState("saving");
    saveTimer.current = setTimeout(() => void persist(nextContent), delay);
  }

  function replaceSelection(before: string, after = "", placeholder = "text") {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const nextContent = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`;
    setContent(nextContent);
    save(nextContent);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function prefixLines(prefix: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lineEndIndex = content.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
    const selection = content.slice(lineStart, lineEnd) || "Item";
    const replacement = selection.split("\n").map((line) => `${prefix}${line}`).join("\n");
    const nextContent = `${content.slice(0, lineStart)}${replacement}${content.slice(lineEnd)}`;
    setContent(nextContent);
    save(nextContent);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart + prefix.length, lineStart + replacement.length);
    });
  }

  function insertText(text: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const nextContent = `${content.slice(0, start)}${text}${content.slice(textarea.selectionEnd)}`;
    setContent(nextContent);
    save(nextContent);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    });
  }

  const tools = [
    { label: "Heading 1", icon: Heading1, action: () => prefixLines("# ") },
    { label: "Heading 2", icon: Heading2, action: () => prefixLines("## ") },
    { label: "Heading 3", icon: Heading3, action: () => prefixLines("### ") },
    { label: "Bold", icon: Bold, action: () => replaceSelection("**", "**") },
    { label: "Emphasis", icon: Italic, action: () => replaceSelection("*", "*") },
    { label: "Strikethrough", icon: Strikethrough, action: () => replaceSelection("~~", "~~") },
    { label: "Bullet list", icon: List, action: () => prefixLines("- ") },
    { label: "Numbered list", icon: ListOrdered, action: () => prefixLines("1. ") },
    { label: "Task list", icon: ListChecks, action: () => prefixLines("- [ ] ") },
    { label: "Quote", icon: Quote, action: () => prefixLines("> ") },
    { label: "Inline code", icon: Code2, action: () => replaceSelection("`", "`", "code") },
    { label: "Code block", icon: Code2, action: () => replaceSelection("```\n", "\n```", "code") },
    { label: "Link", icon: Link2, action: () => replaceSelection("[", "](https://)", "link text") },
    { label: "Horizontal rule", icon: Minus, action: () => insertText("\n\n---\n\n") },
  ];

  return (
    <Card className="overflow-hidden border-white/8 bg-card/38 py-0 shadow-none backdrop-blur-sm">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/7 bg-black/15 px-3 py-2.5 sm:px-4">
          {view === "write" ? (
            <>
              <div className="me-auto flex flex-wrap items-center gap-1">
                {tools.map(({ label, icon: Icon, action }) => (
                  <Button key={label} type="button" variant="ghost" size="icon-sm" title={label} aria-label={label} onClick={action}>
                    <Icon />
                  </Button>
                ))}
              </div>
              <span className={`me-1 hidden items-center gap-1 font-mono text-[8px] uppercase tracking-wide sm:flex ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">
                {saveState === "saving" ? <LoaderCircle className="size-3 animate-spin" /> : <Check className="size-3" />}
                {saveState}
              </span>
            </>
          ) : (
            <span className="flex items-center gap-2 text-xs text-muted-foreground"><Eye className="size-3.5" /> Reading view</span>
          )}
        </div>
        {view === "write" ? (
          <Textarea
            ref={textareaRef}
            className="min-h-[62dvh] resize-none rounded-none border-0 bg-black/10 px-5 py-5 font-mono leading-7 shadow-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/30 sm:px-8 sm:py-8"
            aria-label="Markdown note content"
            placeholder={"Write naturally with Markdown…\n\n## A heading\n- A useful point\n- Another point\n\n```\ncode belongs here\n```"}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              save(event.target.value);
            }}
            onBlur={flush}
          />
        ) : (
          <article className="min-h-[62dvh] bg-black/8 px-5 py-7 sm:px-10 sm:py-10" aria-label="Reading view">
            <MarkdownView content={content} empty="Nothing written yet. Switch to Write to begin." />
          </article>
        )}
      </CardContent>
    </Card>
  );
}

function QaBlockEditor({
  block,
  index,
  canDelete,
  view,
}: {
  block: NoteBlock;
  index: number;
  canDelete: boolean;
  view: "edit" | "preview";
}) {
  const [question, setQuestion] = useState(block.question);
  const [answer, setAnswer] = useState(block.answer);
  const [isEditing, setIsEditing] = useState(false);
  const [questionExpanded, setQuestionExpanded] = useState(false);
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestValues = useRef({ question: block.question, answer: block.answer });
  const queuedValues = useRef(`${block.question}\u0000${block.answer}`);
  const questionId = `question-${block.id}`;
  const answerId = `answer-${block.id}`;

  useEffect(() => {
    if (!isEditing || !document.hasFocus()) {
      setQuestion(block.question);
      setAnswer(block.answer);
      latestValues.current = { question: block.question, answer: block.answer };
      queuedValues.current = `${block.question}\u0000${block.answer}`;
    }
  }, [block.answer, block.question, isEditing]);

  async function persist(nextQuestion: string, nextAnswer: string) {
    const signature = `${nextQuestion}\u0000${nextAnswer}`;
    if (signature === queuedValues.current) return;
    queuedValues.current = signature;
    try {
      await updateNoteBlock(block.id, { question: nextQuestion, answer: nextAnswer });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function flush() {
    clearTimeout(saveTimer.current);
    const latest = latestValues.current;
    void persist(latest.question, latest.answer);
  }

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      flush();
    };
  }, [block.id]);

  function save(nextQuestion: string, nextAnswer: string, delay = 500) {
    clearTimeout(saveTimer.current);
    latestValues.current = { question: nextQuestion, answer: nextAnswer };
    setSaveState("saving");
    saveTimer.current = setTimeout(() => void persist(nextQuestion, nextAnswer), delay);
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
          {view === "edit" ? <GripVertical className="size-4 text-muted-foreground/50" aria-hidden="true" /> : null}
          {view === "edit" ? (
            <span
              className={`hidden items-center gap-1 font-mono text-[8px] uppercase tracking-wide sm:flex ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`}
              aria-live="polite"
            >
              {saveState === "saving" ? <LoaderCircle className="size-3 animate-spin" /> : <Check className="size-3" />}
              {saveState}
            </span>
          ) : null}
          {canDelete && view === "edit" ? (
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

        {view === "preview" ? (
          <div className="grid gap-0 lg:grid-cols-2">
            <section className="border-b border-white/6 p-5 lg:border-e lg:border-b-0 sm:p-6">
              <p className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                <span className="size-1.5 rounded-full bg-primary" />Question
              </p>
              <CollapsibleMarkdown content={question} empty="No question yet." />
            </section>
            <section className="p-5 sm:p-6">
              <p className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ivory/70">
                <span className="size-1.5 rounded-full bg-ivory/70" />Answer
              </p>
              <CollapsibleMarkdown content={answer} empty="No answer yet." />
            </section>
          </div>
        ) : (
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
                flush();
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
                flush();
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
        )}
      </CardContent>
    </Card>
  );
}

const IMPORTED_BLOCK_BATCH = 5;

function QaBlocksList({
  blocks,
  lazy,
  view,
}: {
  blocks: NoteBlock[];
  lazy: boolean;
  view: "edit" | "preview";
}) {
  const [visibleCount, setVisibleCount] = useState(IMPORTED_BLOCK_BATCH);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const renderedBlocks = lazy ? blocks.slice(0, visibleCount) : blocks;
  const hasMore = lazy && visibleCount < blocks.length;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisibleCount((current) => Math.min(current + IMPORTED_BLOCK_BATCH, blocks.length));
      },
      { rootMargin: "120px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [blocks.length, hasMore]);

  return (
    <>
      <div className="space-y-4">
        {renderedBlocks.map((block, index) => (
          <QaBlockEditor
            block={block}
            index={index}
            canDelete={blocks.length > 1}
            view={view}
            key={block.id}
          />
        ))}
      </div>
      {hasMore ? (
        <div ref={loadMoreRef} className="mt-4 flex min-h-14 items-center justify-center rounded-xl border border-dashed border-white/8 text-xs text-muted-foreground" aria-live="polite">
          <LoaderCircle className="me-2 size-3.5 animate-spin text-primary" />
          Loading more when you reach the end · {renderedBlocks.length} of {blocks.length}
        </div>
      ) : lazy && blocks.length > IMPORTED_BLOCK_BATCH ? (
        <p className="mt-4 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          All {blocks.length} Q&amp;A blocks loaded
        </p>
      ) : null}
    </>
  );
}

function EmptyEditor({
  onImport,
  onCreate,
}: {
  onImport: () => void;
  onCreate: () => void;
}) {
  return (
    <main className="editor-hero relative grid min-h-0 flex-1 place-items-center overflow-hidden p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl border border-white/8 bg-white/[0.035] text-primary">
          <FileText className="size-5" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-[-0.035em]">Open a note from the sidebar</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your last file, folder, sidebar state, and every edit are kept locally for the next launch.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={onCreate}><Plus /> New note</Button>
          <Button variant="outline" onClick={onImport}><Download /> Import chats</Button>
        </div>
      </div>
    </main>
  );
}

export function NoteEditor({
  note,
  blocks,
  collections,
  emptyView = "library",
  onDeleted,
  onArchived,
  onImport,
  onCreate,
  focusMode = false,
  onFocusModeChange,
}: NoteEditorProps) {
  const [viewMode, setViewMode] = useState<"read" | "edit">("read");
  const [readerWidth, setReaderWidth] = useState<"focused" | "comfortable" | "wide">("comfortable");
  const [fontSize, setFontSize] = useState(16);
  const initializedNote = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!note || blocks.length === 0 || initializedNote.current === note.id) return;
    initializedNote.current = note.id;
    const hasContent = blocks.some((block) => block.question.trim() || block.answer.trim());
    setViewMode(hasContent ? "read" : "edit");
  }, [blocks, note]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setViewMode((current) => current === "read" ? "edit" : "read");
      }
      if (event.key === "Escape" && focusMode) onFocusModeChange?.(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusMode, onFocusModeChange]);

  if (!note) {
    return <EmptyEditor onImport={onImport} onCreate={onCreate} />;
  }
  const activeNote = note;
  const markdownBlock = note.source === "markdown" ? blocks[0] : undefined;
  const documentWidth = readerWidth === "focused" ? "max-w-3xl" : readerWidth === "wide" ? "max-w-[92rem]" : "max-w-6xl";

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
    <main className="editor-scrollbar note-document min-h-0 flex-1 overflow-y-auto bg-black/10" style={{ "--note-font-size": `${fontSize}px` } as CSSProperties}>
      <div className={`mx-auto w-full ${documentWidth} px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-8`}>
        <header className="mb-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/25 bg-primary/8 text-primary-foreground">
                  {markdownBlock ? <FileText className="size-3" /> : <MessageSquareText className="size-3" />}
                  {markdownBlock ? "Markdown note" : "Q&A note"}
                </Badge>
                {!markdownBlock ? (
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                    {note.blockCount} blocks
                  </Badge>
                ) : null}
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

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="me-1 flex rounded-lg border border-white/8 bg-black/20 p-0.5" aria-label="Note mode">
                <Button type="button" variant={viewMode === "read" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("read")}><Eye /> Read</Button>
                <Button type="button" variant={viewMode === "edit" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("edit")}><Pencil /> Edit</Button>
              </div>

              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon-lg" aria-label="Reading appearance"><SlidersHorizontal /></Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Reading appearance</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Page width</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setReaderWidth("focused")}><Check className={readerWidth === "focused" ? "opacity-100" : "opacity-0"} /> Focused</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setReaderWidth("comfortable")}><Check className={readerWidth === "comfortable" ? "opacity-100" : "opacity-0"} /> Comfortable</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setReaderWidth("wide")}><Check className={readerWidth === "wide" ? "opacity-100" : "opacity-0"} /> Wide</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Text size · {fontSize}px</DropdownMenuLabel>
                  <DropdownMenuItem disabled={fontSize <= 13} onSelect={() => setFontSize((size) => Math.max(13, size - 1))}><Minus /> Smaller</DropdownMenuItem>
                  <DropdownMenuItem disabled={fontSize >= 22} onSelect={() => setFontSize((size) => Math.min(22, size + 1))}><Plus /> Larger</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {onFocusModeChange ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon-lg" aria-label={focusMode ? "Exit focus mode" : "Open focus mode"} onClick={() => onFocusModeChange(!focusMode)}>
                      {focusMode ? <Minimize2 /> : <Maximize2 />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{focusMode ? "Exit focus mode · Esc" : "Focus mode"}</TooltipContent>
                </Tooltip>
              ) : null}

              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant={(note.collectionIds?.length ?? 0) > 0 ? "secondary" : "outline"}
                        size="icon-lg"
                        aria-label="Add note to collections"
                      >
                        <Folder />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Collections</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>Organize in collections</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {collections.map((collection) => (
                    <DropdownMenuCheckboxItem
                      key={collection.id}
                      checked={(note.collectionIds ?? []).includes(collection.id)}
                      onCheckedChange={() => void toggleNoteCollection(note.id, collection.id)}
                    >
                      <Folder />
                      <span className="truncate">{collection.name}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  {collections.length === 0 ? (
                    <DropdownMenuItem disabled>
                      Create a collection from the library sidebar
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>

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

        {markdownBlock ? (
          <PlainNoteEditor
            block={markdownBlock}
            view={viewMode === "read" ? "preview" : "write"}
            key={markdownBlock.id}
          />
        ) : (
          <>
            <QaBlocksList
              blocks={blocks}
              lazy={note.source === "chatgpt"}
              view={viewMode === "read" ? "preview" : "edit"}
              key={note.id}
            />

            {viewMode === "edit" ? (
              <Button
                variant="outline"
                className="mt-5 h-11 w-full border-dashed border-primary/25 bg-primary/[0.035] text-muted-foreground hover:border-primary/50 hover:bg-primary/8 hover:text-foreground"
                onClick={() => void addNoteBlock(note.id)}
              >
                <Plus />
                Add another Q&amp;A block
              </Button>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
