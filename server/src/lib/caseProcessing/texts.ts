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
  /** "X took it" — to the sender (and a colleague it was taken from). */
  claimedTitle: (p: P) => string;
  claimedBody: (p: P) => string;
  /** Appended to the "Schon geschrieben" hand-over: open the folder and press "Götür". */
  claimHint: string;
  /** Short call to action after the "Schon geschrieben" title: "… — götür". */
  claimShort: string;
}

const noteLine = (label: string, note: string | null) => (note ? `\n${label}: ${note}` : '');

const T: Record<Locale, Texts> = {
  az: {
    assignedTitle: (p) => `${p.by} sənə «${p.stage}» göndərdi: ${p.worker} (${p.number})`,
    assignedBody: (p) => `${p.by} ${p.worker} üçün sənədləri «${p.stage}» mərhələsinə keçirdi və növbəti addımı sənə verdi. Sənəd siyahısına müraciətdə baxın.${noteLine('Qeyd', p.note)}`,
    movedTitle: (p) => `«${p.stage}»: ${p.worker} (${p.number})`,
    movedBody: (p) => `${p.by} sənin hazırladığın sənədləri «${p.stage}» mərhələsinə keçirdi.${noteLine('Qeyd', p.note)}`,
    claimedTitle: (p) => `${p.by} götürdü: ${p.worker} (${p.number})`,
    claimedBody: (p) => `${p.by} «${p.stage}» mərhələsindəki sənədləri götürdü və üzərində işləyir.`,
    claimHint: 'Sənədlər bölməsində qovluğu açın və «Götür» düyməsini basın.',
    claimShort: 'götür',
  },
  de: {
    assignedTitle: (p) => `${p.by} hat dir „${p.stage}“ geschickt: ${p.worker} (${p.number})`,
    assignedBody: (p) => `${p.by} hat die Unterlagen von ${p.worker} auf „${p.stage}“ gesetzt und dir den nächsten Schritt gegeben. Die Dokumentliste steht im Fall.${noteLine('Notiz', p.note)}`,
    movedTitle: (p) => `„${p.stage}“: ${p.worker} (${p.number})`,
    movedBody: (p) => `${p.by} hat die von dir vorbereiteten Unterlagen auf „${p.stage}“ gesetzt.${noteLine('Notiz', p.note)}`,
    claimedTitle: (p) => `${p.by} hat übernommen: ${p.worker} (${p.number})`,
    claimedBody: (p) => `${p.by} hat die Unterlagen in „${p.stage}“ übernommen und arbeitet daran.`,
    claimHint: 'Öffne den Ordner in den Dokumenten und klicke auf „Übernehmen“.',
    claimShort: 'übernehmen',
  },
  en: {
    assignedTitle: (p) => `${p.by} sent you "${p.stage}": ${p.worker} (${p.number})`,
    assignedBody: (p) => `${p.by} moved the documents of ${p.worker} to "${p.stage}" and handed the next step to you. The document list is on the case.${noteLine('Note', p.note)}`,
    movedTitle: (p) => `"${p.stage}": ${p.worker} (${p.number})`,
    movedBody: (p) => `${p.by} moved the documents you prepared to "${p.stage}".${noteLine('Note', p.note)}`,
    claimedTitle: (p) => `${p.by} took it: ${p.worker} (${p.number})`,
    claimedBody: (p) => `${p.by} took the documents in "${p.stage}" and is working on them.`,
    claimHint: 'Open the folder in Documents and press "Take".',
    claimShort: 'take it',
  },
  ru: {
    assignedTitle: (p) => `${p.by} отправил(а) вам «${p.stage}»: ${p.worker} (${p.number})`,
    assignedBody: (p) => `${p.by} перевёл(а) документы клиента ${p.worker} в этап «${p.stage}» и передал(а) вам следующий шаг. Список документов — в деле.${noteLine('Заметка', p.note)}`,
    movedTitle: (p) => `«${p.stage}»: ${p.worker} (${p.number})`,
    movedBody: (p) => `${p.by} перевёл(а) подготовленные вами документы в этап «${p.stage}».${noteLine('Заметка', p.note)}`,
    claimedTitle: (p) => `${p.by} взял(а) в работу: ${p.worker} (${p.number})`,
    claimedBody: (p) => `${p.by} взял(а) документы этапа «${p.stage}» и работает над ними.`,
    claimHint: 'Откройте папку в разделе «Документы» и нажмите «Взять».',
    claimShort: 'возьмите',
  },
};

export const processingTexts = (l: Locale | null | undefined): Texts => T[l ?? 'az'] ?? T.az;
