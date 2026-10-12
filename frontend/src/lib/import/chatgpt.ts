import type {
  MessageRole,
  NormalizedConversation,
  NormalizedMessage,
} from "@/domain/models";
import { toMarkdownText } from "@/lib/plain-text";
import { normalizeChatMarkdown } from "@/lib/import/chat-markdown";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toIsoDate(value: unknown): string | undefined {
  const seconds = asNumber(value);
  return seconds === undefined ? undefined : new Date(seconds * 1000).toISOString();
}

function extractText(message: JsonRecord): string {
  return normalizeChatMarkdown(toMarkdownText(message.content));
}

function extractRole(message: JsonRecord): MessageRole | undefined {
  const author = isRecord(message.author) ? message.author : {};
  const role = asString(author.role);
  return role === "user" ||
    role === "assistant" ||
    role === "system" ||
    role === "tool"
    ? role
    : undefined;
}

function activeBranch(mapping: JsonRecord, currentNodeId?: string): JsonRecord[] {
  if (!currentNodeId) {
    return Object.values(mapping)
      .filter(isRecord)
      .filter((node) => isRecord(node.message))
      .sort((left, right) => {
        const leftMessage = isRecord(left.message) ? left.message : {};
        const rightMessage = isRecord(right.message) ? right.message : {};
        return (asNumber(leftMessage.create_time) ?? 0) -
          (asNumber(rightMessage.create_time) ?? 0);
      });
  }

  const path: JsonRecord[] = [];
  const visited = new Set<string>();
  let nodeId: string | undefined = currentNodeId;

  while (nodeId && !visited.has(nodeId)) {
    visited.add(nodeId);
    const node = mapping[nodeId];
    if (!isRecord(node)) break;
    path.push(node);
    nodeId = asString(node.parent);
  }

  return path.reverse();
}

export function normalizeChatGptConversation(
  value: unknown,
  index = 0,
): NormalizedConversation | null {
  if (!isRecord(value)) return null;

  const mapping = isRecord(value.mapping) ? value.mapping : {};
  const nodes = activeBranch(mapping, asString(value.current_node));
  const messages: NormalizedMessage[] = [];

  for (const node of nodes) {
    if (!isRecord(node.message)) continue;
    const role = extractRole(node.message);
    const content = extractText(node.message);
    if (!role || !content) continue;

    messages.push({
      externalId: asString(node.message.id) ?? asString(node.id),
      parentExternalId: asString(node.parent),
      role,
      content,
      sourceCreatedAt: toIsoDate(node.message.create_time),
    });
  }

  if (!messages.some((message) => message.role === "user")) return null;

  return {
    externalId:
      asString(value.id) ??
      asString(value.conversation_id) ??
      `chatgpt-import-${index}`,
    title: asString(value.title) ?? `Imported chat ${index + 1}`,
    sourceCreatedAt: toIsoDate(value.create_time),
    messages,
  };
}

export function parseChatGptJson(json: string): NormalizedConversation[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected a ChatGPT conversations JSON array.");
  }

  return parsed
    .map(normalizeChatGptConversation)
    .filter((conversation): conversation is NormalizedConversation => conversation !== null);
}

export async function readChatGptExport(file: File): Promise<NormalizedConversation[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".json")) {
    return parseChatGptJson(await file.text());
  }

  if (!lowerName.endsWith(".zip")) {
    throw new Error("Choose a .zip ChatGPT export or conversations.json file.");
  }

  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  const conversationFiles = Object.values(zip.files)
    .filter((entry) =>
      !entry.dir &&
      /(^|\/)conversations(?:-\d+)?\.json$/i.test(entry.name)
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  if (conversationFiles.length === 0) {
    throw new Error("No conversations.json file was found in this ZIP.");
  }

  const batches = await Promise.all(
    conversationFiles.map(async (entry) => parseChatGptJson(await entry.async("string"))),
  );

  return batches.flat();
}
