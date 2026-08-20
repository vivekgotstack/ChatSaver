export type SyncStatus = "pending" | "synced" | "conflict";
export type MessageRole = "user" | "assistant" | "system" | "tool";
export type NoteSource = "chatgpt" | "manual" | "markdown";
export type ManualNoteFormat = "markdown" | "qa";
export type LibraryFilter = "all" | "favorites" | "imported" | "archived";
export type NoteSort = "updated-desc" | "updated-asc" | "title-asc";

export interface Conversation {
  id: string;
  externalId?: string;
  title: string;
  source: "chatgpt" | "manual";
  messageCount: number;
  sourceCreatedAt?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  serverVersion?: number;
}

export interface Message {
  id: string;
  externalId?: string;
  conversationId: string;
  parentExternalId?: string;
  role: MessageRole;
  content: string;
  sortIndex: number;
  sourceCreatedAt?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  serverVersion?: number;
}

export interface Note {
  id: string;
  conversationId?: string;
  title: string;
  source: NoteSource;
  isFavorite: boolean;
  isArchived: boolean;
  blockCount: number;
  searchText: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  serverVersion?: number;
}

export interface NoteBlock {
  id: string;
  noteId: string;
  position: number;
  question: string;
  answer: string;
  sourceUserMessageId?: string;
  sourceAssistantMessageId?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  serverVersion?: number;
}

export interface ImportRecord {
  id: string;
  filename: string;
  source: "chatgpt-export" | "chatgpt-share-link";
  importedConversationCount: number;
  skippedConversationCount: number;
  createdAt: string;
}

export interface OutboxMutation {
  id: string;
  entityType: "conversation" | "message" | "note" | "noteBlock";
  entityId: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
  createdAt: string;
  attempts: number;
}

export interface SyncMetadata {
  key: string;
  value: number;
}

export interface NotesPage {
  items: Note[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface VaultBackup {
  format: "chatsaver-vault";
  schemaVersion: 1;
  exportedAt: string;
  conversations: Conversation[];
  messages: Message[];
  notes: Note[];
  noteBlocks: NoteBlock[];
  imports: ImportRecord[];
}

export interface NormalizedMessage {
  externalId?: string;
  parentExternalId?: string;
  role: MessageRole;
  content: string;
  sourceCreatedAt?: string;
}

export interface NormalizedConversation {
  externalId: string;
  title: string;
  sourceCreatedAt?: string;
  messages: NormalizedMessage[];
}
