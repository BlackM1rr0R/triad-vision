import type { Locale } from '@prisma/client';

/**
 * Texts of the recognition tracker and the § 81a procedure in the recipient's language (notifications,
 * tasks, case events), plus the German documents sent to German authorities (Vollmacht, submission e-mail).
 */

export interface DeadlineP {
  worker: string;
  number: string;
  what: string;
  date: string;
  days: number;
}
interface ClientStatusP {
  firstName: string;
  procedure: string;
  status: string;
}
interface EmployerP {
  worker: string;
  number: string;
  fee?: string;
}

type Texts = {
  procedure: Record<string, string>;
  status: Record<string, string>;
  accelDeadline: Record<'APPOINTMENT' | 'DECISION' | 'REPLY' | 'FEE', string>;
  recognitionDeadline: Record<'NEXT' | 'ADAPTATION', string>;
  dueTitle: (p: DeadlineP) => string;
  dueBody: (p: DeadlineP) => string;
  dueTask: (p: DeadlineP) => string;
  overdueTitle: (p: DeadlineP) => string;
  overdueBody: (p: DeadlineP) => string;
  clientStatusTitle: string;
  clientStatusBody: (p: ClientStatusP) => string;
  clientCta: string;
  employerAgreementTitle: (p: EmployerP) => string;
  employerAgreementBody: (p: EmployerP) => string;
  employerFeeTitle: (p: EmployerP) => string;
  employerFeeBody: (p: EmployerP) => string;
  employerPreApprovalTitle: (p: EmployerP) => string;
  employerPreApprovalBody: (p: EmployerP) => string;
  employerCta: string;
  clientPreApprovalTitle: string;
  clientPreApprovalBody: (p: { firstName: string; date: string }) => string;
};

const T: Record<Locale, Texts> = {
  az: {
    procedure: {
      ZAB_STATEMENT: 'ZAB diplom qiymətləndirməsi',
      FULL_RECOGNITION: 'Tam tanınma',
      PARTIAL_RECOGNITION: 'Qismən tanınma',
      IHK_FOSA: 'IHK FOSA (peşə ixtisası)',
      HWK: 'Sənətkarlar palatası (HWK)',
    },
    status: {
      PREPARING: 'hazırlanır',
      SUBMITTED: 'təqdim olunub',
      IN_REVIEW: 'baxılır',
      DEFICIT_NOTICE: 'çatışmazlıq qərarı (Defizitbescheid)',
      ADAPTATION: 'uyğunlaşdırma tədbiri gedir',
      RECOGNISED: 'tanınıb',
      PARTIALLY_RECOGNISED: 'qismən tanınıb',
      REJECTED: 'rədd edilib',
      WITHDRAWN: 'geri götürülüb',
    },
    accelDeadline: { APPOINTMENT: 'Səfirlikdə görüş (3 həftə ərzində)', DECISION: 'Səfirliyin qərarı (adətən 3 həftə)', REPLY: 'İdarəyə cavab', FEE: '411 € rüsumun ödənişi' },
    recognitionDeadline: { NEXT: 'Tanınma: növbəti son tarix', ADAPTATION: 'Uyğunlaşdırma tədbirinin sonu' },
    dueTitle: (p) => `Son tarix yaxınlaşır: ${p.worker} (${p.number})`,
    dueBody: (p) => `${p.what} — ${p.date} (${p.days} gün qalıb).`,
    dueTask: (p) => `${p.what} ${p.date}: ${p.worker} (${p.number})`,
    overdueTitle: (p) => `Son tarix keçib: ${p.worker} (${p.number})`,
    overdueBody: (p) => `${p.what} — son tarix ${p.date} idi. Zəhmət olmasa vəziyyəti yoxlayın və tarixi yeniləyin.`,
    clientStatusTitle: 'Diplomunuzun tanınması: yeni status',
    clientStatusBody: (p) => `Salam, ${p.firstName}! ${p.procedure}: status indi “${p.status}”. Ətraflı məlumat portalda.`,
    clientCta: 'Müraciətə bax',
    employerAgreementTitle: (p) => `Sürətləndirilmiş prosedur (§ 81a): ${p.worker}`,
    employerAgreementBody: (p) => `${p.worker} (${p.number}) üçün sürətləndirilmiş prosedura başladıq. Növbəti addım: Ausländerbehörde ilə razılaşmanın (Vereinbarung) imzalanması — sənədi sizə hazırlayırıq.`,
    employerFeeTitle: (p) => `§ 81a rüsumu ödənilməlidir: ${p.worker}`,
    employerFeeBody: (p) => `Ausländerbehörde ${p.worker} (${p.number}) üçün sürətləndirilmiş prosedurun rüsumunu (${p.fee ?? '411 €'}) tələb edib. Zəhmət olmasa ödəyin və bizə bildirin.`,
    employerPreApprovalTitle: (p) => `İlkin razılıq verildi: ${p.worker}`,
    employerPreApprovalBody: (p) => `Ausländerbehörde ${p.worker} (${p.number}) üçün ilkin razılığı (Vorabzustimmung) verdi. Səfirlik adətən 3 həftə ərzində görüş təyin edir.`,
    employerCta: 'İşçiyə bax',
    clientPreApprovalTitle: 'İlkin razılıq (Vorabzustimmung) verildi',
    clientPreApprovalBody: (p) => `Salam, ${p.firstName}! Ausländerbehörde ilkin razılığı verdi. Səfirlik adətən 3 həftə ərzində (təxminən ${p.date} tarixinə qədər) görüş təyin edir — menecerniz sizinlə əlaqə saxlayacaq.`,
  },
  de: {
    procedure: {
      ZAB_STATEMENT: 'ZAB-Zeugnisbewertung',
      FULL_RECOGNITION: 'Volle Anerkennung',
      PARTIAL_RECOGNITION: 'Teilanerkennung',
      IHK_FOSA: 'IHK FOSA (Berufsabschluss)',
      HWK: 'Handwerkskammer (HWK)',
    },
    status: {
      PREPARING: 'in Vorbereitung',
      SUBMITTED: 'eingereicht',
      IN_REVIEW: 'in Prüfung',
      DEFICIT_NOTICE: 'Defizitbescheid',
      ADAPTATION: 'Ausgleichsmaßnahme läuft',
      RECOGNISED: 'anerkannt',
      PARTIALLY_RECOGNISED: 'teilweise anerkannt',
      REJECTED: 'abgelehnt',
      WITHDRAWN: 'zurückgezogen',
    },
    accelDeadline: { APPOINTMENT: 'Termin bei der Botschaft (innerhalb von 3 Wochen)', DECISION: 'Entscheidung der Botschaft (i. d. R. 3 Wochen)', REPLY: 'Antwort an die Behörde', FEE: 'Zahlung der Gebühr (411 €)' },
    recognitionDeadline: { NEXT: 'Anerkennung: nächste Frist', ADAPTATION: 'Ende der Ausgleichsmaßnahme' },
    dueTitle: (p) => `Frist naht: ${p.worker} (${p.number})`,
    dueBody: (p) => `${p.what} — ${p.date} (noch ${p.days} Tage).`,
    dueTask: (p) => `${p.what} am ${p.date}: ${p.worker} (${p.number})`,
    overdueTitle: (p) => `Frist überschritten: ${p.worker} (${p.number})`,
    overdueBody: (p) => `${p.what} — die Frist war am ${p.date}. Bitte den Stand prüfen und die Frist aktualisieren.`,
    clientStatusTitle: 'Anerkennung Ihres Abschlusses: neuer Stand',
    clientStatusBody: (p) => `Hallo ${p.firstName}, ${p.procedure}: der Stand ist jetzt „${p.status}“. Details finden Sie im Portal.`,
    clientCta: 'Antrag ansehen',
    employerAgreementTitle: (p) => `Beschleunigtes Fachkräfteverfahren (§ 81a): ${p.worker}`,
    employerAgreementBody: (p) => `Für ${p.worker} (${p.number}) haben wir das beschleunigte Fachkräfteverfahren gestartet. Nächster Schritt: die Vereinbarung mit der Ausländerbehörde unterzeichnen — wir bereiten sie für Sie vor.`,
    employerFeeTitle: (p) => `Gebühr § 81a fällig: ${p.worker}`,
    employerFeeBody: (p) => `Die Ausländerbehörde hat für ${p.worker} (${p.number}) die Gebühr für das beschleunigte Fachkräfteverfahren (${p.fee ?? '411 €'}) angefordert. Bitte begleichen Sie sie und geben Sie uns kurz Bescheid.`,
    employerPreApprovalTitle: (p) => `Vorabzustimmung erteilt: ${p.worker}`,
    employerPreApprovalBody: (p) => `Die Ausländerbehörde hat für ${p.worker} (${p.number}) die Vorabzustimmung erteilt. Die Botschaft vergibt in der Regel innerhalb von 3 Wochen einen Termin.`,
    employerCta: 'Mitarbeiter ansehen',
    clientPreApprovalTitle: 'Vorabzustimmung erteilt',
    clientPreApprovalBody: (p) => `Hallo ${p.firstName}, die Ausländerbehörde hat die Vorabzustimmung erteilt. Die Botschaft vergibt in der Regel innerhalb von 3 Wochen (etwa bis ${p.date}) einen Termin — Ihr Betreuer meldet sich bei Ihnen.`,
  },
  en: {
    procedure: {
      ZAB_STATEMENT: 'ZAB statement of comparability',
      FULL_RECOGNITION: 'Full recognition',
      PARTIAL_RECOGNITION: 'Partial recognition',
      IHK_FOSA: 'IHK FOSA (vocational qualification)',
      HWK: 'Chamber of crafts (HWK)',
    },
    status: {
      PREPARING: 'in preparation',
      SUBMITTED: 'submitted',
      IN_REVIEW: 'under review',
      DEFICIT_NOTICE: 'deficit notice (Defizitbescheid)',
      ADAPTATION: 'adaptation measure running',
      RECOGNISED: 'recognised',
      PARTIALLY_RECOGNISED: 'partially recognised',
      REJECTED: 'rejected',
      WITHDRAWN: 'withdrawn',
    },
    accelDeadline: { APPOINTMENT: 'Embassy appointment (within 3 weeks)', DECISION: 'Embassy decision (usually 3 weeks)', REPLY: 'Reply to the authority', FEE: 'Payment of the 411 € fee' },
    recognitionDeadline: { NEXT: 'Recognition: next deadline', ADAPTATION: 'End of the adaptation measure' },
    dueTitle: (p) => `Deadline approaching: ${p.worker} (${p.number})`,
    dueBody: (p) => `${p.what} — ${p.date} (${p.days} days left).`,
    dueTask: (p) => `${p.what} on ${p.date}: ${p.worker} (${p.number})`,
    overdueTitle: (p) => `Deadline passed: ${p.worker} (${p.number})`,
    overdueBody: (p) => `${p.what} — the deadline was ${p.date}. Please check the status and update the deadline.`,
    clientStatusTitle: 'Recognition of your qualification: new status',
    clientStatusBody: (p) => `Hello ${p.firstName}, ${p.procedure}: the status is now “${p.status}”. Details are in the portal.`,
    clientCta: 'View application',
    employerAgreementTitle: (p) => `Accelerated procedure (§ 81a): ${p.worker}`,
    employerAgreementBody: (p) => `We have started the accelerated skilled-worker procedure for ${p.worker} (${p.number}). Next step: signing the agreement with the immigration office (Ausländerbehörde) — we are preparing it for you.`,
    employerFeeTitle: (p) => `§ 81a fee due: ${p.worker}`,
    employerFeeBody: (p) => `The immigration office has requested the fee for the accelerated procedure (${p.fee ?? '411 €'}) for ${p.worker} (${p.number}). Please pay it and let us know.`,
    employerPreApprovalTitle: (p) => `Pre-approval granted: ${p.worker}`,
    employerPreApprovalBody: (p) => `The immigration office has granted the pre-approval (Vorabzustimmung) for ${p.worker} (${p.number}). The embassy usually offers an appointment within 3 weeks.`,
    employerCta: 'View worker',
    clientPreApprovalTitle: 'Pre-approval (Vorabzustimmung) granted',
    clientPreApprovalBody: (p) => `Hello ${p.firstName}, the immigration office has granted the pre-approval. The embassy usually offers an appointment within 3 weeks (around ${p.date}) — your manager will contact you.`,
  },
  ru: {
    procedure: {
      ZAB_STATEMENT: 'Оценка диплома ZAB',
      FULL_RECOGNITION: 'Полное признание',
      PARTIAL_RECOGNITION: 'Частичное признание',
      IHK_FOSA: 'IHK FOSA (профессиональное образование)',
      HWK: 'Ремесленная палата (HWK)',
    },
    status: {
      PREPARING: 'подготовка',
      SUBMITTED: 'подано',
      IN_REVIEW: 'на рассмотрении',
      DEFICIT_NOTICE: 'решение о недостатках (Defizitbescheid)',
      ADAPTATION: 'идёт компенсирующая мера',
      RECOGNISED: 'признано',
      PARTIALLY_RECOGNISED: 'признано частично',
      REJECTED: 'отказано',
      WITHDRAWN: 'отозвано',
    },
    accelDeadline: { APPOINTMENT: 'Запись в посольство (в течение 3 недель)', DECISION: 'Решение посольства (обычно 3 недели)', REPLY: 'Ответ ведомству', FEE: 'Оплата сбора 411 €' },
    recognitionDeadline: { NEXT: 'Признание: следующий срок', ADAPTATION: 'Окончание компенсирующей меры' },
    dueTitle: (p) => `Приближается срок: ${p.worker} (${p.number})`,
    dueBody: (p) => `${p.what} — ${p.date} (осталось ${p.days} дн.).`,
    dueTask: (p) => `${p.what} ${p.date}: ${p.worker} (${p.number})`,
    overdueTitle: (p) => `Срок пропущен: ${p.worker} (${p.number})`,
    overdueBody: (p) => `${p.what} — срок был ${p.date}. Проверьте состояние и обновите срок.`,
    clientStatusTitle: 'Признание вашего диплома: новый статус',
    clientStatusBody: (p) => `Здравствуйте, ${p.firstName}! ${p.procedure}: статус теперь «${p.status}». Подробности в портале.`,
    clientCta: 'Открыть заявку',
    employerAgreementTitle: (p) => `Ускоренная процедура (§ 81a): ${p.worker}`,
    employerAgreementBody: (p) => `Мы начали ускоренную процедуру для ${p.worker} (${p.number}). Следующий шаг: подписание соглашения с ведомством по делам иностранцев (Vereinbarung) — мы готовим его для вас.`,
    employerFeeTitle: (p) => `Нужно оплатить сбор § 81a: ${p.worker}`,
    employerFeeBody: (p) => `Ведомство по делам иностранцев запросило сбор за ускоренную процедуру (${p.fee ?? '411 €'}) для ${p.worker} (${p.number}). Пожалуйста, оплатите его и сообщите нам.`,
    employerPreApprovalTitle: (p) => `Предварительное согласие выдано: ${p.worker}`,
    employerPreApprovalBody: (p) => `Ведомство выдало предварительное согласие (Vorabzustimmung) для ${p.worker} (${p.number}). Посольство обычно назначает встречу в течение 3 недель.`,
    employerCta: 'Открыть сотрудника',
    clientPreApprovalTitle: 'Предварительное согласие (Vorabzustimmung) выдано',
    clientPreApprovalBody: (p) => `Здравствуйте, ${p.firstName}! Ведомство выдало предварительное согласие. Посольство обычно назначает встречу в течение 3 недель (примерно до ${p.date}) — ваш менеджер свяжется с вами.`,
  },
};

export const recognitionTexts = (l: Locale) => T[l] ?? T.az;

// ─── German documents for the authorities ─────────────────────────────

/** Title marker of the § 81a power of attorney sent for e-signature (also used to find it again). */
export const VOLLMACHT_TITLE = 'Vollmacht § 81a AufenthG';

/**
 * Power of attorney (worker → employer) for the accelerated skilled-worker procedure. Placeholders are
 * filled from the case (lib/contracts/values). German, since it is submitted to a German authority.
 */
export const VOLLMACHT_TEMPLATE = `# Vollmacht für das beschleunigte Fachkräfteverfahren nach § 81a AufenthG

Ich, {{client.fullName}}, geboren am {{client.birthDate}}, Staatsangehörigkeit {{client.nationality}}, Reisepass-Nr. {{client.passportNumber}}, wohnhaft in {{client.address}},

bevollmächtige hiermit

{{company.name}}, {{company.address}}, vertreten durch {{company.contactPerson}},

das beschleunigte Fachkräfteverfahren nach § 81a des Aufenthaltsgesetzes (AufenthG) in meinem Namen bei der zuständigen Ausländerbehörde zu beantragen und durchzuführen.

## Umfang der Vollmacht

- Abschluss der Vereinbarung mit der zuständigen Ausländerbehörde;
- Einreichung der erforderlichen Unterlagen und Abgabe von Erklärungen in diesem Verfahren;
- gegebenenfalls Beantragung der Anerkennung bzw. Feststellung der Gleichwertigkeit meiner ausländischen Berufsqualifikation;
- Entgegennahme der Vorabzustimmung und sonstiger Schreiben der Behörden in diesem Verfahren.

Die Vollmacht gilt für das Verfahren zur Beschäftigung als {{case.profession}} (Vorgang {{case.number}}). Sie kann jederzeit schriftlich widerrufen werden.

Ich bin damit einverstanden, dass die bevollmächtigte Stelle sich bei der Vorbereitung und Durchführung des Verfahrens durch {{triad.name}} unterstützen lässt.

{{today}}`;

export interface SubmissionMailInput {
  authority: string | null;
  reference: string | null;
  worker: { name: string; birthDate: string; nationality: string };
  company: { name: string; contact: string };
  profession: string;
  caseNumber: string;
  attachments: string[];
  sender: string;
  agency: string;
}

/** German submission e-mail to the Ausländerbehörde (subject + plain-text body; the staff member edits it before sending). */
export const submissionMail = (p: SubmissionMailInput) => {
  const subject = `Antrag auf Durchführung des beschleunigten Fachkräfteverfahrens (§ 81a AufenthG) – ${p.worker.name}${p.reference ? ` – Az. ${p.reference}` : ''}`;
  const list = p.attachments.length ? p.attachments.map((a, i) => `${i + 1}. ${a}`).join('\n') : '— (Unterlagen folgen gesondert)';
  const body = `Sehr geehrte Damen und Herren${p.authority ? ` der ${p.authority}` : ''},

im Auftrag und mit Vollmacht der ${p.company.name} beantragen wir die Durchführung des beschleunigten Fachkräfteverfahrens nach § 81a AufenthG für die folgende Fachkraft:

Name: ${p.worker.name}
Geburtsdatum: ${p.worker.birthDate || '—'}
Staatsangehörigkeit: ${p.worker.nationality || '—'}
Vorgesehene Beschäftigung: ${p.profession}
Arbeitgeber: ${p.company.name}${p.company.contact ? ` (Ansprechpartner: ${p.company.contact})` : ''}

Die Vollmacht der Fachkraft und die von der Arbeitgeberin unterzeichnete Vereinbarung liegen bei. Anbei übersenden wir folgende Unterlagen:

${list}

Für Rückfragen stehen wir Ihnen gern zur Verfügung. Bitte teilen Sie uns die Höhe und die Zahlungsmodalitäten der Gebühr mit.

Mit freundlichen Grüßen
${p.sender}
${p.agency}
(Vorgang ${p.caseNumber})`;
  return { subject, body };
};
