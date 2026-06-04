import path from "path";

/** Cap on extracted brief/PD text persisted and returned — covers a typical JD with headroom. */
export const PD_TEXT_LIMIT = 20000;

/** Accepted brief/PD file extensions — keep in sync with the multer fileFilter and client `accept`. */
export const PD_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;

/**
 * Raised when extraction fails. `kind` maps to the HTTP status the route should return:
 * - "unsupported" → 400 (wrong file type)
 * - "parse"       → 422 (recognised type, but could not read it)
 */
export class BriefExtractError extends Error {
  constructor(public kind: "unsupported" | "parse", message: string) {
    super(message);
    this.name = "BriefExtractError";
  }
}

/**
 * Extract plain text from a brief/PD file buffer (PDF, DOCX, or TXT), strip PDF page
 * markers, and truncate to PD_TEXT_LIMIT. Throws BriefExtractError on bad type or parse failure.
 */
export async function extractBriefText(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  let text = "";

  if (ext === ".pdf") {
    try {
      // pdf-parse v2 ships as ESM with no @types; createRequire pulls the CJS build.
      // The v2 API is a PDFParse class (not the v1 callable): instantiate, getText, destroy.
      const { createRequire } = await import("module");
      const require = createRequire(import.meta.url);
      const { PDFParse } = require("pdf-parse") as {
        PDFParse: new (opts: { data: Buffer }) => {
          getText(): Promise<{ text: string }>;
          destroy(): Promise<void>;
        };
      };
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        // getText appends "-- N of M --" page markers; strip them for clean text.
        text = result.text.replace(/\n*-- \d+ of \d+ --\n*/g, "\n");
      } finally {
        await parser.destroy();
      }
    } catch (err: any) {
      throw new BriefExtractError("parse", `Failed to parse PDF: ${err.message}`);
    }
  } else if (ext === ".docx") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } catch (err: any) {
      throw new BriefExtractError("parse", `Failed to parse DOCX: ${err.message}`);
    }
  } else if (ext === ".txt") {
    text = buffer.toString("utf-8");
  } else {
    throw new BriefExtractError("unsupported", "Unsupported file type. Use PDF, DOCX, or TXT.");
  }

  text = text.substring(0, PD_TEXT_LIMIT);

  if (!text.trim()) {
    throw new BriefExtractError("parse", "Could not extract text from the file. It may be empty or image-based.");
  }

  return text;
}
