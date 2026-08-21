import Dexie, { type EntityTable } from "dexie";
import type {
  Conversation,
  ImportRecord,
  LibraryFilter,
  ManualNoteFormat,
  Message,
  NormalizedConversation,
  Note,
  NoteBlock,
  NoteCollection,
  NotesPage,
  NoteSort,
  OutboxMutation,
  SyncMetadata,
  VaultBackup,
} from "@/domain/models";
import { toMarkdownText, toPlainText } from "@/lib/plain-text";
import { createClientUuid } from "@/lib/client-uuid";

class ChatSaverDatabase extends Dexie {
  conversations!: EntityTable<Conversation, "id">;
  messages!: EntityTable<Message, "id">;
  notes!: EntityTable<Note, "id">;
  noteBlocks!: EntityTable<NoteBlock, "id">;
  collections!: EntityTable<NoteCollection, "id">;
  imports!: EntityTable<ImportRecord, "id">;
  outbox!: EntityTable<OutboxMutation, "id">;
  syncMetadata!: EntityTable<SyncMetadata, "key">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      conversations: "&id, &externalId, title, updatedAt, syncStatus",
      messages: "&id, conversationId, role, [conversationId+sortIndex], updatedAt",
      notes: "&id, conversationId, title, isFavorite, updatedAt, syncStatus",
      noteBlocks: "&id, noteId, [noteId+position], updatedAt",
      imports: "&id, createdAt",
      outbox: "&id, entityType, entityId, createdAt",
    });
    this.version(2)
      .stores({
        conversations: "&id, &externalId, title, updatedAt, syncStatus",
        messages: "&id, conversationId, role, [conversationId+sortIndex], updatedAt",
        notes:
          "&id, conversationId, title, source, isFavorite, isArchived, updatedAt, syncStatus",
        noteBlocks: "&id, noteId, [noteId+position], updatedAt",
        imports: "&id, createdAt",
        outbox: "&id, [entityType+entityId], entityType, entityId, createdAt",
      })
      .upgrade(async (transaction) => {
        const noteTable = transaction.table<Note, string>("notes");
        const blocks = await transaction.table<NoteBlock, string>("noteBlocks").toArray();
        const blocksByNote = new Map<string, NoteBlock[]>();
        for (const block of blocks) {
          const noteBlocks = blocksByNote.get(block.noteId) ?? [];
          noteBlocks.push(block);
          blocksByNote.set(block.noteId, noteBlocks);
        }
        await noteTable.toCollection().modify((note) => {
          note.source = note.conversationId ? "chatgpt" : "manual";
          note.isArchived = false;
          note.searchText = normalizeSearchText(
            note.title,
            ...(blocksByNote.get(note.id) ?? []).flatMap((block) => [
              block.question,
              block.answer,
            ]),
          );
        });
      });
    this.version(3)
      .stores({
        conversations: "&id, &externalId, title, updatedAt, syncStatus",
        messages: "&id, conversationId, role, [conversationId+sortIndex], updatedAt",
        notes:
          "&id, conversationId, title, source, isFavorite, isArchived, updatedAt, syncStatus",
        noteBlocks: "&id, noteId, [noteId+position], updatedAt",
        imports: "&id, createdAt",
        outbox: "&id, [entityType+entityId], entityType, entityId, createdAt",
      })
      .upgrade(async (transaction) => {
        const messageTable = transaction.table<Message, string>("messages");
        const blockTable = transaction.table<NoteBlock, string>("noteBlocks");
        const noteTable = transaction.table<Note, string>("notes");

        await messageTable.toCollection().modify((message) => {
          message.content = toPlainText(message.content);
        });
        await blockTable.toCollection().modify((block) => {
          block.question = toPlainText(block.question);
          block.answer = toPlainText(block.answer);
        });
        const blocks = await blockTable.toArray();
        const blocksByNote = new Map<string, NoteBlock[]>();
        for (const block of blocks) {
          const noteBlocks = blocksByNote.get(block.noteId) ?? [];
          noteBlocks.push(block);
          blocksByNote.set(block.noteId, noteBlocks);
        }
        await noteTable.toCollection().modify((note) => {
          note.title = toPlainText(note.title) || "Untitled note";
          note.searchText = normalizeSearchText(
            note.title,
            ...(blocksByNote.get(note.id) ?? []).flatMap((block) => [
              block.question,
              block.answer,
            ]),
          );
        });
      });
    this.version(4).stores({
      conversations: "&id, &externalId, title, updatedAt, syncStatus",
      messages: "&id, conversationId, role, [conversationId+sortIndex], updatedAt",
      notes:
        "&id, conversationId, title, source, isFavorite, isArchived, updatedAt, syncStatus",
      noteBlocks: "&id, noteId, [noteId+position], updatedAt",
      imports: "&id, createdAt",
      outbox: "&id, [entityType+entityId], entityType, entityId, createdAt",
      syncMetadata: "&key",
    });
    this.version(5)
      .stores({
        conversations: "&id, &externalId, title, updatedAt, syncStatus",
        messages: "&id, conversationId, role, [conversationId+sortIndex], updatedAt",
        notes:
          "&id, conversationId, title, source, isFavorite, isArchived, updatedAt, syncStatus",
        noteBlocks: "&id, noteId, [noteId+position], updatedAt",
        collections: "&id, name, updatedAt, syncStatus",
        imports: "&id, createdAt",
        outbox: "&id, [entityType+entityId], entityType, entityId, createdAt",
        syncMetadata: "&key",
      })
      .upgrade((transaction) =>
        transaction.table<Note, string>("notes").toCollection().modify((note) => {
          note.collectionIds = [];
        }),
      );
  }
}

const GUEST_VAULT = "chatsaver:guest";
const ACTIVE_SESSION_VAULT = "chatsaver-active-session-vault";

export let db = new ChatSaverDatabase(GUEST_VAULT);

export function switchLocalVault(sessionVaultId?: string): string {
  const databaseName = sessionVaultId
    ? `chatsaver:session:${sessionVaultId}`
    : GUEST_VAULT;
  if (db.name === databaseName) return databaseName;
  db.close();
  db = new ChatSaverDatabase(databaseName);
  return databaseName;
}

export function beginAccountVault(userId: string): string {
  const sessionVaultId = createClientUuid();
  try {
    sessionStorage.setItem(ACTIVE_SESSION_VAULT, JSON.stringify({ userId, sessionVaultId }));
  } catch {
    // A fresh in-memory vault is still safe when mobile privacy settings deny storage.
  }
  return switchLocalVault(sessionVaultId);
}

export function restoreAccountVault(userId: string): string {
  try {
    const stored = JSON.parse(sessionStorage.getItem(ACTIVE_SESSION_VAULT) ?? "null") as {
      userId?: unknown;
      sessionVaultId?: unknown;
    } | null;
    if (
      stored?.userId === userId
      && typeof stored.sessionVaultId === "string"
      && stored.sessionVaultId.length > 0
    ) {
      return switchLocalVault(stored.sessionVaultId);
    }
  } catch {
    // Invalid session metadata must never select an existing account vault.
  }
  return beginAccountVault(userId);
}

export function endAccountVault(): string {
  try {
    sessionStorage.removeItem(ACTIVE_SESSION_VAULT);
  } catch {
    // The active database is switched below even when storage access is denied.
  }
  return switchLocalVault();
}

interface AccountVaultActivation {
  databaseName: string;
  importedNotes: number;
}

function guestBackupSignature(backup: VaultBackup): string {
  const records = [
    ...backup.conversations,
    ...backup.messages,
    ...backup.notes,
    ...backup.noteBlocks,
    ...(backup.collections ?? []),
    ...backup.imports,
  ];
  return records
    .map((record) => `${record.id}:${"updatedAt" in record ? record.updatedAt : "createdAt" in record ? record.createdAt : ""}`)
    .sort()
    .join("|");
}

/**
 * Opens an account-scoped vault without abandoning work made as a guest.
 * Guest records keep their IDs, are merged into the account vault, and are
 * queued through the normal outbox so an existing cloud vault is merged too.
 */
export async function activateAccountVault(
  userId: string,
  freshSession = false,
): Promise<AccountVaultActivation> {
  const guestBackup = db.name === GUEST_VAULT ? await createVaultBackup() : undefined;
  const databaseName = freshSession ? beginAccountVault(userId) : restoreAccountVault(userId);
  if (!guestBackup) return { databaseName, importedNotes: 0 };

  const hasGuestData = guestBackup.conversations.length > 0
    || guestBackup.messages.length > 0
    || guestBackup.notes.length > 0
    || guestBackup.noteBlocks.length > 0
    || (guestBackup.collections?.length ?? 0) > 0
    || guestBackup.imports.length > 0;
  if (!hasGuestData) return { databaseName, importedNotes: 0 };

  const signature = guestBackupSignature(guestBackup);
  const completedMarkerKey = `chatsaver:guest-migration-complete:${userId}`;
  const sessionMarkerKey = `chatsaver:guest-migration-session:${userId}`;
  try {
    if (localStorage.getItem(completedMarkerKey) === signature) {
      return { databaseName, importedNotes: 0 };
    }
    const sessionMarker = JSON.parse(sessionStorage.getItem(sessionMarkerKey) ?? "null") as { signature?: string; databaseName?: string } | null;
    if (sessionMarker?.signature === signature && sessionMarker.databaseName === databaseName) {
      return { databaseName, importedNotes: 0 };
    }
  } catch {
    // Storage restrictions must not prevent a lossless in-memory migration.
  }

  const importedNotes = await restoreVaultBackup(guestBackup);
  try { sessionStorage.setItem(sessionMarkerKey, JSON.stringify({ signature, databaseName })); } catch { /* ignored */ }
  return { databaseName, importedNotes };
}

/** Marks the guest snapshot as durable only after the normal cloud sync succeeds. */
export function confirmGuestMigration(userId: string): void {
  const sessionMarkerKey = `chatsaver:guest-migration-session:${userId}`;
  try {
    const marker = JSON.parse(sessionStorage.getItem(sessionMarkerKey) ?? "null") as { signature?: string; databaseName?: string } | null;
    if (marker?.databaseName === db.name && typeof marker.signature === "string") {
      localStorage.setItem(`chatsaver:guest-migration-complete:${userId}`, marker.signature);
    }
  } catch {
    // A failed persistence marker only causes a safe, idempotent re-import.
  }
}

export async function clearLocalVault(): Promise<void> {
  const databaseName = db.name;
  db.close();
  await Dexie.delete(databaseName);
  db = new ChatSaverDatabase(databaseName);
}

function makeId(): string {
  return createClientUuid();
}

function now(): string {
  return new Date().toISOString();
}

function normalizeSearchText(...parts: string[]): string {
  return parts.join("\n").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

async function queueMutation(mutation: OutboxMutation): Promise<void> {
  const existing = await db.outbox
    .where("[entityType+entityId]")
    .equals([mutation.entityType, mutation.entityId])
    .toArray();

  if (mutation.operation === "create") {
    const pendingCreate = existing.find((candidate) => candidate.operation === "create");
    if (pendingCreate) {
      await db.outbox.put({
        ...pendingCreate,
        payload: mutation.payload,
        createdAt: mutation.createdAt,
        attempts: 0,
      });
      return;
    }
  }

  if (mutation.operation === "update") {
    const mergeTarget = existing.find(
      (candidate) => candidate.operation === "create" || candidate.operation === "update",
    );
    if (mergeTarget) {
      await db.outbox.put({
        ...mergeTarget,
        payload: mutation.payload,
        createdAt: mutation.createdAt,
        attempts: 0,
      });
      return;
    }
  }

  if (mutation.operation === "delete") {
    await db.outbox.bulkDelete(existing.map((candidate) => candidate.id));
    if (existing.some((candidate) => candidate.operation === "create")) return;
  }

  await db.outbox.add(mutation);
}

function queueCreate(
  entityType: OutboxMutation["entityType"],
  entity: Conversation | Message | Note | NoteBlock | NoteCollection,
): OutboxMutation {
  return {
    id: makeId(),
    entityType,
    entityId: entity.id,
    operation: "create",
    payload: entity,
    createdAt: now(),
    attempts: 0,
  };
}

export interface PersistImportResult {
  imported: number;
  skipped: number;
  firstNoteId?: string;
}

export async function persistImportedConversations(
  filename: string,
  importedConversations: NormalizedConversation[],
  importSource: ImportRecord["source"] = "chatgpt-export",
): Promise<PersistImportResult> {
  let imported = 0;
  let skipped = 0;
  let firstNoteId: string | undefined;

  await db.transaction(
    "rw",
    [db.conversations, db.messages, db.notes, db.noteBlocks, db.imports, db.outbox],
    async () => {
      for (const source of importedConversations) {
        const existing = await db.conversations
          .where("externalId")
          .equals(source.externalId)
          .first();

        if (existing) {
          skipped += 1;
          continue;
        }

        const timestamp = now();
        const sourceTitle = toPlainText(source.title) || "Imported ChatGPT conversation";
        const sourceMessages = source.messages
          .map((message) => ({ ...message, content: toMarkdownText(message.content) }))
          .filter((message) => message.content);
        const conversation: Conversation = {
          id: makeId(),
          externalId: source.externalId,
          title: sourceTitle,
          source: "chatgpt",
          messageCount: sourceMessages.length,
          sourceCreatedAt: source.sourceCreatedAt,
          createdAt: timestamp,
          updatedAt: timestamp,
          syncStatus: "pending",
        };

        const messages: Message[] = sourceMessages.map((message, sortIndex) => ({
          id: makeId(),
          externalId: message.externalId,
          parentExternalId: message.parentExternalId,
          conversationId: conversation.id,
          role: message.role,
          content: message.content,
          sortIndex,
          sourceCreatedAt: message.sourceCreatedAt,
          createdAt: timestamp,
          updatedAt: timestamp,
          syncStatus: "pending",
        }));

        const blocks: NoteBlock[] = [];
        let pendingQuestion: Message | undefined;
        let pendingAnswer: Message | undefined;

        function savePendingAnswer(): void {
          if (!pendingQuestion || !pendingAnswer) return;
          blocks.push({
            id: makeId(),
            noteId: "",
            position: blocks.length,
            question: pendingQuestion.content,
            answer: pendingAnswer.content,
            sourceUserMessageId: pendingQuestion.id,
            sourceAssistantMessageId: pendingAnswer.id,
            createdAt: timestamp,
            updatedAt: timestamp,
            syncStatus: "pending",
          });
        }

        for (const message of messages) {
          if (message.role === "user") {
            savePendingAnswer();
            pendingQuestion = message;
            pendingAnswer = undefined;
            continue;
          }

          if (message.role === "assistant" && pendingQuestion) {
            pendingAnswer = message;
          }
        }
        savePendingAnswer();

        const note: Note | undefined = blocks.length
          ? {
              id: makeId(),
              conversationId: conversation.id,
              title: sourceTitle,
              source: "chatgpt",
              isFavorite: false,
              isArchived: false,
              collectionIds: [],
              blockCount: blocks.length,
              searchText: normalizeSearchText(
                sourceTitle,
                ...blocks.flatMap((block) => [block.question, block.answer]),
              ),
              createdAt: timestamp,
              updatedAt: timestamp,
              syncStatus: "pending",
            }
          : undefined;

        if (note) {
          for (const block of blocks) block.noteId = note.id;
          firstNoteId ??= note.id;
        }

        await db.conversations.add(conversation);
        await db.messages.bulkAdd(messages);
        await db.outbox.bulkAdd([
          queueCreate("conversation", conversation),
          ...messages.map((message) => queueCreate("message", message)),
        ]);

        if (note) {
          await db.notes.add(note);
          await db.noteBlocks.bulkAdd(blocks);
          await db.outbox.bulkAdd([
            queueCreate("note", note),
            ...blocks.map((block) => queueCreate("noteBlock", block)),
          ]);
        }

        imported += 1;
      }

      await db.imports.add({
        id: makeId(),
        filename,
        source: importSource,
        importedConversationCount: imported,
        skippedConversationCount: skipped,
        createdAt: now(),
      });
    },
  );

  return { imported, skipped, firstNoteId };
}

export async function updateNoteTitle(noteId: string, title: string): Promise<void> {
  const timestamp = now();
  await db.transaction("rw", [db.notes, db.noteBlocks, db.outbox], async () => {
    const note = await db.notes.get(noteId);
    if (!note) return;
    const updated: Note = {
      ...note,
      title: title.trim() || "Untitled note",
      searchText: normalizeSearchText(
        title.trim() || "Untitled note",
        ...(await db.noteBlocks
          .where("noteId")
          .equals(noteId)
          .toArray())
          .flatMap((block) => [block.question, block.answer]),
      ),
      updatedAt: timestamp,
      syncStatus: "pending",
    };
    await db.notes.put(updated);
    await queueMutation({
      id: makeId(),
      entityType: "note",
      entityId: noteId,
      operation: "update",
      payload: updated,
      createdAt: timestamp,
      attempts: 0,
    });
  });
}

export async function updateNoteBlock(
  blockId: string,
  patch: Pick<NoteBlock, "question" | "answer">,
): Promise<void> {
  const timestamp = now();
  await db.transaction("rw", [db.noteBlocks, db.notes, db.outbox], async () => {
    const block = await db.noteBlocks.get(blockId);
    if (!block) return;
    const updated: NoteBlock = {
      ...block,
      ...patch,
      updatedAt: timestamp,
      syncStatus: "pending",
    };
    await db.noteBlocks.put(updated);
    const note = await db.notes.get(block.noteId);
    if (note) {
      const blocks = await db.noteBlocks.where("noteId").equals(block.noteId).toArray();
      const updatedNote: Note = {
        ...note,
        searchText: normalizeSearchText(
          note.title,
          ...blocks.flatMap((candidate) => [candidate.question, candidate.answer]),
        ),
        updatedAt: timestamp,
        syncStatus: "pending",
      };
      await db.notes.put(updatedNote);
      await queueMutation({
        id: makeId(),
        entityType: "note",
        entityId: note.id,
        operation: "update",
        payload: updatedNote,
        createdAt: timestamp,
        attempts: 0,
      });
    }
    await queueMutation({
      id: makeId(),
      entityType: "noteBlock",
      entityId: blockId,
      operation: "update",
      payload: updated,
      createdAt: timestamp,
      attempts: 0,
    });
  });
}

export async function createBlankNote(format: ManualNoteFormat): Promise<string> {
  const timestamp = now();
  const note: Note = {
    id: makeId(),
    title: "Untitled note",
    source: format === "markdown" ? "markdown" : "manual",
    isFavorite: false,
    isArchived: false,
    collectionIds: [],
    blockCount: 1,
    searchText: "untitled note",
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: "pending",
  };
  const block: NoteBlock = {
    id: makeId(),
    noteId: note.id,
    position: 0,
    question: "",
    answer: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: "pending",
  };

  await db.transaction("rw", [db.notes, db.noteBlocks, db.outbox], async () => {
    await db.notes.add(note);
    await db.noteBlocks.add(block);
    await db.outbox.bulkAdd([
      queueCreate("note", note),
      queueCreate("noteBlock", block),
    ]);
  });

  return note.id;
}

export async function createMarkdownNote(title: string, content: string): Promise<string> {
  const timestamp = now();
  const safeTitle = toPlainText(title).trim().slice(0, 160) || "Imported note";
  const note: Note = {
    id: makeId(),
    title: safeTitle,
    source: "markdown",
    isFavorite: false,
    isArchived: false,
    collectionIds: [],
    blockCount: 1,
    searchText: normalizeSearchText(safeTitle, content),
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: "pending",
  };
  const block: NoteBlock = {
    id: makeId(),
    noteId: note.id,
    position: 0,
    question: "",
    answer: content,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: "pending",
  };

  await db.transaction("rw", [db.notes, db.noteBlocks, db.outbox], async () => {
    await db.notes.add(note);
    await db.noteBlocks.add(block);
    await db.outbox.bulkAdd([queueCreate("note", note), queueCreate("noteBlock", block)]);
  });
  return note.id;
}

export async function addNoteBlock(noteId: string): Promise<string | undefined> {
  return db.transaction("rw", [db.notes, db.noteBlocks, db.outbox], async () => {
    const note = await db.notes.get(noteId);
    if (!note) return undefined;
    const timestamp = now();
    const block: NoteBlock = {
      id: makeId(),
      noteId,
      position: note.blockCount,
      question: "",
      answer: "",
      createdAt: timestamp,
      updatedAt: timestamp,
      syncStatus: "pending",
    };
    const updatedNote: Note = {
      ...note,
      blockCount: note.blockCount + 1,
      updatedAt: timestamp,
      syncStatus: "pending",
    };

    await db.noteBlocks.add(block);
    await db.notes.put(updatedNote);
    await db.outbox.add(queueCreate("noteBlock", block));
    await queueMutation({
      id: makeId(),
      entityType: "note",
      entityId: noteId,
      operation: "update",
      payload: updatedNote,
      createdAt: timestamp,
      attempts: 0,
    });
    return block.id;
  });
}

export async function deleteNoteBlock(blockId: string): Promise<void> {
  await db.transaction("rw", [db.notes, db.noteBlocks, db.outbox], async () => {
    const block = await db.noteBlocks.get(blockId);
    if (!block) return;
    const note = await db.notes.get(block.noteId);
    if (!note || note.blockCount <= 1) return;

    const timestamp = now();
    const remainingBlocks = (
      await db.noteBlocks.where("noteId").equals(note.id).sortBy("position")
    ).filter((candidate) => candidate.id !== blockId);
    const repositionedBlocks = remainingBlocks.flatMap((candidate, position) =>
      candidate.position === position
        ? []
        : [
            {
              ...candidate,
              position,
              updatedAt: timestamp,
              syncStatus: "pending" as const,
            },
          ],
    );
    const updatedNote: Note = {
      ...note,
      blockCount: remainingBlocks.length,
      updatedAt: timestamp,
      syncStatus: "pending",
    };

    await db.noteBlocks.delete(blockId);
    await db.noteBlocks.bulkPut(repositionedBlocks);
    const searchableNote: Note = {
      ...updatedNote,
      searchText: normalizeSearchText(
        updatedNote.title,
        ...remainingBlocks.flatMap((candidate) => [candidate.question, candidate.answer]),
      ),
    };
    await db.notes.put(searchableNote);
    await queueMutation({
      id: makeId(),
      entityType: "noteBlock",
      entityId: blockId,
      operation: "delete",
      payload: { id: blockId },
      createdAt: timestamp,
      attempts: 0,
    });
    for (const candidate of repositionedBlocks) {
      await queueMutation({
        id: makeId(),
        entityType: "noteBlock",
        entityId: candidate.id,
        operation: "update",
        payload: candidate,
        createdAt: timestamp,
        attempts: 0,
      });
    }
    await queueMutation({
      id: makeId(),
      entityType: "note",
      entityId: note.id,
      operation: "update",
      payload: searchableNote,
      createdAt: timestamp,
      attempts: 0,
    });
  });
}

export async function toggleFavorite(noteId: string): Promise<void> {
  await db.transaction("rw", [db.notes, db.outbox], async () => {
    const note = await db.notes.get(noteId);
    if (!note) return;
    const timestamp = now();
    const updated: Note = {
      ...note,
      isFavorite: !note.isFavorite,
      updatedAt: timestamp,
      syncStatus: "pending",
    };
    await db.notes.put(updated);
    await queueMutation({
      id: makeId(),
      entityType: "note",
      entityId: noteId,
      operation: "update",
      payload: updated,
      createdAt: timestamp,
      attempts: 0,
    });
  });
}

function collectionName(value: string): string {
  const name = toPlainText(value).replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) throw new Error("Enter a collection name.");
  return name;
}

export async function createCollection(nameInput: string): Promise<string> {
  const name = collectionName(nameInput);
  const duplicate = await db.collections
    .filter((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    .first();
  if (duplicate) throw new Error("A collection with this name already exists.");
  const timestamp = now();
  const collection: NoteCollection = {
    id: makeId(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: "pending",
  };
  await db.transaction("rw", [db.collections, db.outbox], async () => {
    await db.collections.add(collection);
    await queueMutation(queueCreate("collection", collection));
  });
  return collection.id;
}

export async function renameCollection(id: string, nameInput: string): Promise<void> {
  const name = collectionName(nameInput);
  const duplicate = await db.collections
    .filter((item) => item.id !== id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    .first();
  if (duplicate) throw new Error("A collection with this name already exists.");
  await db.transaction("rw", [db.collections, db.outbox], async () => {
    const current = await db.collections.get(id);
    if (!current || current.name === name) return;
    const timestamp = now();
    const updated: NoteCollection = {
      ...current,
      name,
      updatedAt: timestamp,
      syncStatus: "pending",
    };
    await db.collections.put(updated);
    await queueMutation({
      id: makeId(), entityType: "collection", entityId: id, operation: "update",
      payload: updated, createdAt: timestamp, attempts: 0,
    });
  });
}

export async function toggleNoteCollection(noteId: string, collectionId: string): Promise<void> {
  await db.transaction("rw", [db.notes, db.collections, db.outbox], async () => {
    const [note, collection] = await Promise.all([
      db.notes.get(noteId),
      db.collections.get(collectionId),
    ]);
    if (!note || !collection) return;
    const currentIds = note.collectionIds ?? [];
    const timestamp = now();
    const updated: Note = {
      ...note,
      collectionIds: currentIds.includes(collectionId)
        ? currentIds.filter((id) => id !== collectionId)
        : [...currentIds, collectionId],
      updatedAt: timestamp,
      syncStatus: "pending",
    };
    await db.notes.put(updated);
    await queueMutation({
      id: makeId(), entityType: "note", entityId: noteId, operation: "update",
      payload: updated, createdAt: timestamp, attempts: 0,
    });
  });
}

export async function deleteCollection(id: string): Promise<void> {
  await db.transaction("rw", [db.collections, db.notes, db.outbox], async () => {
    const collection = await db.collections.get(id);
    if (!collection) return;
    const timestamp = now();
    const notes = await db.notes.filter((note) => (note.collectionIds ?? []).includes(id)).toArray();
    for (const note of notes) {
      const updated: Note = {
        ...note,
        collectionIds: note.collectionIds.filter((collectionId) => collectionId !== id),
        updatedAt: timestamp,
        syncStatus: "pending",
      };
      await db.notes.put(updated);
      await queueMutation({
        id: makeId(), entityType: "note", entityId: note.id, operation: "update",
        payload: updated, createdAt: timestamp, attempts: 0,
      });
    }
    await db.collections.delete(id);
    await queueMutation({
      id: makeId(), entityType: "collection", entityId: id, operation: "delete",
      payload: { id }, createdAt: timestamp, attempts: 0,
    });
  });
}

export async function deleteNote(noteId: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.notes, db.noteBlocks, db.conversations, db.messages, db.outbox],
    async () => {
    const note = await db.notes.get(noteId);
    if (!note) return;
    const blocks = await db.noteBlocks.where("noteId").equals(noteId).toArray();
    for (const block of blocks) {
      await queueMutation({
        id: makeId(),
        entityType: "noteBlock",
        entityId: block.id,
        operation: "delete",
        payload: { id: block.id },
        createdAt: now(),
        attempts: 0,
      });
    }
    await db.noteBlocks.bulkDelete(blocks.map((block) => block.id));
    await db.notes.delete(noteId);
    await queueMutation({
      id: makeId(),
      entityType: "note",
      entityId: noteId,
      operation: "delete",
      payload: { id: noteId },
      createdAt: now(),
      attempts: 0,
    });

    if (note.conversationId) {
      const siblingNotes = await db.notes.where("conversationId").equals(note.conversationId).count();
      if (siblingNotes === 0) {
        const messages = await db.messages.where("conversationId").equals(note.conversationId).toArray();
        for (const message of messages) {
          await queueMutation({
            id: makeId(),
            entityType: "message",
            entityId: message.id,
            operation: "delete",
            payload: { id: message.id },
            createdAt: now(),
            attempts: 0,
          });
        }
        await db.messages.bulkDelete(messages.map((message) => message.id));
        await db.conversations.delete(note.conversationId);
        await queueMutation({
          id: makeId(),
          entityType: "conversation",
          entityId: note.conversationId,
          operation: "delete",
          payload: { id: note.conversationId },
          createdAt: now(),
          attempts: 0,
        });
      }
    }
    },
  );
}

export async function toggleArchived(noteId: string): Promise<boolean | undefined> {
  return db.transaction("rw", [db.notes, db.outbox], async () => {
    const note = await db.notes.get(noteId);
    if (!note) return undefined;
    const timestamp = now();
    const updated: Note = {
      ...note,
      isArchived: !note.isArchived,
      updatedAt: timestamp,
      syncStatus: "pending",
    };
    await db.notes.put(updated);
    await queueMutation({
      id: makeId(),
      entityType: "note",
      entityId: noteId,
      operation: "update",
      payload: updated,
      createdAt: timestamp,
      attempts: 0,
    });
    return updated.isArchived;
  });
}

export async function queryNotesPage(options: {
  page: number;
  pageSize: number;
  filter: LibraryFilter;
  query: string;
  sort: NoteSort;
  collectionId?: string;
}): Promise<NotesPage> {
  const normalizedQuery = normalizeSearchText(options.query);
  const sorted =
    options.sort === "title-asc"
      ? db.notes.orderBy("title")
      : options.sort === "updated-asc"
        ? db.notes.orderBy("updatedAt")
        : db.notes.orderBy("updatedAt").reverse();

  const filtered = sorted.filter((note) => {
    const matchesSection =
      options.filter === "archived"
        ? note.isArchived
        : !note.isArchived &&
          (options.filter === "all" ||
            (options.filter === "favorites" && note.isFavorite) ||
            (options.filter === "imported" && note.source === "chatgpt"));
    return matchesSection
      && (!options.collectionId || (note.collectionIds ?? []).includes(options.collectionId))
      && (!normalizedQuery || note.searchText.includes(normalizedQuery));
  });

  const totalItems = await filtered.clone().count();
  const totalPages = Math.max(1, Math.ceil(totalItems / options.pageSize));
  const page = Math.min(Math.max(1, options.page), totalPages);
  const items = await filtered
    .clone()
    .offset((page - 1) * options.pageSize)
    .limit(options.pageSize)
    .toArray();

  return { items, page, pageSize: options.pageSize, totalItems, totalPages };
}

export async function getLibraryCounts(): Promise<Record<LibraryFilter, number>> {
  const notes = await db.notes.toArray();
  return notes.reduce<Record<LibraryFilter, number>>(
    (counts, note) => {
      if (note.isArchived) {
        counts.archived += 1;
        return counts;
      }
      counts.all += 1;
      if (note.isFavorite) counts.favorites += 1;
      if (note.source === "chatgpt") counts.imported += 1;
      return counts;
    },
    { all: 0, favorites: 0, imported: 0, archived: 0 },
  );
}

export async function createVaultBackup(): Promise<VaultBackup> {
  const [conversations, messages, notes, noteBlocks, collections, imports] = await Promise.all([
    db.conversations.toArray(),
    db.messages.toArray(),
    db.notes.toArray(),
    db.noteBlocks.toArray(),
    db.collections.toArray(),
    db.imports.toArray(),
  ]);
  return {
    format: "chatsaver-vault",
    schemaVersion: 1,
    exportedAt: now(),
    conversations,
    messages,
    notes,
    noteBlocks,
    collections,
    imports,
  };
}

export interface MarkdownVaultBackup {
  content: string;
  noteCount: number;
  exportedAt: string;
}

export async function createMarkdownVaultBackup(): Promise<MarkdownVaultBackup> {
  const backup = await createVaultBackup();
  const blocksByNote = new Map<string, NoteBlock[]>();
  for (const block of backup.noteBlocks) {
    const blocks = blocksByNote.get(block.noteId) ?? [];
    blocks.push(block);
    blocksByNote.set(block.noteId, blocks);
  }
  const notes = backup.notes
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const lines = [
    "# ChatSaver Knowledge Backup",
    "",
    `> Exported ${backup.exportedAt} · ${notes.length} ${notes.length === 1 ? "note" : "notes"} · Markdown-native and version controlled.`,
    "",
    "This repository is a portable knowledge backup generated by ChatSaver. Each update is committed through the connected GitHub account.",
    "",
    "## Contents",
    "",
    ...notes.map((note, index) => `${index + 1}. ${note.title.replace(/\r?\n/g, " ")}`),
  ];

  for (const [index, note] of notes.entries()) {
    lines.push("", "---", "", `## ${index + 1}. ${note.title}`, "");
    lines.push(`_Updated ${note.updatedAt} · ${note.source}${note.isArchived ? " · archived" : ""}_`, "");
    const blocks = (blocksByNote.get(note.id) ?? []).toSorted((left, right) => left.position - right.position);
    if (blocks.length === 0) {
      lines.push("_This note has no content._");
      continue;
    }
    for (const block of blocks) {
      if (block.question.trim()) lines.push(`### ${block.question.trim()}`, "");
      if (block.answer.trim()) lines.push(block.answer.trim(), "");
    }
  }

  const content = lines.join("\n").trim() + "\n";
  if (content.length > 440_000) {
    throw new Error("This vault is too large for one GitHub Markdown file. Archive or split notes before publishing.");
  }
  return { content, noteCount: notes.length, exportedAt: backup.exportedAt };
}

function isVaultBackup(value: unknown): value is VaultBackup {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<VaultBackup>;
  const hasStringId = (item: unknown) =>
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    typeof item.id === "string" &&
    item.id.length > 0;
  return (
    candidate.format === "chatsaver-vault" &&
    candidate.schemaVersion === 1 &&
    Array.isArray(candidate.conversations) &&
    Array.isArray(candidate.messages) &&
    Array.isArray(candidate.notes) &&
    Array.isArray(candidate.noteBlocks) &&
    (candidate.collections === undefined || Array.isArray(candidate.collections)) &&
    Array.isArray(candidate.imports) &&
    candidate.conversations.every(hasStringId) &&
    candidate.messages.every(hasStringId) &&
    candidate.notes.every(
      (note) =>
        hasStringId(note) &&
        "title" in note &&
        typeof note.title === "string",
    ) &&
    candidate.noteBlocks.every(
      (block) =>
        hasStringId(block) &&
        "noteId" in block &&
        typeof block.noteId === "string",
    ) &&
    (candidate.collections ?? []).every(
      (collection) =>
        hasStringId(collection) &&
        "name" in collection &&
        typeof collection.name === "string",
    ) &&
    candidate.imports.every(hasStringId)
  );
}

export async function restoreVaultBackup(value: unknown): Promise<number> {
  if (!isVaultBackup(value)) {
    throw new Error("This is not a supported ChatSaver vault backup.");
  }

  await db.transaction(
    "rw",
    [db.conversations, db.messages, db.notes, db.noteBlocks, db.collections, db.imports, db.outbox],
    async () => {
      const conversations = value.conversations.map((conversation) => ({
        ...conversation,
        title: toPlainText(conversation.title) || "Imported ChatGPT conversation",
        syncStatus: "pending" as const,
      }));
      const messages = value.messages.map((message) => ({
        ...message,
        content: toMarkdownText(message.content),
        syncStatus: "pending" as const,
      }));
      const blocks = value.noteBlocks.map((block) => ({
        ...block,
        question: toMarkdownText(block.question),
        answer: toMarkdownText(block.answer),
        syncStatus: "pending" as const,
      }));
      const blocksByNote = new Map<string, NoteBlock[]>();
      for (const block of blocks) {
        const noteBlocks = blocksByNote.get(block.noteId) ?? [];
        noteBlocks.push(block);
        blocksByNote.set(block.noteId, noteBlocks);
      }
      const notes = value.notes.map((note) => ({
        ...note,
        title: toPlainText(note.title) || "Untitled note",
        source: note.source ?? (note.conversationId ? "chatgpt" : "manual"),
        isArchived: note.isArchived ?? false,
        collectionIds: note.collectionIds ?? [],
        searchText: normalizeSearchText(
          note.title,
          ...(blocksByNote.get(note.id) ?? []).flatMap((block) => [
            block.question,
            block.answer,
          ]),
        ),
        syncStatus: "pending" as const,
      }));
      const collections = (value.collections ?? []).map((collection) => ({
        ...collection,
        name: collectionName(collection.name),
        syncStatus: "pending" as const,
      }));

      await db.conversations.bulkPut(conversations);
      await db.messages.bulkPut(messages);
      await db.notes.bulkPut(notes);
      await db.noteBlocks.bulkPut(blocks);
      await db.collections.bulkPut(collections);
      await db.imports.bulkPut(value.imports);
      for (const entity of conversations) {
        await queueMutation(queueCreate("conversation", entity));
      }
      for (const entity of messages) {
        await queueMutation(queueCreate("message", entity));
      }
      for (const entity of notes) {
        await queueMutation(queueCreate("note", entity));
      }
      for (const entity of blocks) {
        await queueMutation(queueCreate("noteBlock", entity));
      }
      for (const entity of collections) {
        await queueMutation(queueCreate("collection", entity));
      }
    },
  );

  return value.notes.length;
}

export async function seedDemoLibrary(): Promise<string | undefined> {
  const hasNotes = (await db.notes.count()) > 0;
  if (hasNotes) return (await db.notes.orderBy("updatedAt").last())?.id;

  const demo: NormalizedConversation = {
    externalId: "chatsaver-demo-conversation",
    title: "Building an offline-first application",
    sourceCreatedAt: new Date().toISOString(),
    messages: [
      {
        role: "user",
        content: "What does offline-first mean?",
      },
      {
        role: "assistant",
        content:
          "Offline-first means the application reads and writes local data immediately. Network synchronization happens later and is not required for the normal interface.",
      },
      {
        role: "user",
        content: "Why use IndexedDB instead of localStorage?",
      },
      {
        role: "assistant",
        content:
          "IndexedDB supports much larger structured datasets, indexes, transactions, and binary files without blocking the browser's main thread.",
      },
    ],
  };

  return (await persistImportedConversations("demo", [demo])).firstNoteId;
}
