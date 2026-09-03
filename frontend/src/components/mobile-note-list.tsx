"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileText, LoaderCircle, Square, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Note } from "@/domain/models";
import { deleteNotes } from "@/lib/db/database";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function MobileNoteList({ notes, activeNoteId, onSelect, onDeleted, onSelectionModeChange }: {
  notes: Note[];
  activeNoteId?: string;
  onSelect: (noteId: string) => void;
  onDeleted: (noteIds: string[]) => void;
  onSelectionModeChange: (selecting: boolean) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const press = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef<string | null>(null);
  const pointerType = useRef("mouse");
  const selectedNotes = notes.filter((note) => selectedIds.has(note.id));
  const allSelected = notes.length > 0 && selectedNotes.length === notes.length;

  useEffect(() => {
    onSelectionModeChange(selecting);
    return () => onSelectionModeChange(false);
  }, [onSelectionModeChange, selecting]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function cancelPress() {
    clearTimeout(timer.current);
    press.current = null;
  }

  function toggle(noteId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  }

  async function removeSelected() {
    if (busy.current || !selectedNotes.length) return;
    busy.current = true;
    setDeleting(true);
    const ids = selectedNotes.map((note) => note.id);
    try {
      await deleteNotes(ids);
      setConfirming(false);
      setSelectedIds(new Set());
      setSelecting(false);
      onDeleted(ids);
      toast.success(`${ids.length} note${ids.length === 1 ? "" : "s"} deleted`);
    } catch {
      toast.error("Notes could not be deleted. Your selection was kept; try again.");
    } finally {
      busy.current = false;
      setDeleting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-white/7 px-3 py-2">
        {selecting ? (
          <>
            <div className="flex items-center justify-between gap-2 pe-11">
              <span className="text-sm font-medium" aria-live="polite">{selectedNotes.length} selected</span>
              <Button variant="ghost" className="h-11" disabled={deleting} onClick={() => { setSelecting(false); setSelectedIds(new Set()); }}>Cancel</Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" className="h-11" disabled={deleting || !notes.length} onClick={() => setSelectedIds(allSelected ? new Set() : new Set(notes.map((note) => note.id)))}>
                {allSelected ? "Clear selection" : "Select this page"}
              </Button>
              <Button variant="destructive" className="h-11" disabled={deleting || !selectedNotes.length} onClick={() => setConfirming(true)}>
                <Trash2 /> Delete ({selectedNotes.length})
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Hold a note to select</span>
            <Button variant="ghost" className="h-11" disabled={!notes.length} onClick={() => setSelecting(true)}>Select</Button>
          </div>
        )}
      </div>
      <ScrollArea className="library-notes-scroll min-h-0 flex-1 overflow-hidden px-2" onScrollCapture={cancelPress}>
        <div className="space-y-1 px-1 py-2">
          {notes.map((note) => {
            const checked = selectedIds.has(note.id);
            const highlighted = selecting ? checked : note.id === activeNoteId;
            return (
              <Button
                key={note.id}
                variant="ghost"
                className={`h-11 w-full select-none justify-start gap-2 px-2.5 text-start text-xs font-normal ${highlighted ? "bg-primary/12 text-foreground hover:bg-primary/16" : "text-muted-foreground"}`}
                style={{ WebkitTouchCallout: "none", touchAction: "pan-y pinch-zoom" }}
                aria-pressed={selecting ? checked : undefined}
                aria-label={selecting ? `${checked ? "Deselect" : "Select"} ${note.title}` : note.title}
                disabled={deleting}
                onPointerDown={(event) => {
                  cancelPress();
                  suppressClick.current = null;
                  pointerType.current = event.pointerType;
                  if (event.pointerType === "mouse" || !event.isPrimary || selecting) return;
                  press.current = { x: event.clientX, y: event.clientY };
                  timer.current = setTimeout(() => {
                    suppressClick.current = note.id;
                    setSelectedIds(new Set([note.id]));
                    setSelecting(true);
                  }, 450);
                }}
                onPointerMove={(event) => {
                  if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 10) cancelPress();
                }}
                onPointerUp={cancelPress}
                onPointerCancel={cancelPress}
                onPointerLeave={cancelPress}
                onContextMenu={(event) => { if (pointerType.current !== "mouse") event.preventDefault(); }}
                onClick={(event) => {
                  if (suppressClick.current === note.id) {
                    event.preventDefault();
                    suppressClick.current = null;
                    return;
                  }
                  if (selecting) toggle(note.id);
                  else onSelect(note.id);
                }}
              >
                {selecting ? (checked ? <Check className="size-4 text-primary" /> : <Square className="size-4" />) : <FileText className="size-3.5" />}
                <span className="min-w-0 flex-1 truncate text-foreground">{note.title}</span>
                {note.isFavorite ? <Star className="size-3 fill-primary text-primary" /> : null}
              </Button>
            );
          })}
          {!notes.length ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">No notes in this view.</p> : null}
        </div>
      </ScrollArea>
      <AlertDialog open={confirming} onOpenChange={(open) => { if (!busy.current) setConfirming(open); }}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedNotes.length} selected note{selectedNotes.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes only the selected notes. Linked imported chats and messages are also deleted when no other note uses them. Deletions sync to your other devices. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-36 overflow-y-auto text-sm text-muted-foreground">
            {selectedNotes.map((note) => <li className="truncate py-1" key={note.id}>{note.title}</li>)}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep notes</AlertDialogCancel>
            <AlertDialogAction disabled={deleting || !selectedNotes.length} className="bg-destructive text-white hover:bg-destructive/85" onClick={(event) => { event.preventDefault(); void removeSelected(); }}>
              {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              {deleting ? "Deleting…" : `Delete ${selectedNotes.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
