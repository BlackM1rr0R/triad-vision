/**
 * New staff training checklist (/admin/training-checklist): ten tasks done in the real system. Detection:
 *   - 'request': a successful staff GET request (tracker middleware in lib/staffOnboarding/service.ts records a
 *     StaffTrainingEvent: opening a case, the "/" canned-reply picker, the data-quality panel, Ctrl+K search,
 *     KB articles (3 different ones), the embassy package)
 *   - 'db': rows the user created (upload links, upload links e-mailed to the client, internal notes, tasks)
 * Every task can also be ticked by hand (StaffTrainingEvent ref = "manual").
 * Pure: no database here (unit-tested).
 */

export interface TaskText {
  az: string;
  ru: string;
  en: string;
  de: string;
}

export const TRAINING_TASK_IDS = [
  'openCase',
  'addNote',
  'requestDocs',
  'sendUploadLink',
  'cannedReply',
  'createTask',
  'dataQuality',
  'ctrlK',
  'kbArticles',
  'embassyPackage',
] as const;
export type TrainingTaskId = (typeof TRAINING_TASK_IDS)[number];

export interface TrainingTask {
  id: TrainingTaskId;
  detect: 'request' | 'db';
  /** how many different refs are needed (KB articles: 3) */
  target: number;
  link: string;
  title: TaskText;
  how: TaskText;
}

export const KB_TARGET = 3;
export const MANUAL_REF = 'manual';

export const TRAINING_TASKS: TrainingTask[] = [
  {
    id: 'openCase',
    detect: 'request',
    target: 1,
    link: '/admin/cases',
    title: { az: 'Bir müraciəti açın', ru: 'Откройте заявку', en: 'Open a case', de: 'Einen Fall öffnen' },
    how: {
      az: '"Müraciətlər" siyahısından istənilən müraciətə klikləyin və səhifəni nəzərdən keçirin.',
      ru: 'Нажмите на любую заявку в списке «Заявки» и просмотрите страницу.',
      en: 'Click any case in the Cases list and look through the page.',
      de: 'In der Fallliste einen beliebigen Fall anklicken und die Seite durchsehen.',
    },
  },
  {
    id: 'addNote',
    detect: 'db',
    target: 1,
    link: '/admin/cases',
    title: { az: 'Daxili qeyd yazın', ru: 'Напишите внутреннюю заметку', en: 'Add an internal note', de: 'Interne Notiz schreiben' },
    how: {
      az: 'Müraciət səhifəsində "Qeyd" sahəsinə qısa qeyd yazın. Müştəri daxili qeydləri görmür.',
      ru: 'На странице заявки напишите короткую заметку в поле «Заметка». Клиент внутренние заметки не видит.',
      en: 'On a case page write a short note in the note field. Clients never see internal notes.',
      de: 'Auf einer Fallseite eine kurze Notiz schreiben. Kunden sehen interne Notizen nie.',
    },
  },
  {
    id: 'requestDocs',
    detect: 'db',
    target: 1,
    link: '/admin/cases',
    title: { az: 'Linklə sənəd istəyin', ru: 'Запросите документы по ссылке', en: 'Request documents via upload link', de: 'Dokumente per Upload-Link anfordern' },
    how: {
      az: 'Müraciət səhifəsində "Linklə sənəd istə" seçin və lazım olan sənədləri işarələyin.',
      ru: 'На странице заявки выберите «Запросить документы по ссылке» и отметьте нужные документы.',
      en: 'On a case page choose "Request documents via link" and tick the documents you need.',
      de: 'Auf der Fallseite „Dokumente per Link anfordern“ wählen und die Dokumente ankreuzen.',
    },
  },
  {
    id: 'sendUploadLink',
    detect: 'db',
    target: 1,
    link: '/admin/cases',
    title: { az: 'Linki müştəriyə e-poçtla göndərin', ru: 'Отправьте ссылку клиенту по почте', en: 'Send an upload link by e-mail', de: 'Upload-Link per E-Mail senden' },
    how: {
      az: 'Sənəd linki yaradarkən "E-poçtla göndər" seçimini işarələyin — link müştərinin ünvanına gedir.',
      ru: 'Создавая ссылку, отметьте «Отправить по почте» — ссылка уйдёт на адрес клиента.',
      en: 'When creating the link tick "Send by e-mail" — it goes to the client’s address.',
      de: 'Beim Erstellen „Per E-Mail senden“ ankreuzen — der Link geht an die Adresse des Kunden.',
    },
  },
  {
    id: 'cannedReply',
    detect: 'request',
    target: 1,
    link: '/admin/canned-replies',
    title: { az: 'Hazır cavabdan istifadə edin', ru: 'Используйте шаблон ответа', en: 'Use a canned reply', de: 'Textbaustein verwenden' },
    how: {
      az: 'Müraciətin mesaj sahəsində "/" yazın və siyahıdan hazır cavab seçin.',
      ru: 'В поле сообщения заявки введите «/» и выберите готовый ответ из списка.',
      en: 'Type "/" in a case message box and pick a reply from the list.',
      de: 'Im Nachrichtenfeld eines Falls „/“ tippen und einen Baustein wählen.',
    },
  },
  {
    id: 'createTask',
    detect: 'db',
    target: 1,
    link: '/admin/tasks',
    title: { az: 'Tapşırıq yaradın', ru: 'Создайте задачу', en: 'Create a task', de: 'Aufgabe anlegen' },
    how: {
      az: '"Tapşırıqlar" səhifəsində yeni tapşırıq yaradın (məsələn, özünüzə xatırlatma).',
      ru: 'На странице «Задачи» создайте новую задачу (например, напоминание себе).',
      en: 'Create a new task on the Tasks page (for example a reminder to yourself).',
      de: 'Auf der Seite „Aufgaben“ eine neue Aufgabe anlegen (z. B. eine Erinnerung an sich selbst).',
    },
  },
  {
    id: 'dataQuality',
    detect: 'request',
    target: 1,
    link: '/admin/data-quality',
    title: { az: 'Məlumat keyfiyyətinə baxın', ru: 'Проверьте качество данных', en: 'Check data quality', de: 'Datenqualität prüfen' },
    how: {
      az: '"Məlumat keyfiyyəti" panelini açın və ən zəif müraciətə baxın.',
      ru: 'Откройте панель «Качество данных» и посмотрите самую слабую заявку.',
      en: 'Open the Data quality panel and look at the weakest case.',
      de: 'Das Panel „Datenqualität“ öffnen und den schwächsten Fall ansehen.',
    },
  },
  {
    id: 'ctrlK',
    detect: 'request',
    target: 1,
    link: '/admin',
    title: { az: 'Ctrl+K ilə müştəri tapın', ru: 'Найдите клиента через Ctrl+K', en: 'Find a client with Ctrl+K', de: 'Kunden mit Strg+K finden' },
    how: {
      az: 'Ctrl+K (Mac-da ⌘K) basın və müştərinin adını və ya müraciət nömrəsini yazın.',
      ru: 'Нажмите Ctrl+K (на Mac ⌘K) и введите имя клиента или номер заявки.',
      en: 'Press Ctrl+K (⌘K on a Mac) and type a client name or case number.',
      de: 'Strg+K (Mac: ⌘K) drücken und Kundennamen oder Fallnummer eingeben.',
    },
  },
  {
    id: 'kbArticles',
    detect: 'request',
    target: KB_TARGET,
    link: '/admin/kb',
    title: { az: 'Bilik bazasından 3 məqalə oxuyun', ru: 'Прочитайте 3 статьи базы знаний', en: 'Read 3 knowledge base articles', de: '3 Wissensartikel lesen' },
    how: {
      az: '"Bilik bazası" bölməsində üç fərqli məqaləni açın.',
      ru: 'Откройте три разные статьи в разделе «База знаний».',
      en: 'Open three different articles in the Knowledge base.',
      de: 'Drei verschiedene Artikel in der Wissensdatenbank öffnen.',
    },
  },
  {
    id: 'embassyPackage',
    detect: 'request',
    target: 1,
    link: '/admin/cases',
    title: { az: 'Səfirlik paketinə baxın', ru: 'Посмотрите пакет для посольства', en: 'View the embassy package', de: 'Botschaftspaket ansehen' },
    how: {
      az: 'Müraciət səhifəsində "Səfirlik paketi" bölməsini açın: hansı sənədlərin hazır olduğunu görəcəksiniz.',
      ru: 'На странице заявки откройте раздел «Пакет для посольства»: видно, какие документы готовы.',
      en: 'On a case page open the "Embassy package" section: it shows which documents are ready.',
      de: 'Auf der Fallseite den Bereich „Botschaftspaket“ öffnen: Er zeigt, welche Dokumente fertig sind.',
    },
  },
];

/** Row ids are cuids ("c" + 20–30 lowercase letters / digits), so list endpoints like /cases/export never match. */
const ID = '(c[a-z0-9]{20,30})';
const PATH_RULES: { re: RegExp; task: TrainingTaskId; ref?: number }[] = [
  { re: new RegExp(`^/cases/${ID}/embassy-package/?$`), task: 'embassyPackage' },
  { re: new RegExp(`^/cases/${ID}/?$`), task: 'openCase' },
  { re: new RegExp(`^/clients/${ID}/?$`), task: 'openCase' }, // client 360° counts as opening a case too
  { re: /^\/canned-replies\/picker\/?$/, task: 'cannedReply' },
  { re: /^\/data-quality(\/.*)?$/, task: 'dataQuality' },
  { re: /^\/command-search\/?$/, task: 'ctrlK' },
  { re: new RegExp(`^/ops/kb/articles/${ID}/?$`), task: 'kbArticles', ref: 1 },
];

/** Pure: which training task a successful GET of this admin path (relative to /api/admin) completes. */
export const matchTrainingPath = (path: string): { taskId: TrainingTaskId; ref: string } | null => {
  const p = path.split('?')[0];
  for (const r of PATH_RULES) {
    const m = r.re.exec(p);
    if (!m) continue;
    return { taskId: r.task, ref: r.ref ? m[r.ref] : '' };
  }
  return null;
};

export interface TrainingSignals {
  /** StaffTrainingEvent rows of the user */
  events: { taskId: string; ref: string }[];
  /** detected from the database */
  db: Partial<Record<TrainingTaskId, boolean>>;
}

export interface TrainingTaskState {
  id: TrainingTaskId;
  done: boolean;
  /** detected automatically (not only ticked by hand) */
  auto: boolean;
  manual: boolean;
  count: number;
  target: number;
}

/** Pure: state of each task + overall progress. */
export const evaluateTraining = (s: TrainingSignals) => {
  const tasks: TrainingTaskState[] = TRAINING_TASKS.map((t) => {
    const evs = s.events.filter((e) => e.taskId === t.id);
    const manual = evs.some((e) => e.ref === MANUAL_REF);
    const refs = new Set(evs.filter((e) => e.ref !== MANUAL_REF).map((e) => e.ref));
    const count = t.detect === 'db' ? (s.db[t.id] ? 1 : 0) : Math.min(refs.size, t.target);
    const auto = count >= t.target;
    return { id: t.id, done: auto || manual, auto, manual, count, target: t.target };
  });
  const done = tasks.filter((t) => t.done).length;
  return { tasks, done, total: tasks.length, percent: Math.round((done / tasks.length) * 100), complete: done === tasks.length };
};
