import type { Contact } from './api';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** vCard 3.0 text for a contact (generated client-side; UTF-8). */
export const toVCard = (c: Contact) => {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(c.lastName ?? '')};${esc(c.firstName)};;;`, `FN:${esc(`${c.firstName} ${c.lastName ?? ''}`.trim())}`];
  if (c.company) lines.push(`ORG:${esc(c.company)}`);
  if (c.position) lines.push(`TITLE:${esc(c.position)}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET,PREF:${c.email}`);
  for (const e of c.emails) lines.push(`EMAIL;TYPE=INTERNET:${e}`);
  if (c.phone) lines.push(`TEL;TYPE=CELL:${esc(c.phone)}`);
  if (c.address) lines.push(`ADR;TYPE=WORK:;;${esc(c.address)};;;;`);
  if (c.tags.length) lines.push(`CATEGORIES:${c.tags.map(esc).join(',')}`);
  if (c.notes) lines.push(`NOTE:${esc(c.notes)}`);
  lines.push(`REV:${new Date().toISOString()}`, 'END:VCARD');
  return lines.join('\r\n') + '\r\n';
};

export const downloadText = (filename: string, text: string, type = 'text/plain') => {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadVCard = (c: Contact) => downloadText(`${`${c.firstName}-${c.lastName ?? ''}`.replace(/[^\w-]+/g, '_').replace(/_+$/, '')}.vcf`, toVCard(c), 'text/vcard');
