import type { Locale } from '@prisma/client';
import type { RiskReason } from './risk.js';
import { topicLabels } from './texts.js';

/** Texts of the churn-risk alert (task + notification for the responsible staff member), per language. */

interface P {
  worker: string;
  number: string;
  score: number;
  reasons: string;
}

type ReasonFn = (r: RiskReason, l: Locale) => string;

const reasonText: Record<Locale, ReasonFn> = {
  az: (r, l) =>
    ({
      WORKER_ISSUE: `işçi ${r.params?.count} dəfə “Problem var” cavabı verib`,
      EMPLOYER_ISSUE: `işəgötürən ${r.params?.count} dəfə problem bildirib`,
      OPEN_ISSUE: `${r.params?.count} həll olunmamış problem`,
      TOPIC: `mövzu: ${topicLabels([String(r.params?.topic)], l)}`,
      NO_ANSWER: `${r.params?.count} yoxlamaya cavab verilməyib`,
      TREND_WORSE: 'son cavab pisləşib',
      TREND_BETTER: 'son cavab yaxşılaşıb',
      PROBATION_SOON: `sınaq müddəti ${r.params?.days} gün sonra bitir`,
    })[r.code],
  de: (r, l) =>
    ({
      WORKER_ISSUE: `Arbeitnehmer hat ${r.params?.count}× „Problem“ gemeldet`,
      EMPLOYER_ISSUE: `Arbeitgeber hat ${r.params?.count}× ein Problem gemeldet`,
      OPEN_ISSUE: `${r.params?.count} ungelöste(s) Problem(e)`,
      TOPIC: `Thema: ${topicLabels([String(r.params?.topic)], l)}`,
      NO_ANSWER: `${r.params?.count} Check-in(s) unbeantwortet`,
      TREND_WORSE: 'letzte Antwort verschlechtert',
      TREND_BETTER: 'letzte Antwort verbessert',
      PROBATION_SOON: `Probezeit endet in ${r.params?.days} Tagen`,
    })[r.code],
  en: (r, l) =>
    ({
      WORKER_ISSUE: `worker answered “Problem” ${r.params?.count}×`,
      EMPLOYER_ISSUE: `employer reported a problem ${r.params?.count}×`,
      OPEN_ISSUE: `${r.params?.count} unresolved problem(s)`,
      TOPIC: `topic: ${topicLabels([String(r.params?.topic)], l)}`,
      NO_ANSWER: `${r.params?.count} check-in(s) not answered`,
      TREND_WORSE: 'latest answer got worse',
      TREND_BETTER: 'latest answer improved',
      PROBATION_SOON: `probation ends in ${r.params?.days} days`,
    })[r.code],
  ru: (r, l) =>
    ({
      WORKER_ISSUE: `работник ${r.params?.count} раз(а) ответил «Есть проблема»`,
      EMPLOYER_ISSUE: `работодатель ${r.params?.count} раз(а) сообщил о проблеме`,
      OPEN_ISSUE: `нерешённых проблем: ${r.params?.count}`,
      TOPIC: `тема: ${topicLabels([String(r.params?.topic)], l)}`,
      NO_ANSWER: `без ответа опросов: ${r.params?.count}`,
      TREND_WORSE: 'последний ответ хуже',
      TREND_BETTER: 'последний ответ лучше',
      PROBATION_SOON: `испытательный срок заканчивается через ${r.params?.days} дн.`,
    })[r.code],
};

const T: Record<Locale, { title: (p: P) => string; taskTitle: (p: P) => string; body: (p: P) => string }> = {
  az: {
    title: (p) => `Yüksək işdən çıxma riski: ${p.worker} (${p.number})`,
    taskTitle: (p) => `İşdən çıxma riski YÜKSƏK: ${p.worker} (${p.number}) — işçi ilə əlaqə saxlayın`,
    body: (p) => `Gəlişdən sonrakı yoxlamalara görə ${p.worker} üçün işdən çıxma riski ${p.score}/100-dür. Səbəblər: ${p.reasons}. İşçi və işəgötürənlə danışın.`,
  },
  de: {
    title: (p) => `Hohes Abwanderungsrisiko: ${p.worker} (${p.number})`,
    taskTitle: (p) => `Abwanderungsrisiko HOCH: ${p.worker} (${p.number}) — Kontakt aufnehmen`,
    body: (p) => `Nach den Check-ins seit der Ankunft liegt das Abwanderungsrisiko von ${p.worker} bei ${p.score}/100. Gründe: ${p.reasons}. Bitte mit Arbeitnehmer und Arbeitgeber sprechen.`,
  },
  en: {
    title: (p) => `High churn risk: ${p.worker} (${p.number})`,
    taskTitle: (p) => `Churn risk HIGH: ${p.worker} (${p.number}) — get in touch`,
    body: (p) => `Based on the post-arrival check-ins, the churn risk of ${p.worker} is ${p.score}/100. Reasons: ${p.reasons}. Please talk to the worker and the employer.`,
  },
  ru: {
    title: (p) => `Высокий риск ухода: ${p.worker} (${p.number})`,
    taskTitle: (p) => `Риск ухода ВЫСОКИЙ: ${p.worker} (${p.number}) — связаться`,
    body: (p) => `По опросам после приезда риск ухода ${p.worker} составляет ${p.score}/100. Причины: ${p.reasons}. Поговорите с работником и работодателем.`,
  },
};

export const riskTexts = (l: Locale) => {
  const t = T[l] ?? T.az;
  const rt = reasonText[l] ?? reasonText.az;
  return { ...t, reasonList: (reasons: RiskReason[]) => reasons.filter((r) => r.points > 0).map((r) => rt(r, l)).join('; ') || '—' };
};
