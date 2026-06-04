// @vitest-environment node
// Server-side extraction; pdf-parse needs Node globals (DOMMatrix), not jsdom.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { extractBriefText, BriefExtractError, PD_TEXT_LIMIT } from '../briefExtract';

const require = createRequire(import.meta.url);

/** Minimal single-page PDF whose content stream renders the given ASCII text. */
function makePdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${stream.length}>>stream
${stream}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

/** Minimal valid .docx (OOXML zip) containing a single paragraph of the given text. */
async function makeDocx(text: string): Promise<Buffer> {
  const JSZip = require('jszip');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('extractBriefText', () => {
  it('extracts text from a PDF (regression: pdf-parse v2 PDFParse class)', async () => {
    const out = await extractBriefText(makePdf('Hello JD Brief'), 'brief.pdf');
    expect(out).toContain('Hello JD Brief');
  });

  it('strips "-- N of M --" page markers pdf-parse v2 injects', async () => {
    const out = await extractBriefText(makePdf('Page One'), 'brief.pdf');
    expect(out).not.toMatch(/-- \d+ of \d+ --/);
  });

  it('extracts text from a DOCX', async () => {
    const out = await extractBriefText(await makeDocx('Senior Engineer role'), 'brief.docx');
    expect(out).toContain('Senior Engineer role');
  });

  it('extracts text from a TXT (UTF-8)', async () => {
    const out = await extractBriefText(Buffer.from('Plain brief — café', 'utf-8'), 'brief.txt');
    expect(out).toBe('Plain brief — café');
  });

  it('truncates to PD_TEXT_LIMIT', async () => {
    const out = await extractBriefText(Buffer.from('x'.repeat(PD_TEXT_LIMIT + 500)), 'big.txt');
    expect(out.length).toBe(PD_TEXT_LIMIT);
  });

  it('throws unsupported for unknown extensions', async () => {
    await expect(extractBriefText(Buffer.from('data'), 'sheet.xlsx')).rejects.toMatchObject({
      name: 'BriefExtractError',
      kind: 'unsupported',
    });
  });

  it('throws parse error for empty/whitespace-only text', async () => {
    await expect(extractBriefText(Buffer.from('   \n  '), 'empty.txt')).rejects.toBeInstanceOf(
      BriefExtractError,
    );
  });

  it('throws parse error for a corrupt PDF', async () => {
    await expect(
      extractBriefText(Buffer.from('%PDF-1.4 not really a pdf'), 'broken.pdf'),
    ).rejects.toMatchObject({ kind: 'parse' });
  });
});
