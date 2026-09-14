"use client";

import { useRef } from "react";
import { Check, ListChecks, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { NoteBlock } from "@/domain/models";
import { useNoteDraft } from "@/hooks/use-note-draft";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type Item = { text: string; done: boolean };

function decode(content: string): Item[] {
  return content.split("\n").map((line) => {
    const match = /^- \[([ xX])\] ?(.*)$/.exec(line);
    return match ? { done: match[1].toLowerCase() === "x", text: match[2] } : { done: false, text: line };
  });
}

export function ChecklistNoteEditor({ block }: { block: NoteBlock }) {
  const { value, save, saveState, flush } = useNoteDraft(block.id, block.noteId, { question: "", answer: block.answer });
  const items = decode(value.answer);
  const latestItems = useRef(items);
  latestItems.current = items;
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const completed = items.filter((item) => item.done).length;

  function update(next: Item[]) {
    latestItems.current = next;
    save({ question: "", answer: next.map((item) => `- [${item.done ? "x" : " "}] ${item.text}`).join("\n") });
  }

  function focus(index: number) {
    requestAnimationFrame(() => inputs.current.get(index)?.focus());
  }

  function insert(index: number) {
    const next = [...latestItems.current];
    next.splice(index, 0, { text: "", done: false });
    update(next);
    focus(index);
  }

  function remove(index: number) {
    const removed = latestItems.current[index];
    update(latestItems.current.filter((_, position) => position !== index));
    toast("Item removed", { action: { label: "Undo", onClick: () => {
      const next = [...latestItems.current];
      next.splice(Math.min(index, next.length), 0, removed);
      update(next);
    } } });
  }

  function row(item: Item, index: number) {
    return (
      <div key={index} className="group flex min-h-12 items-center gap-3 border-b border-white/5 py-1.5">
        <Checkbox
          checked={item.done}
          aria-label={`${item.done ? "Restore" : "Complete"} ${item.text || "item"}`}
          onCheckedChange={(checked) => update(items.map((entry, position) => position === index ? { ...entry, done: checked === true } : entry))}
        />
        <Input
          ref={(input) => { if (input) inputs.current.set(index, input); else inputs.current.delete(index); }}
          value={item.text}
          aria-label={`Checklist item ${index + 1}`}
          placeholder="List item…"
          className={`h-10 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 ${item.done ? "text-muted-foreground line-through" : ""}`}
          onChange={(event) => update(items.map((entry, position) => position === index ? { ...entry, text: event.target.value } : entry))}
          onBlur={flush}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              insert(index + 1);
            }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text/plain");
            if (!text.includes("\n")) return;
            event.preventDefault();
            const input = event.currentTarget;
            const lines = `${item.text.slice(0, input.selectionStart ?? 0)}${text}${item.text.slice(input.selectionEnd ?? item.text.length)}`.replace(/\r\n/g, "\n").split("\n");
            const next = [...items];
            next.splice(index, 1, ...lines.map((text) => ({ text, done: false })));
            update(next);
            focus(index + lines.length - 1);
          }}
        />
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" aria-label={`Remove ${item.text || "item"}`} onClick={() => remove(index)}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <section aria-label="Keep-style checklist" className="mx-auto min-h-[62dvh] max-w-3xl py-2 sm:px-4">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><ListChecks className="size-4 text-primary" />{completed} of {items.length} complete</span>
        <span role="status" className={saveState === "error" ? "text-destructive" : ""}>
          {saveState === "saved" ? "Saved on device" : saveState === "saving" ? "Saving…" : "Retrying save"}
        </span>
      </div>
      <div>{items.map((item, index) => item.done ? null : row(item, index))}</div>
      <Button variant="ghost" className="mt-3 gap-3 px-0 text-muted-foreground" onClick={() => insert(items.length)}><Plus className="size-4" /> Add item</Button>
      {completed > 0 ? (
        <details className="mt-7 border-t border-white/8 pt-4">
          <summary className="cursor-pointer text-sm text-muted-foreground"><Check className="me-2 inline size-4" />{completed} completed {completed === 1 ? "item" : "items"}</summary>
          <div className="mt-3">{items.map((item, index) => item.done ? row(item, index) : null)}</div>
        </details>
      ) : null}
      <p className="mt-6 text-xs text-muted-foreground/70">Press Enter for a new item. Paste multiple lines to make a list.</p>
    </section>
  );
}
