import type { Locale } from '@prisma/client';

/** Notification texts of automatic assignment and absence handover (recipient's language; formal German, Russian "вы"). */

interface Texts {
  assigned: (p: { number: string; reason: string }) => { title: string; body: string };
  unassigned: (p: { number: string; to: string }) => { title: string; body: string };
  reasons: { auto: string; rebalance: string; automation: string; handover: string; returned: string };
  handoverToSubstitute: (p: { owner: string; until: string; lines: string }) => { title: string; body: string };
  handoverToOwner: (p: { count: number; until: string; lines: string }) => { title: string; body: string };
  handoverEndSubstitute: (p: { owner: string; lines: string }) => { title: string; body: string };
  handoverEndOwner: (p: { count: number; lines: string; kept: number }) => { title: string; body: string };
  summaryLine: (p: { number: string; client: string; events: number; from: string; to: string }) => string;
  keptLine: (p: { number: string; client: string }) => string;
  openEnded: string;
}

const az: Texts = {
  assigned: (p) => ({ title: `Sizə müraciət təyin edildi: ${p.number}`, body: `${p.number} müraciəti sizə təyin edildi (${p.reason}).` }),
  unassigned: (p) => ({ title: `${p.number} başqa əməkdaşa verildi`, body: `${p.number} müraciəti yükün balanslaşdırılması üçün ${p.to} adlı əməkdaşa verildi.` }),
  reasons: { auto: 'avtomatik təyinat', rebalance: 'yükün balanslaşdırılması', automation: 'avtomatlaşdırma qaydası', handover: 'əvəzetmə', returned: 'məzuniyyətdən qayıdış' },
  handoverToSubstitute: (p) => ({ title: `Əvəzetmə: ${p.owner}`, body: `${p.owner} ${p.until} tarixinə qədər yoxdur. Bu müraciətlər müvəqqəti olaraq sizə verildi:\n\n${p.lines}` }),
  handoverToOwner: (p) => ({ title: `Məzuniyyət: ${p.count} müraciət müvəqqəti verildi`, body: `Siz yoxkən (${p.until} tarixinə qədər) açıq müraciətləriniz həmkarlarınıza verildi:\n\n${p.lines}\n\nQayıtdıqda onlar avtomatik sizə qaytarılacaq.` }),
  handoverEndSubstitute: (p) => ({ title: `Əvəzetmə bitdi: ${p.owner}`, body: `${p.owner} qayıtdı, müraciətlər geri qaytarıldı. Əvəzetmə dövründə baş verənlər:\n\n${p.lines}` }),
  handoverEndOwner: (p) => ({ title: `Xoş gəldiniz! ${p.count} müraciət sizə qaytarıldı`, body: `Yoxluğunuz zamanı baş verənlər:\n\n${p.lines}${p.kept ? `\n\n${p.kept} müraciət bu müddətdə əl ilə başqa əməkdaşa verildi və orada qaldı.` : ''}` }),
  summaryLine: (p) => `• ${p.number} (${p.client}): ${p.events} hadisə, status ${p.from} → ${p.to}`,
  keptLine: (p) => `• ${p.number} (${p.client})`,
  openEnded: 'qeyri-müəyyən müddət',
};

const de: Texts = {
  assigned: (p) => ({ title: `Ihnen wurde ein Antrag zugewiesen: ${p.number}`, body: `Der Antrag ${p.number} wurde Ihnen zugewiesen (${p.reason}).` }),
  unassigned: (p) => ({ title: `${p.number} wurde neu verteilt`, body: `Der Antrag ${p.number} wurde zum Lastausgleich an ${p.to} übergeben.` }),
  reasons: { auto: 'automatische Zuweisung', rebalance: 'Lastausgleich', automation: 'Automatisierungsregel', handover: 'Vertretung', returned: 'Rückkehr aus der Abwesenheit' },
  handoverToSubstitute: (p) => ({ title: `Vertretung für ${p.owner}`, body: `${p.owner} ist bis ${p.until} abwesend. Diese Anträge wurden Ihnen vorübergehend übergeben:\n\n${p.lines}` }),
  handoverToOwner: (p) => ({ title: `Abwesenheit: ${p.count} Anträge vorübergehend übergeben`, body: `Während Ihrer Abwesenheit (bis ${p.until}) betreuen Kolleginnen und Kollegen Ihre offenen Anträge:\n\n${p.lines}\n\nNach Ihrer Rückkehr gehen sie automatisch an Sie zurück.` }),
  handoverEndSubstitute: (p) => ({ title: `Vertretung beendet: ${p.owner}`, body: `${p.owner} ist zurück, die Anträge wurden zurückgegeben. Was während der Vertretung geschah:\n\n${p.lines}` }),
  handoverEndOwner: (p) => ({ title: `Willkommen zurück! ${p.count} Anträge sind wieder bei Ihnen`, body: `Was während Ihrer Abwesenheit geschah:\n\n${p.lines}${p.kept ? `\n\n${p.kept} Anträge wurden in der Zwischenzeit manuell neu zugewiesen und bleiben dort.` : ''}` }),
  summaryLine: (p) => `• ${p.number} (${p.client}): ${p.events} Ereignisse, Status ${p.from} → ${p.to}`,
  keptLine: (p) => `• ${p.number} (${p.client})`,
  openEnded: 'auf Weiteres',
};

const en: Texts = {
  assigned: (p) => ({ title: `Case assigned to you: ${p.number}`, body: `Case ${p.number} was assigned to you (${p.reason}).` }),
  unassigned: (p) => ({ title: `${p.number} was reassigned`, body: `Case ${p.number} was handed to ${p.to} to balance the workload.` }),
  reasons: { auto: 'automatic assignment', rebalance: 'workload rebalancing', automation: 'automation rule', handover: 'absence cover', returned: 'return from absence' },
  handoverToSubstitute: (p) => ({ title: `Covering for ${p.owner}`, body: `${p.owner} is away until ${p.until}. These cases were handed to you for the time being:\n\n${p.lines}` }),
  handoverToOwner: (p) => ({ title: `Absence: ${p.count} cases temporarily handed over`, body: `While you are away (until ${p.until}) colleagues look after your open cases:\n\n${p.lines}\n\nThey return to you automatically when you are back.` }),
  handoverEndSubstitute: (p) => ({ title: `Cover ended: ${p.owner}`, body: `${p.owner} is back and the cases were returned. What happened while you covered:\n\n${p.lines}` }),
  handoverEndOwner: (p) => ({ title: `Welcome back! ${p.count} cases are yours again`, body: `What happened while you were away:\n\n${p.lines}${p.kept ? `\n\n${p.kept} cases were reassigned manually in the meantime and stay where they are.` : ''}` }),
  summaryLine: (p) => `• ${p.number} (${p.client}): ${p.events} events, status ${p.from} → ${p.to}`,
  keptLine: (p) => `• ${p.number} (${p.client})`,
  openEnded: 'further notice',
};

const ru: Texts = {
  assigned: (p) => ({ title: `Вам назначено дело: ${p.number}`, body: `Дело ${p.number} назначено вам (${p.reason}).` }),
  unassigned: (p) => ({ title: `${p.number} передано коллеге`, body: `Дело ${p.number} передано сотруднику ${p.to} для выравнивания нагрузки.` }),
  reasons: { auto: 'автоматическое назначение', rebalance: 'выравнивание нагрузки', automation: 'правило автоматизации', handover: 'замещение', returned: 'возвращение из отсутствия' },
  handoverToSubstitute: (p) => ({ title: `Замещение: ${p.owner}`, body: `${p.owner} отсутствует до ${p.until}. Эти дела временно переданы вам:\n\n${p.lines}` }),
  handoverToOwner: (p) => ({ title: `Отсутствие: ${p.count} дел временно передано`, body: `Пока вас нет (до ${p.until}), ваши открытые дела ведут коллеги:\n\n${p.lines}\n\nПосле вашего возвращения они автоматически вернутся к вам.` }),
  handoverEndSubstitute: (p) => ({ title: `Замещение завершено: ${p.owner}`, body: `${p.owner} вернулся(-ась), дела возвращены. Что произошло за время замещения:\n\n${p.lines}` }),
  handoverEndOwner: (p) => ({ title: `С возвращением! ${p.count} дел снова у вас`, body: `Что произошло за время вашего отсутствия:\n\n${p.lines}${p.kept ? `\n\n${p.kept} дел за это время были вручную переназначены и остаются у коллег.` : ''}` }),
  summaryLine: (p) => `• ${p.number} (${p.client}): событий — ${p.events}, статус ${p.from} → ${p.to}`,
  keptLine: (p) => `• ${p.number} (${p.client})`,
  openEnded: 'дальнейшего уведомления',
};

export const assignmentTexts = (l: Locale): Texts => ({ az, de, en, ru })[l];
