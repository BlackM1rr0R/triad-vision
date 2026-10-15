# Document intelligence (passport OCR, embassy packet, form auto-fill)

## Passport OCR (MRZ)

Uploaded passport scans (JPEG/PNG/WebP under the `PASSPORT` requirement) are read with
[tesseract.js](https://github.com/naptha/tesseract.js) and the ICAO 9303 MRZ (the two 44-character lines
at the bottom of the data page) is parsed with check-digit validation (`src/lib/docsIntel/mrz.ts`).
A valid MRZ fills the empty profile fields of the client (passport number, expiry, birth date,
nationality as ISO-3 code) and raises a warning (in-app notification to client and staff, case event)
when the passport expires within 12 months.

- Job `ocr` (`src/jobs/ocr.ts`): every 60 s, up to 5 new images, passports first. Failures are stored
  on the document (`ocr: { error }`, `ocrAt` set) so nothing is retried forever.
- `POST /api/documents/:docId/ocr` runs OCR for one document right away (30 s guard);
  `GET /api/documents/:docId/ocr` returns the stored result;
  `POST /api/documents/:docId/ocr/apply` writes the extracted data into the profile (overwrites).
- PDFs are not rasterised: they are marked `ocr: { skipped: 'pdf' }`.

### Language data (required, never downloaded at runtime)

The API only reads `eng.traineddata` or `eng.traineddata.gz` from `server/ocr/` (override with
`TESSERACT_LANG_PATH=/path/to/dir`). Fetch it once per deployment:

```bash
cd server
node scripts/fetch-ocr-data.mjs
```

The script downloads `eng.traineddata.gz` (~3 MB) from the tesseract.js data CDN with the tessdata
GitHub mirror as fallback. Without network, copy the file into the directory by hand. While the file is
missing the job logs one warning and does nothing; the manual endpoint answers `503 OCR_UNAVAILABLE`.

The directory is git-ignored except for `.gitkeep`. In Docker, mount or copy it into the image, e.g.

```dockerfile
COPY server/ocr/eng.traineddata.gz /app/server/ocr/
```

## Embassy packet

`GET /api/documents/cases/:caseId/packet` builds one PDF (pdf-lib): branded cover page with case data and
a table of contents, then every accepted document (initial stage, embassy stage, the signed contract),
each behind a divider page. JPEG/PNG are embedded scaled to A4, PDFs are copied page by page, other
formats (WebP, Word) are listed as "attached separately". Page footers read `n / N`.

- Staff (with 2FA) always; the client once the case reached the embassy step (`EMBASSY_DOCUMENTS` or later).
- `?store=1` also saves the packet as a case document (stage `OTHER`, visible to the client) and returns JSON.

## Form auto-fill

`GET /api/documents/cases/:caseId/forms/:form` with `videx-summary`, `employer-letter` or `contract-cover`.
Values come from the profile, the case, the employer (`case.company`) and the passport MRZ. Missing data is
drawn as a highlighted `____` placeholder; the missing profile fields are listed in the `X-Missing-Fields`
response header (comma separated) and shown in the UI.

## Requirement templates

`/api/admin/requirements` (admin page `/admin/requirements`) manages which documents a NEW case asks for,
globally or per visa type (`RequirementTemplate`). Precedence when a case is created: the visa type's own
templates, else the global set, else the built-in defaults in `src/lib/docsIntel/requirementTemplates.ts`.
`npm run seed` creates the global set from the built-in defaults (`prisma/seed/requirements.ts`).
