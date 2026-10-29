import type { Locale } from '@prisma/client';

/**
 * Staff notifications of the team document workflow ("Schon geschrieben" → "Fertig", "Ablehnung"), in the
 * recipient's language. The German stage names stay as they are in every language (the team uses them).
 */

export const STAGE_LABEL: Record<string, string> = {
  IN_PROGRESS: 'In Bearbeitung',
  WRITTEN: 'Schon geschrieben',
  DONE: 'Fertig',
  REFUSED: 'Ablehnung',
};

export const stageLabel = (s: string | null | undefined) => (s ? (STAGE_LABEL[s] ?? s) : STAGE_LABEL.IN_PROGRESS!);

interface P {
  number: string;
  worker: string;
  by: string;
  stage: string;
  note: string | null;
}

interface Texts {
  assignedTitle: (p: P) => string;
  assignedBody: (p: P) => string;
  movedTitle: (p: P) => string;
  movedBody: (p: P) => string;
}

const noteLine = (label: string, note: string | null) => (note ? `\n${label}: ${note}` : '');

const T: Record<Locale, Texts> = {
  az: {
    assignedTitle: (p) => `${p.by} sənə «${p.stage}» göndərdi: ${p.worker} (${p.number})`,
    assignedBody: (p) => `${p.by} ${p.worker} üçün sənədləri «${p.stage}» mərhələsinə keçirdi və növbəti addımı sənə verdi. Sənəd siyahısına müraciətdə baxın.${noteLine('Qeyd', p.note)}`,
    movedTitle: (p) => `«${p.stage}»: ${p.worker} (${p.number})`,
    movedBody: (p) => `${p.by} sənin hazırladığın sənədləri «${p.stage}» mərhələsinə keçirdi.${noteLine('Qeyd', p.note)}`,
  },
  de: {
    assignedTitle: (p) => `${p.by} hat dir „${p.stage}“ geschickt: ${p.worker} (${p.number})`,
    assignedBody: (p) => `${p.by} hat die Unterlagen von ${p.worker} auf „${p.stage}“ gesetzt und dir den nächsten Schritt gegeben. Die Dokumentliste steht im Fall.${noteLine('Notiz', p.note)}`,
    movedTitle: (p) => `„${p.stage}“: ${p.worker} (${p.number})`,
    movedBody: (p) => `${p.by} hat die von dir vorbereiteten Unterlagen auf „${p.stage}“ gesetzt.${noteLine('Notiz', p.note)}`,
  },
  en: {
    assignedTitle: (p) => `${p.by} sent you "${p.stage}": ${p.worker} (${p.number})`,
    assignedBody: (p) => `${p.by} moved the documents of ${p.worker} to "${p.stage}" and handed the next step to you. The document list is on the case.${noteLine('Note', p.note)}`,
    movedTitle: (p) => `"${p.stage}": ${p.worker} (${p.number})`,
    movedBody: (p) => `${p.by} moved the documents you prepared to "${p.stage}".${noteLine('Note', p.note)}`,
  },
  ru: {
    assignedTitle: (p) => `${p.by} отправил(а) вам «${p.stage}»: ${p.worker} (${p.number})`,
    assignedBody: (p) => `${p.by} перевёл(а) документы клиента ${p.worker} в этап «${p.stage}» и передал(а) вам следующий шаг. Список документов — в деле.${noteLine('Заметка', p.note)}`,
    movedTitle: (p) => `«${p.stage}»: ${p.worker} (${p.number})`,
    movedBody: (p) => `${p.by} перевёл(а) подготовленные вами документы в этап «${p.stage}».${noteLine('Заметка', p.note)}`,
  },
};

export const processingTexts = (l: Locale | null | undefined): Texts => T[l ?? 'az'] ?? T.az;
