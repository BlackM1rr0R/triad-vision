/**
 * Prints a self-contained document (cover letter, checklist) from a new window, so the site header and footer
 * stay out of the printout; "Save as PDF" in the browser's print dialog makes the PDF. Falls back to a .txt
 * download when the window is blocked. Browser only; call from a click handler.
 */
export const printDocument = (title: string, bodyHtml: string, fallbackText: string, fallbackName: string) => {
  const w = window.open('', '_blank', 'noopener=no,width=820,height=1000');
  if (!w) {
    downloadText(fallbackText, fallbackName);
    return;
  }
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font: 11pt/1.5 Arial, Helvetica, sans-serif; color: #111; background: #fff; margin: 0 auto; max-width: 170mm; padding: 12mm 0; }
  pre { white-space: pre-wrap; font: inherit; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 4mm; }
  h2 { font-size: 12pt; margin: 6mm 0 2mm; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; gap: 3mm; padding: 1.5mm 0; border-bottom: 1px solid #ddd; break-inside: avoid; }
  li::before { content: ''; flex: none; width: 4mm; height: 4mm; margin-top: 1mm; border: 1.5px solid #333; border-radius: 1mm; }
  .muted { color: #555; font-size: 9pt; }
  a { color: #111; }
</style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
};

/** Saves text as a UTF-8 file. */
export const downloadText = (text: string, filename: string) => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
