// ChatGPT sometimes exports its visual components as source rather than Markdown.
// Convert only that known vocabulary; ordinary HTML and programming examples stay intact.
const VISUAL_TAG = /<\/?(?:box|grid|grid-item|row|column|text|caption|icon)\b[^>]*>/gi;
const HAS_VISUAL = /<(?:box|grid|grid-item|row|column|text|caption|icon)\b/i;

function visualToMarkdown(source: string): string {
  const codeSpans: string[] = [];
  let expanded = source.replace(/(`+)([\s\S]*?)\1(?!`)/g, (code) => {
    const index = codeSpans.push(code) - 1;
    return `\u0000CHAT_CODE_${index}\u0000`;
  });
  // Expand literal diagram loops without evaluating imported expressions.
  expanded = expanded.replace(
    /\{#each\s+(\[[^\]\n]*\])\s+as\s+([a-zA-Z_$][\w$]*)\s*\}([\s\S]*?)\{\/each\}/g,
    (original, items: string, variable: string, body: string) => {
      try {
        const values: unknown = JSON.parse(items);
        if (!Array.isArray(values) || values.length > 30 || !values.every((value) => typeof value === "string" || typeof value === "number")) return original;
        return values.map((value) => body.split(`{${variable}}`).join(String(value))).join("\n\n");
      } catch {
        return original;
      }
    },
  );
  return expanded
    .replace(VISUAL_TAG, (tag) => {
      if (/^<icon\b/i.test(tag)) return /name=["']arrow-down["']/i.test(tag) ? "\n\n↓\n\n" : "";
      if (/^<\/text\s*>/i.test(tag)) return "\n\n";
      if (/^<text\b/i.test(tag)) return "\n\n";
      return "\n\n";
    })
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\u0000CHAT_CODE_(\d+)\u0000/g, (_, index: string) => codeSpans[Number(index)]);
}

export function normalizeChatMarkdown(source: string): string {
  const normalized = source.replace(/\r\n?/g, "\n");
  if (!HAS_VISUAL.test(normalized)) return source;

  // Preserve fenced code verbatim unless it contains only exported text components.
  const lines = normalized.split("\n");
  const result: string[] = [];
  let prose: string[] = [];
  const flush = () => {
    result.push(visualToMarkdown(prose.join("\n")));
    prose = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[index]);
    if (!opening) { prose.push(lines[index]); continue; }
    let end = index + 1;
    const closing = new RegExp(`^ {0,3}${opening[1][0]}{${opening[1].length},}\\s*$`);
    while (end < lines.length && !closing.test(lines[end])) end += 1;
    const body = lines.slice(index + 1, end).join("\n");
    const visualOnly = end < lines.length && !opening[2].trim() &&
      /<text\b/i.test(body) && !body.replace(/<text\b[^>]*>[^<]*<\/text>/gi, "").trim();
    if (visualOnly) {
      prose.push(body);
    } else {
      flush();
      result.push(lines.slice(index, Math.min(end + 1, lines.length)).join("\n"));
    }
    index = end;
  }
  flush();
  return result.filter(Boolean).join("\n\n").trim();
}
