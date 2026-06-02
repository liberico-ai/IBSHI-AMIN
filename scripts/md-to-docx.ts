import { readFileSync, writeFileSync } from "fs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
} from "docx";

// Đơn giản hoá: parse markdown -> docx paragraphs
// Hỗ trợ: # ## ### #### , > blockquote, - / 1. list, |table|, ``` code, **bold** *italic* `code` [text](link)

type InlineRun = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

function parseInline(s: string): InlineRun[] {
  // Tách theo các pattern: **bold**, *italic*, `code`, [text](url)→text
  const runs: InlineRun[] = [];
  let i = 0;
  const push = (text: string, attr: Partial<InlineRun> = {}) => {
    if (!text) return;
    runs.push({ text, ...attr });
  };
  // Bỏ ký tự link [text](url) -> text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  while (i < s.length) {
    if (s.startsWith("**", i)) {
      const end = s.indexOf("**", i + 2);
      if (end !== -1) {
        push(s.slice(i + 2, end), { bold: true });
        i = end + 2;
        continue;
      }
    }
    if (s.startsWith("*", i) && s[i + 1] !== " ") {
      const end = s.indexOf("*", i + 1);
      if (end !== -1) {
        push(s.slice(i + 1, end), { italic: true });
        i = end + 1;
        continue;
      }
    }
    if (s[i] === "`") {
      const end = s.indexOf("`", i + 1);
      if (end !== -1) {
        push(s.slice(i + 1, end), { code: true });
        i = end + 1;
        continue;
      }
    }
    // Thường
    let j = i;
    while (j < s.length && !["*", "`"].includes(s[j])) j++;
    push(s.slice(i, j));
    i = j;
  }
  return runs;
}

function inlineToTextRuns(s: string, baseSize = 22): TextRun[] {
  return parseInline(s).map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic,
        font: r.code ? "Consolas" : "Times New Roman",
        size: baseSize,
        color: r.code ? "B91C1C" : undefined,
      })
  );
}

function mdToDocx(md: string): (Paragraph | Table)[] {
  const lines = md.split(/\r?\n/);
  const out: (Paragraph | Table)[] = [];
  let i = 0;
  let inCode = false;
  let codeBuf: string[] = [];

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Code fence
    if (line.startsWith("```")) {
      if (inCode) {
        // close
        out.push(
          new Paragraph({
            shading: { type: "clear", fill: "F3F4F6" } as any,
            spacing: { before: 80, after: 80 },
            children: codeBuf.map(
              (cl) =>
                new TextRun({
                  text: cl + "\n",
                  font: "Consolas",
                  size: 20,
                  break: 0,
                })
            ),
          })
        );
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      i++;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].replace(/[#]+$/, "").trim();
      const size = [40, 32, 28, 26, 24, 22][level - 1] || 22;
      out.push(
        new Paragraph({
          heading:
            level === 1
              ? HeadingLevel.HEADING_1
              : level === 2
              ? HeadingLevel.HEADING_2
              : level === 3
              ? HeadingLevel.HEADING_3
              : HeadingLevel.HEADING_4,
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text,
              bold: true,
              size,
              font: "Times New Roman",
              color: level === 1 ? "1E40AF" : level === 2 ? "1D4ED8" : "111827",
            }),
          ],
        })
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line)) {
      out.push(
        new Paragraph({
          spacing: { before: 120, after: 120 },
          border: {
            bottom: { color: "9CA3AF", space: 1, style: BorderStyle.SINGLE, size: 6 },
          },
          children: [],
        })
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const text = line.slice(2);
      out.push(
        new Paragraph({
          spacing: { before: 80, after: 80 },
          indent: { left: 360 },
          shading: { type: "clear", fill: "F9FAFB" } as any,
          children: inlineToTextRuns(text),
        })
      );
      i++;
      continue;
    }

    // Table
    if (line.startsWith("|") && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
      const headerCells = line
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      const rows: string[][] = [];
      i += 2; // skip header & separator
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i]
          .trim()
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        rows.push(row);
        i++;
      }
      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: headerCells.map(
              (c) =>
                new TableCell({
                  shading: { fill: "1E40AF" } as any,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: c,
                          bold: true,
                          color: "FFFFFF",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                  ],
                })
            ),
          }),
          ...rows.map(
            (r) =>
              new TableRow({
                children: r.map(
                  (c) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: inlineToTextRuns(c),
                        }),
                      ],
                    })
                ),
              })
          ),
        ],
      });
      out.push(table);
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }

    // List (- / * / 1.)
    const ul = line.match(/^(\s*)[-*]\s+(.+)$/);
    const ol = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (ul || ol) {
      const m = ul || ol!;
      const indent = Math.floor(m[1].length / 2);
      let text = m[2];
      // checkbox
      let prefix = ul ? "• " : `${ol![0].trim().split(".")[0]}. `;
      const cb = text.match(/^\[([ xX])\]\s+(.+)$/);
      if (cb) {
        prefix = cb[1].trim() ? "☑ " : "☐ ";
        text = cb[2];
      }
      out.push(
        new Paragraph({
          spacing: { after: 60 },
          indent: { left: 360 + indent * 360 },
          children: [
            new TextRun({ text: prefix, font: "Times New Roman", size: 22 }),
            ...inlineToTextRuns(text),
          ],
        })
      );
      i++;
      continue;
    }

    // Blank line
    if (line === "") {
      out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      i++;
      continue;
    }

    // Regular paragraph
    out.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 80 },
        children: inlineToTextRuns(line),
      })
    );
    i++;
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: tsx scripts/md-to-docx.ts <input.md> [output.docx]");
    process.exit(1);
  }
  const input = args[0];
  const output = args[1] || input.replace(/\.md$/i, ".docx");
  const md = readFileSync(input, "utf8");

  const blocks = mdToDocx(md);
  const doc = new Document({
    creator: "IBSHI-AMIN",
    title: input,
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        children: blocks,
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  writeFileSync(output, buf);
  console.log(`✓ Wrote ${output} (${buf.length} bytes, ${blocks.length} blocks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
