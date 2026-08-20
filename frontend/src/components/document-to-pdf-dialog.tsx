"use client";

import { useRef, useState } from "react";
import { FileDown, FileText, ShieldCheck, Upload } from "lucide-react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface DocumentToPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PdfLine = { text: string; style: "body" | "heading" | "subheading" | "code" | "blank" };

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .trimEnd();
}

function parseDocument(content: string, markdown: boolean): PdfLine[] {
  let inCode = false;
  return content.replace(/\r\n?/g, "\n").split("\n").flatMap<PdfLine>((source): PdfLine[] => {
    if (markdown && /^\s*```/.test(source)) {
      inCode = !inCode;
      return [];
    }
    if (!source.trim()) return [{ text: "", style: "blank" as const }];
    if (inCode) return [{ text: source.replace(/\t/g, "    "), style: "code" as const }];
    if (!markdown) return [{ text: source, style: "body" as const }];
    const heading = source.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      return [{
        text: cleanInlineMarkdown(heading[2]),
        style: heading[1].length <= 2 ? "heading" as const : "subheading" as const,
      }];
    }
    const text = source
      .replace(/^\s*[-*+]\s+/, "- ")
      .replace(/^\s*>\s?/, "  ");
    return [{ text: cleanInlineMarkdown(text), style: "body" as const }];
  });
}

function safePdfName(value: string): string {
  const cleaned = value.trim().replace(/\.pdf$/i, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");
  return `${cleaned || "ChatSaver document"}.pdf`;
}

function createPdf(content: string, sourceName: string, outputName: string): void {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const margin = 18;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const title = outputName.replace(/\.pdf$/i, "");
  let y = 21;

  pdf.setTextColor(35, 24, 26);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(19);
  for (const line of pdf.splitTextToSize(title, contentWidth) as string[]) {
    pdf.text(line, margin, y);
    y += 8;
  }
  pdf.setDrawColor(185, 18, 52);
  pdf.setLineWidth(0.7);
  pdf.line(margin, y + 1, margin + 28, y + 1);
  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(120, 112, 114);
  pdf.text(`Converted from ${sourceName} with ChatSaver`, margin, y);
  y += 10;

  const lines = parseDocument(content, /\.md$/i.test(sourceName));
  for (const line of lines) {
    if (line.style === "blank") {
      y += 4;
      continue;
    }
    const fontSize = line.style === "heading" ? 15 : line.style === "subheading" ? 12 : line.style === "code" ? 9 : 10.5;
    const lineHeight = fontSize * 0.42 + 1.5;
    pdf.setFont(line.style === "code" ? "courier" : "helvetica", line.style.includes("heading") ? "bold" : "normal");
    pdf.setFontSize(fontSize);
    pdf.setTextColor(line.style.includes("heading") ? 55 : 42, line.style.includes("heading") ? 24 : 38, line.style.includes("heading") ? 29 : 40);
    const wrapped = pdf.splitTextToSize(line.text || " ", contentWidth) as string[];
    for (const part of wrapped) {
      if (y + lineHeight > pageHeight - 18) {
        pdf.addPage();
        y = 19;
      }
      if (line.style === "code") {
        pdf.setFillColor(246, 243, 243);
        pdf.rect(margin - 2, y - 4, contentWidth + 4, lineHeight + 1, "F");
      }
      pdf.text(part, margin, y);
      y += lineHeight;
    }
    y += line.style.includes("heading") ? 3 : 1.5;
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(135, 127, 129);
    pdf.text(title, margin, pageHeight - 9, { maxWidth: contentWidth - 25 });
    pdf.text(`${page} / ${pages}`, pageWidth - margin, pageHeight - 9, { align: "right" });
  }
  pdf.save(outputName);
}

export function DocumentToPdfDialog({ open, onOpenChange }: DocumentToPdfDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [outputName, setOutputName] = useState("");
  const [busy, setBusy] = useState(false);

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    if (!/\.(txt|md)$/i.test(nextFile.name)) {
      toast.error("Choose a .txt or .md file.");
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      toast.error("Text files must be smaller than 10 MB.");
      return;
    }
    setFile(nextFile);
    setOutputName(nextFile.name.replace(/\.(txt|md)$/i, ""));
  }

  async function convert() {
    if (!file) return;
    setBusy(true);
    try {
      const name = safePdfName(outputName);
      createPdf(await file.text(), file.name, name);
      toast.success(`${name} downloaded`);
      onOpenChange(false);
    } catch {
      toast.error("The PDF could not be created from this file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg gap-0 overflow-hidden border-white/10 bg-card/96 p-0 shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="border-b border-white/8 px-5 py-5 text-left sm:px-6">
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <FileDown className="size-5" />
          </div>
          <DialogTitle className="text-xl tracking-[-0.03em]">Convert text to PDF</DialogTitle>
          <DialogDescription className="leading-6">
            Turn a TXT or Markdown file into a clean, paginated PDF with your own filename.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <button
            type="button"
            className="flex w-full items-center gap-4 rounded-2xl border border-dashed border-white/14 bg-black/18 p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/6"
            onClick={() => inputRef.current?.click()}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              {file ? <FileText /> : <Upload />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{file?.name ?? "Choose a TXT or Markdown file"}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {file ? `${(file.size / 1024).toFixed(1)} KB - stored only on this device` : "Up to 10 MB - processed privately on this device"}
              </span>
            </span>
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />

          <label className="block space-y-2 text-xs font-medium">
            PDF filename
            <Input
              value={outputName}
              onChange={(event) => setOutputName(event.target.value)}
              placeholder="My document"
              disabled={!file || busy}
            />
          </label>

          <div className="flex items-center gap-2 rounded-xl border border-white/7 bg-black/12 px-3 py-2.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-emerald-300" />
            Conversion happens locally. Your document is never uploaded.
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 border-t border-white/8 bg-black/15 px-5 py-4 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="royal-glow" disabled={!file || !outputName.trim() || busy} onClick={() => void convert()}>
            <FileDown />
            {busy ? "Creating PDF…" : "Download PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
