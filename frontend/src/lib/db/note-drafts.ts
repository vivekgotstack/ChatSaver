import { ChatSaverDatabase, db, updateNoteBlock, updateNoteTitle } from "./database";
import { createClientUuid } from "@/lib/client-uuid";

export type DraftValue = { title: string } | { question: string; answer: string };
export type DraftState = "saved" | "saving" | "error";
type Draft = {
  vault: string;
  id: string;
  noteId: string;
  value: DraftValue;
  revision: string;
};
const prefix = "chatsaver:note-draft:v1:";
const pending = new Map<string, Draft>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Map<string, Promise<void>>();
const errors = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
const notify = (key: string) => listeners.get(key)?.forEach((listener) => listener());

export function draftKey(vault: string, id: string, title: boolean): string {
  return `${prefix}${encodeURIComponent(vault)}:${title ? "title" : "block"}:${id}`;
}

export function readDraft(key: string): Draft | undefined {
  if (pending.has(key)) return pending.get(key);
  try {
    const value: Draft | null = JSON.parse(localStorage.getItem(key) ?? "null");
    if (value && typeof value.vault === "string" && typeof value.id === "string"
      && typeof value.noteId === "string" && typeof value.revision === "string"
      && value.value && (("title" in value.value && typeof value.value.title === "string")
        || ("question" in value.value && typeof value.value.question === "string"
          && "answer" in value.value && typeof value.value.answer === "string"))
      && key === draftKey(value.vault, value.id, "title" in value.value)) return value;
  } catch { /* The in-memory draft still works if browser storage is unavailable. */ }
}

export function draftState(key: string): DraftState {
  return errors.has(key) ? "error" : readDraft(key) ? "saving" : "saved";
}

export function subscribeDrafts(key: string, listener: () => void): () => void {
  const subscribers = listeners.get(key) ?? new Set();
  subscribers.add(listener);
  listeners.set(key, subscribers);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) listeners.delete(key);
  };
}

function schedule(key: string, delay: number) {
  if (timers.has(key)) return;
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    void flushDraft(key).catch(() => { /* Kept in the journal and retried below. */ });
  }, delay));
}

export function stageDraft(vault: string, id: string, noteId: string, value: DraftValue): void {
  const key = draftKey(vault, id, "title" in value);
  const draft: Draft = { vault, id, noteId, value, revision: createClientUuid() };
  pending.set(key, draft);
  errors.delete(key);
  try {
    // Synchronous write-ahead journal: never depend on an unload callback finishing.
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    errors.add(key);
    // If the journal is full/blocked, attempt IndexedDB immediately.
    void flushDraft(key).catch(() => {});
  }
  schedule(key, 150); // Bounded delay, even when typing never pauses.
  notify(key);
}

export async function flushDraft(key: string): Promise<void> {
  clearTimeout(timers.get(key));
  timers.delete(key);
  const previous = running.get(key);
  if (previous) {
    await previous;
    if (readDraft(key)) return flushDraft(key);
    return;
  }
  const draft = readDraft(key);
  if (!draft) return;
  pending.set(key, draft);
  const task = (async () => {
    // A separate handle keeps a delayed save bound to its original vault after sign-out.
    const vault = new ChatSaverDatabase(draft.vault);
    try {
      if ("title" in draft.value) await updateNoteTitle(draft.id, draft.value.title, vault);
      else await updateNoteBlock(draft.id, draft.value, vault);
      if (pending.get(key)?.revision === draft.revision) {
        pending.delete(key);
        errors.delete(key);
      }
      try {
        const stored = localStorage.getItem(key);
        if (stored && JSON.parse(stored).revision === draft.revision) localStorage.removeItem(key);
      } catch { /* Leave a recoverable journal entry if cleanup is unavailable. */ }
    } catch (error) {
      errors.add(key);
      schedule(key, 2_000);
      throw error;
    } finally {
      vault.close();
      running.delete(key);
      notify(key);
    }
  })();
  running.set(key, task);
  await task;
  if (readDraft(key)) schedule(key, 150);
}

function keysForVault(vault: string): string[] {
  const keys = new Set(pending.keys());
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) keys.add(key);
    }
  } catch { /* In-memory drafts can still be committed. */ }
  return [...keys].filter((key) => readDraft(key)?.vault === vault);
}

export async function flushNoteDrafts(vault = db.name): Promise<void> {
  await Promise.all(keysForVault(vault).map(flushDraft));
}

export function pendingDraftEntities(vault: string): Set<string> {
  const entities = new Set<string>();
  for (const key of keysForVault(vault)) {
    const draft = readDraft(key)!;
    entities.add(`note:${draft.noteId}`);
    if (!("title" in draft.value)) entities.add(`noteBlock:${draft.id}`);
  }
  return entities;
}
