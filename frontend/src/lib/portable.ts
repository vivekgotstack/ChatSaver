import type { Note, NoteBlock, VaultBackup } from "@/domain/models";
import { toMarkdownText, toPlainText } from "@/lib/plain-text";

function safeFilename(value: string): string {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 90);
  return normalized || "untitled-note";
}

export function noteToPlainText(note: Note, blocks: NoteBlock[]): string {
  const markdownBlock = note.source === "markdown" ? blocks[0] : undefined;
  if (markdownBlock) {
    return [toPlainText(note.title) || "Untitled note", "", toPlainText(markdownBlock.answer)]
      .join("\n")
      .trimEnd();
  }
  const separator = "=".repeat(72);
  const sections = [...blocks]
    .sort((left, right) => left.position - right.position)
    .map((block, index) => {
      const question = toPlainText(block.question) || "Untitled question";
      const answer = toPlainText(block.answer) || "No answer yet.";
      return [
        `QUESTION ${index + 1}`,
        question,
        separator,
        `ANSWER ${index + 1}`,
        answer,
        separator,
      ].join("\n\n");
    });

  const title = toPlainText(note.title) || "Untitled note";

  return [
    separator,
    title,
    separator,
    "",
    `Exported from ChatSaver on ${new Date().toLocaleDateString()}.`,
    "",
    separator,
    "",
    ...sections.flatMap((section, index) => (index ? ["", section] : [section])),
    "",
  ].join("\n");
}

export function noteToMarkdown(note: Note, blocks: NoteBlock[]): string {
  const title = toPlainText(note.title) || "Untitled note";
  const markdownBlock = note.source === "markdown" ? blocks[0] : undefined;
  if (markdownBlock) {
    return [`# ${title}`, "", toMarkdownText(markdownBlock.answer), ""].join("\n");
  }
  const sections = [...blocks]
    .sort((left, right) => left.position - right.position)
    .flatMap((block, index) => {
      const question = toMarkdownText(block.question) || "_Untitled question_";
      const answer = toMarkdownText(block.answer) || "_No answer yet._";
      return [
        `## Question ${index + 1}`,
        "",
        question,
        "",
        `## Answer ${index + 1}`,
        "",
        answer,
      ];
    });

  return [
    `# ${title}`,
    "",
    `> Exported from ChatSaver on ${new Date().toLocaleDateString()}.`,
    "",
    ...sections.flatMap((line, index) =>
      index > 0 && /^## Question /.test(line) ? ["---", "", line] : [line]
    ),
    "",
  ].join("\n");
}

export function downloadTextFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadNoteMarkdown(note: Note, blocks: NoteBlock[]): void {
  downloadTextFile(
    `${safeFilename(note.title)}.md`,
    noteToMarkdown(note, blocks),
    "text/markdown;charset=utf-8",
  );
}

export function downloadVaultBackup(backup: VaultBackup): void {
  const day = backup.exportedAt.slice(0, 10);
  downloadTextFile(
    `chatsaver-vault-${day}.json`,
    JSON.stringify(backup, null, 2),
    "application/json;charset=utf-8",
  );
}
