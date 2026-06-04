# STEP-06 — Import + document upload

**Goal:** Excel/CSV project import, executive bulk-import, executive image upload, and PD (position-description) upload behave identically, using Next.js file uploads instead of multer.

## Reference
- `server/routes/registrations/importProject.ts` — column-mapped bulk insert (`xlsx`).
- `server/routes/registrations/executives.ts` — `bulk-import` (Excel), `:id/image`.
- `server/routes/registrations/search.ts` — `upload-pd` (pdf/docx/txt → extracted text on the session; first ~20,000 chars).
- `server/routes/shared/upload.ts` — multer config (`upload`, `pdUpload`) — replaced by `req.formData()`.
- Libs kept: `xlsx`, `pdf-parse`, `mammoth` (run in Node route handlers).

## Build
- File intake: `const form = await req.formData(); const file = form.get("file") as File; const buf = Buffer.from(await file.arrayBuffer());` — replaces multer.
- `lib/services/import/excel.ts` — parse + column mapping (port from importProject.ts).
- `lib/services/import/document.ts` — `pdf-parse` / `mammoth` / plain text → text, truncate to the same char limit.
- Handlers: `import-project/route.ts` POST; `executives/bulk-import/route.ts` POST; `executives/[id]/image/route.ts` POST; `search/upload-pd/route.ts` POST.
- Preserve file-type validation and error messages.

## Test
- Unit: parse a fixture .xlsx → expected rows; parse fixture .pdf/.docx → expected text (and truncation boundary).
- Integration: multipart POST to each handler with a fixture file → same created records / stored text + same validation errors for bad types.

## Done when
Import/upload parity empty; parser units green. **Rollback:** route these paths back to Express.
