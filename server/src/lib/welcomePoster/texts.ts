/**
 * Texts of the bilingual (Azerbaijani / German) welcome poster for a worker's first work day
 * (lib/welcomePoster/pdf.ts). The poster is always printed in both languages, whatever the portal language.
 */

export const POSTER_TEXT = {
  welcomeAz: (name: string) => (name ? `Xoş gəlmisiniz, ${name}!` : 'Xoş gəlmisiniz!'),
  welcomeDe: (name: string) => (name ? `Herzlich willkommen, ${name}!` : 'Herzlich willkommen!'),
  team: 'Ihr Team · Komandanız',
  teamHint: 'Foto oder Unterschrift · Şəkil və ya imza',
  phrases: 'Wichtige Sätze am Arbeitsplatz · İş yerində vacib ifadələr',
  contact: 'Ihre Ansprechperson · Əlaqə şəxsiniz',
  firstDay: 'Erster Arbeitstag · İlk iş günü',
} as const;

/** Key workplace phrases: [German, Azerbaijani]. */
export const POSTER_PHRASES: readonly (readonly [string, string])[] = [
  ['Guten Morgen!', 'Sabahınız xeyir!'],
  ['Pause', 'Fasilə'],
  ['Feierabend', 'İş gününün sonu'],
  ['Wo ist …?', '… haradadır?'],
  ['Ich habe eine Frage.', 'Bir sualım var.'],
  ['Können Sie das bitte wiederholen?', 'Zəhmət olmasa, bunu təkrar edə bilərsiniz?'],
  ['Ich verstehe das nicht.', 'Bunu başa düşmürəm.'],
  ['Ich bin krank und kann heute nicht arbeiten.', 'Xəstəyəm, bu gün işə gələ bilməyəcəyəm.'],
  ['Vorsicht!', 'Ehtiyatlı olun!'],
  ['Vielen Dank!', 'Çox sağ olun!'],
];

/** The contact person / buddy the company noted on the BUDDY checklist item: first line of the note, ≤ 80 chars. */
export const contactFromNote = (note: string | null | undefined) => {
  const line = (note ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  return line ? line.slice(0, 80) : null;
};
