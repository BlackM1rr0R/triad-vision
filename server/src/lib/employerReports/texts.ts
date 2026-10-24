/** Texts of the monthly employer report (PDF + e-mail): German by default, English for English-speaking contacts. */

export type ReportLang = 'de' | 'en';

export const reportLangOf = (locale: string | null | undefined): ReportLang => (locale === 'en' ? 'en' : 'de');

const months = (lang: ReportLang, month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
};

export const fmtDay = (lang: ReportLang, iso: string | Date | null | undefined) => {
  if (!iso) return '—';
  // Calendar days ('YYYY-MM-DD', the report period) are shown as they are; instants in German time.
  if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)) iso = `${iso}T12:00:00Z`;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date(iso));
};

export const REPORT_TEXTS = {
  de: {
    monthLabel: (month: string) => months('de', month),
    docTitle: (month: string) => `Monatsbericht ${months('de', month)}`,
    heading: 'MONATSBERICHT',
    subheading: 'Ihre Mitarbeiter über Triad Vision',
    preparedFor: 'Erstellt für',
    generated: 'Erstellt am',
    period: 'Berichtszeitraum',
    summary: 'Zusammenfassung des Monats',
    kpi: { newPlacements: 'Neue Vermittlungen', approvals: 'Visa erteilt', arrivals: 'Ankünfte', departures: 'Ausgeschieden' },
    phases: 'Aktueller Stand',
    workers: 'Mitarbeiterübersicht',
    cols: { name: 'Name', position: 'Position', status: 'Status', arrival: 'Ankunft', title: 'Visum/Titel bis', probation: 'Probezeit bis', risk: 'Risiko' },
    noWorkers: 'Derzeit keine aktiven Mitarbeiter.',
    upcoming: 'Termine der nächsten 60 Tage',
    noUpcoming: 'Keine Termine in den nächsten 60 Tagen.',
    upcomingCode: { ARRIVAL: 'Anreise', PROBATION_END: 'Ende der Probezeit', TITLE_EXPIRY: 'Ablauf Visum/Aufenthaltstitel', APPOINTMENT: 'Botschaftstermin' } as Record<string, string>,
    risks: 'Risiken und Empfehlungen',
    noRisks: 'Keine erhöhten Risiken – alle Rückmeldungen sind unauffällig.',
    riskLevel: 'Risiko',
    recommended: 'Empfohlene Maßnahmen',
    noActions: 'Aktuell sind keine Maßnahmen Ihrerseits nötig.',
    checkIns: 'Rücklauf der Check-ins (letzte 6 Monate)',
    checkInEmployer: 'Ihre Rückmeldungen',
    checkInWorker: 'Rückmeldungen der Mitarbeiter',
    answered: (a: number, s: number, rate: number | null) => (s ? `${a} von ${s} beantwortet (${rate}%)` : 'Noch keine Check-ins versendet'),
    openItems: 'Offene Punkte für Sie',
    noOpenItems: 'Keine offenen Punkte.',
    openKind: { SIGNATURE: 'Unterschrift', FORM: 'Formular', CHECKIN: 'Check-in' } as Record<string, string>,
    contact: 'Fragen? Ihr Ansprechpartner bei Triad Vision hilft gern weiter – oder schreiben Sie uns über das Arbeitgeberportal.',
    confidential: 'Vertraulich – nur für den internen Gebrauch des Arbeitgebers. Enthält nur beschäftigungsrelevante Angaben.',
    page: 'Seite',
    of: 'von',
    portal: 'Live-Daten jederzeit im Arbeitgeberportal unter „Unsere Mitarbeiter“.',
    mailSubject: (month: string) => `Monatsbericht ${months('de', month)}: Ihre Mitarbeiter`,
    mailTitle: (month: string) => `Ihr Monatsbericht ${months('de', month)}`,
    mailBody: (p: { company: string; month: string; working: number; inProcess: number; arrivals: number; openItems: number; atRisk: number }) =>
      [
        `Guten Tag,`,
        `anbei erhalten Sie den Monatsbericht ${months('de', p.month)} für ${p.company} als PDF.`,
        `Kurz zusammengefasst: ${p.working} Mitarbeiter im Betrieb, ${p.inProcess} im Visumverfahren, ${p.arrivals} Ankunft(en) im Berichtsmonat.${p.openItems ? ` ${p.openItems} offene(r) Punkt(e) warten auf Sie.` : ''}${p.atRisk ? ` Bei ${p.atRisk} Mitarbeiter(n) empfehlen wir ein Gespräch.` : ''}`,
        'Den Bericht und alle Live-Daten finden Sie auch im Arbeitgeberportal. Sie können den monatlichen Bericht dort im Firmenprofil abbestellen.',
      ].join('\n\n'),
    mailCta: 'Im Portal öffnen',
    fileName: (month: string) => `Triad-Vision-Monatsbericht-${month}.pdf`,
  },
  en: {
    monthLabel: (month: string) => months('en', month),
    docTitle: (month: string) => `Monthly report ${months('en', month)}`,
    heading: 'MONTHLY REPORT',
    subheading: 'Your workers placed by Triad Vision',
    preparedFor: 'Prepared for',
    generated: 'Generated on',
    period: 'Reporting period',
    summary: 'Month at a glance',
    kpi: { newPlacements: 'New placements', approvals: 'Visas approved', arrivals: 'Arrivals', departures: 'Left' },
    phases: 'Current status',
    workers: 'Workers overview',
    cols: { name: 'Name', position: 'Position', status: 'Status', arrival: 'Arrival', title: 'Visa/title until', probation: 'Probation until', risk: 'Risk' },
    noWorkers: 'No active workers at the moment.',
    upcoming: 'Dates in the next 60 days',
    noUpcoming: 'No dates in the next 60 days.',
    upcomingCode: { ARRIVAL: 'Arrival', PROBATION_END: 'End of probation', TITLE_EXPIRY: 'Visa / residence title expires', APPOINTMENT: 'Embassy appointment' } as Record<string, string>,
    risks: 'Risks and recommendations',
    noRisks: 'No elevated risks – all feedback looks fine.',
    riskLevel: 'Risk',
    recommended: 'Recommended actions',
    noActions: 'No action needed from you at the moment.',
    checkIns: 'Check-in response rates (last 6 months)',
    checkInEmployer: 'Your responses',
    checkInWorker: 'Worker responses',
    answered: (a: number, s: number, rate: number | null) => (s ? `${a} of ${s} answered (${rate}%)` : 'No check-ins sent yet'),
    openItems: 'Open items for you',
    noOpenItems: 'No open items.',
    openKind: { SIGNATURE: 'Signature', FORM: 'Form', CHECKIN: 'Check-in' } as Record<string, string>,
    contact: 'Questions? Your Triad Vision contact is happy to help – or message us through the employer portal.',
    confidential: 'Confidential – for the employer’s internal use only. Contains employment-relevant information only.',
    page: 'Page',
    of: 'of',
    portal: 'Live data any time in the employer portal under “Our workers”.',
    mailSubject: (month: string) => `Monthly report ${months('en', month)}: your workers`,
    mailTitle: (month: string) => `Your monthly report ${months('en', month)}`,
    mailBody: (p: { company: string; month: string; working: number; inProcess: number; arrivals: number; openItems: number; atRisk: number }) =>
      [
        'Hello,',
        `please find attached the ${months('en', p.month)} report for ${p.company} as a PDF.`,
        `In short: ${p.working} worker(s) on the job, ${p.inProcess} in the visa process, ${p.arrivals} arrival(s) during the month.${p.openItems ? ` ${p.openItems} open item(s) are waiting for you.` : ''}${p.atRisk ? ` We recommend a conversation with ${p.atRisk} worker(s).` : ''}`,
        'The report and all live data are also available in the employer portal, where you can unsubscribe from the monthly report in the company profile.',
      ].join('\n\n'),
    mailCta: 'Open the portal',
    fileName: (month: string) => `Triad-Vision-monthly-report-${month}.pdf`,
  },
};
