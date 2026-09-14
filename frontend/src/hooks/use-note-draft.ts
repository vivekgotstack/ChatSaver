"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db/database";
import { draftKey, draftState, flushDraft, readDraft, stageDraft, subscribeDrafts, type DraftValue } from "@/lib/db/note-drafts";

export function useNoteDraft<T extends DraftValue>(id: string, noteId: string, remote: T) {
  const vault = useRef(db.name).current;
  const key = draftKey(vault, id, "title" in remote);
  const [value, setValue] = useState<T>(() => (readDraft(key)?.value as T | undefined) ?? remote);
  const latest = useRef(value);
  const [saveState, setSaveState] = useState(() => draftState(key));
  const signature = JSON.stringify(remote);

  useEffect(() => {
    if (readDraft(key)) return;
    const incoming = JSON.parse(signature) as T;
    // A normalized DB echo must not remove spaces while the title is being typed.
    if ("title" in incoming && "title" in latest.current
      && incoming.title === (latest.current.title.trim() || "Untitled note")) return;
    latest.current = incoming;
    setValue(incoming);
  }, [key, signature]);

  useEffect(() => {
    const flush = () => { void flushDraft(key).catch(() => {}); };
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    const unsubscribe = subscribeDrafts(key, () => {
      const state = draftState(key);
      setSaveState(state);
      if (state === "error") toast.error("Local save is retrying", {
        id: `save:${key}`,
        description: "Device storage is unavailable. Keep the app open until Saved on device appears.",
      });
    });
    window.addEventListener("pagehide", flush);
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", hidden);
    flush();
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, [key]);

  function save(next: T) {
    stageDraft(vault, id, noteId, next);
    latest.current = next;
    setValue(next);
  }

  return { value, save, saveState, flush: () => { void flushDraft(key).catch(() => {}); } };
}
