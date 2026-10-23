import type { Locale, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { invalidateAutomationCache } from './events.js';
import type { z } from 'zod';
import { ruleInputSchema } from './schema.js';

/**
 * Five example rules shipped DISABLED, created once (Setting `automation.examplesSeeded`) in the language of the
 * admin who first opens the page. Client-facing texts are in all four languages.
 */

const SEEDED_KEY = 'automation.examplesSeeded';

type Example = { key: string; build: (l: Locale) => z.input<typeof ruleInputSchema> };

const t4 = (az: string, de: string, en: string, ru: string) => ({ az, de, en, ru });
const pick = <T>(l: Locale, o: Record<Locale, T>) => o[l];

const EXAMPLES: Example[] = [
  {
    key: 'contract-signed-embassy-task',
    build: (l) => ({
      name: pick(l, t4('Müqavilə imzalandı → səfirlik görüşü tapşırığı', 'Vertrag unterschrieben → Aufgabe Botschaftstermin', 'Contract signed → embassy appointment task', 'Договор подписан → задача «запись в посольство»')),
      description: pick(l, t4('Müraciətin sahibinə 2 gün müddətli tapşırıq.', 'Aufgabe für den Sachbearbeiter, fällig in 2 Tagen.', 'Task for the case owner, due in 2 days.', 'Задача ответственному сотруднику со сроком 2 дня.')),
      trigger: { type: 'CONTRACT_SIGNED' },
      conditions: [],
      actions: [
        {
          type: 'CREATE_TASK',
          title: pick(l, t4('{{case.number}}: {{client.fullName}} üçün səfirlik görüşü təyin edin', '{{case.number}}: Botschaftstermin für {{client.fullName}} buchen', '{{case.number}}: book the embassy appointment for {{client.fullName}}', '{{case.number}}: записать {{client.fullName}} в посольство')),
          description: '{{case.link}}',
          assignee: { kind: 'CASE_OWNER' },
          dueInDays: 2,
          priority: 'HIGH',
        },
      ],
    }),
  },
  {
    key: 'document-rejected-client-email',
    build: (l) => ({
      name: pick(l, t4('Sənəd rədd edildi → səbəbi ilə müştəriyə e-poçt', 'Dokument abgelehnt → E-Mail mit Grund an den Kunden', 'Document rejected → email with the reason to the client', 'Документ отклонён → письмо клиенту с причиной')),
      description: pick(l, t4('Standart bildiriş yalnız kabinetdə görünür; bu qayda səbəbi e-poçtla da göndərir.', 'Die Standardbenachrichtigung erscheint nur im Portal; diese Regel schickt den Grund zusätzlich per E-Mail.', 'The built-in notice is in-app only; this rule also emails the reason.', 'Стандартное уведомление видно только в кабинете; правило дополнительно отправляет причину по e-mail.')),
      trigger: { type: 'DOCUMENT_REJECTED', stages: ['INITIAL', 'EMBASSY'] },
      conditions: [],
      actions: [
        {
          type: 'SEND_CLIENT_MESSAGE',
          channels: ['EMAIL'],
          message: {
            kind: 'CUSTOM',
            title: t4('Sənəd qəbul edilmədi: {{document.title}}', 'Dokument nicht akzeptiert: {{document.title}}', 'Document not accepted: {{document.title}}', 'Документ не принят: {{document.title}}'),
            body: t4(
              'Hörmətli {{client.firstName}},\n\n"{{document.title}}" sənədi qəbul edilmədi.\n\nSəbəb: {{document.note}}\n\nZəhmət olmasa kabinetinizdə yenidən yükləyin ({{case.number}}).',
              'Guten Tag {{client.firstName}},\n\ndas Dokument „{{document.title}}“ konnte nicht akzeptiert werden.\n\nGrund: {{document.note}}\n\nBitte laden Sie es in Ihrem Kundenbereich erneut hoch ({{case.number}}).',
              'Dear {{client.firstName}},\n\nthe document "{{document.title}}" could not be accepted.\n\nReason: {{document.note}}\n\nPlease upload it again in your account ({{case.number}}).',
              'Здравствуйте, {{client.firstName}}!\n\nДокумент «{{document.title}}» не принят.\n\nПричина: {{document.note}}\n\nПожалуйста, загрузите его снова в личном кабинете ({{case.number}}).',
            ),
          },
        },
      ],
    }),
  },
  {
    key: 'client-inactive-7-days',
    build: (l) => ({
      name: pick(l, t4('Müştəri 7 gün aktiv deyil → xatırlatma', 'Kunde 7 Tage inaktiv → Erinnerung', 'Client inactive for 7 days → reminder', 'Клиент неактивен 7 дней → напоминание')),
      description: pick(l, t4('Müştəriyə xatırlatma; 2 gün sonra hələ də aktiv deyilsə, sahibinə bildiriş.', 'Erinnerung an den Kunden; ist er 2 Tage später immer noch inaktiv, wird der Sachbearbeiter informiert.', 'Reminder to the client; if still inactive 2 days later, the owner is told.', 'Напоминание клиенту; если через 2 дня он всё ещё неактивен — уведомление ответственному.')),
      trigger: { type: 'CLIENT_INACTIVE', days: 7, statuses: ['DOCUMENTS_PENDING', 'CONTRACT_SENT', 'EMBASSY_DOCUMENTS'] },
      conditions: [],
      actions: [
        {
          type: 'SEND_CLIENT_MESSAGE',
          channels: ['EMAIL', 'IN_APP'],
          message: {
            kind: 'CUSTOM',
            title: t4('Müraciətiniz sizi gözləyir', 'Ihr Antrag wartet auf Sie', 'Your application is waiting for you', 'Ваша заявка ждёт вас'),
            body: t4(
              'Hörmətli {{client.firstName}}, {{case.number}} müraciətinizdə növbəti addım sizdədir: {{case.status}}. Suallarınız varsa, kabinetdə bizə yazın.',
              'Guten Tag {{client.firstName}}, bei Ihrem Antrag {{case.number}} sind Sie am Zug: {{case.status}}. Bei Fragen schreiben Sie uns gern im Kundenbereich.',
              'Dear {{client.firstName}}, the next step of your application {{case.number}} is yours: {{case.status}}. If you have questions, message us in your account.',
              'Здравствуйте, {{client.firstName}}! Следующий шаг по вашей заявке {{case.number}} за вами: {{case.status}}. Если у вас есть вопросы, напишите нам в личном кабинете.',
            ),
          },
        },
        {
          type: 'NOTIFY_STAFF',
          delay: { amount: 2, unit: 'DAYS' },
          onlyIfStillTrue: true,
          target: { kind: 'CASE_OWNER' },
          title: pick(l, t4('{{case.number}}: müştəri 9 gündür aktiv deyil', '{{case.number}}: Kunde seit 9 Tagen inaktiv', '{{case.number}}: client inactive for 9 days', '{{case.number}}: клиент неактивен 9 дней')),
          body: pick(l, t4('{{client.fullName}} xatırlatmaya cavab vermədi. Zəng edin.', '{{client.fullName}} hat auf die Erinnerung nicht reagiert. Bitte anrufen.', '{{client.fullName}} did not react to the reminder. Please call.', '{{client.fullName}} не ответил(а) на напоминание. Позвоните, пожалуйста.')),
        },
      ],
    }),
  },
  {
    key: 'visa-approved-arrival',
    build: (l) => ({
      name: pick(l, t4('Viza təsdiqləndi → gəlişi planlaşdırın', 'Visum erteilt → Anreise planen', 'Visa approved → plan the arrival', 'Виза одобрена → спланировать приезд')),
      description: pick(l, t4('Rəy dəvəti artıq daxili işlə göndərilir — bu qayda yalnız gəlişi planlaşdırır.', 'Bewertungseinladungen verschickt bereits der eingebaute Job – diese Regel plant nur die Anreise.', 'Review invitations are already sent by the built-in job — this rule only plans the arrival.', 'Приглашения оставить отзыв уже отправляет встроенная задача — правило только планирует приезд.')),
      trigger: { type: 'CASE_STATUS_CHANGED', from: [], to: ['APPROVED'] },
      conditions: [{ type: 'ASSIGNED_STAFF', op: 'set', values: [] }],
      actions: [
        {
          type: 'CREATE_TASK',
          title: pick(l, t4('{{case.number}}: {{client.fullName}} üçün gəliş və qarşılama', '{{case.number}}: Anreise und Abholung für {{client.fullName}}', '{{case.number}}: arrival and pickup for {{client.fullName}}', '{{case.number}}: приезд и встреча {{client.fullName}}')),
          assignee: { kind: 'CASE_OWNER' },
          dueInDays: 3,
          priority: 'NORMAL',
        },
      ],
    }),
  },
  {
    key: 'new-case-auto-assign',
    build: (l) => ({
      name: pick(l, t4('Yeni müraciət → avtomatik təyinat', 'Neuer Antrag → automatisch zuweisen', 'New case → auto-assign', 'Новая заявка → автоматическое назначение')),
      description: pick(l, t4('Təyin olunmamış yeni müraciətlər üçün təyinat strategiyasını işə salır (Avtomatlaşdırma → Təyinat).', 'Startet für neue, nicht zugewiesene Anträge die Zuweisungsstrategie (Automatisierung → Zuweisung).', 'Runs the assignment strategy for new unassigned cases (Automation → Assignment).', 'Запускает стратегию назначения для новых неназначенных заявок (Автоматизация → Назначение).')),
      trigger: { type: 'CASE_CREATED' },
      conditions: [{ type: 'ASSIGNED_STAFF', op: 'not_set', values: [] }],
      actions: [{ type: 'ASSIGN', mode: 'AUTO', onlyIfUnassigned: true }],
    }),
  },
];

export const ensureExampleRules = async (locale: Locale, actorId: string | null) => {
  if (await prisma.setting.findUnique({ where: { key: SEEDED_KEY } })) return 0;
  await prisma.setting.upsert({ where: { key: SEEDED_KEY }, create: { key: SEEDED_KEY, value: true }, update: {} });
  const res = await prisma.automationRule.createMany({
    data: EXAMPLES.map((e) => {
      const r = ruleInputSchema.parse(e.build(locale));
      return {
        name: r.name,
        description: r.description ?? null,
        enabled: false,
        triggerType: r.trigger.type,
        trigger: r.trigger as Prisma.InputJsonValue,
        conditions: r.conditions as Prisma.InputJsonValue,
        actions: r.actions as unknown as Prisma.InputJsonValue,
        exampleKey: e.key,
        createdById: actorId,
        updatedById: actorId,
      };
    }),
    skipDuplicates: true,
  });
  invalidateAutomationCache();
  return res.count;
};

/** For tests / reuse: the example definitions in one language. */
export const exampleRules = (locale: Locale) => EXAMPLES.map((e) => ({ key: e.key, ...ruleInputSchema.parse(e.build(locale)) }));
