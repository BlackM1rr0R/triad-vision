import i18n from './index';

/**
 * Mobile strings of the AI assistant screen under `m.assistant.*` (same API as the web portal's chat:
 * /api/ai, scope CLIENT). Registered by the feature module itself. German formal "Sie", Russian "вы".
 */
const az = {
  assistant: {
    title: 'AI köməkçi',
    homeTitle: 'AI köməkçidən soruşun',
    homeText: 'Müraciətiniz, sənədləriniz və tarixləriniz haqqında',
    emptyTitle: 'Salam! Sizə necə kömək edə bilərəm?',
    emptyText: 'Müraciətiniz, çatışmayan sənədlər, görüş tarixləri, terminlər və Almaniyada həyat haqqında soruşun.',
    suggestions: ['Müraciətim hansı mərhələdədir?', 'Hansı sənədlərim çatışmır?', 'Səfirlik görüşüm nə vaxtdır?', '“Vorabzustimmung” nə deməkdir?', 'Sualımı menecerimə göndərmək istəyirəm'],
    placeholder: 'Sualınızı yazın…',
    send: 'Göndər',
    stop: 'Dayandır',
    newChat: 'Yeni söhbət',
    thinking: 'Düşünürəm…',
    disclaimer: 'AI səhv edə bilər və hüquqi zəmanət vermir. Vacib qərarlar üçün menecerinizlə əlaqə saxlayın.',
    disabled: 'AI köməkçi hazırda əlçatan deyil. Sualınızı müraciətinizin mesajlarında menecerinizə yazın.',
    error: 'Xəta baş verdi. Yenidən cəhd edin.',
    action: { title: 'Təsdiq tələb olunur', confirm: 'Göndər', reject: 'Ləğv et', DONE: 'Göndərildi', REJECTED: 'Ləğv edildi', FAILED: 'Alınmadı', EXPIRED: 'Müddəti bitdi', PENDING: 'Gözləyir' },
  },
};

type Copy = typeof az;

const de: Copy = {
  assistant: {
    title: 'KI-Assistent',
    homeTitle: 'Fragen Sie den KI-Assistenten',
    homeText: 'Zu Ihrem Antrag, Ihren Dokumenten und Terminen',
    emptyTitle: 'Hallo! Wie kann ich Ihnen helfen?',
    emptyText: 'Fragen Sie zu Ihrem Antrag, fehlenden Dokumenten, Terminen, Fachbegriffen und dem Leben in Deutschland.',
    suggestions: ['Wo steht mein Antrag gerade?', 'Welche Dokumente fehlen noch?', 'Wann ist mein Botschaftstermin?', 'Was bedeutet „Vorabzustimmung“?', 'Ich möchte meinem Betreuer eine Frage stellen'],
    placeholder: 'Ihre Frage…',
    send: 'Senden',
    stop: 'Stopp',
    newChat: 'Neuer Chat',
    thinking: 'Ich denke nach…',
    disclaimer: 'Die KI kann sich irren und gibt keine rechtliche Garantie. Für wichtige Entscheidungen wenden Sie sich an Ihren Betreuer.',
    disabled: 'Der KI-Assistent ist derzeit nicht verfügbar. Schreiben Sie Ihre Frage gern Ihrem Betreuer in den Nachrichten Ihres Antrags.',
    error: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.',
    action: { title: 'Bestätigung erforderlich', confirm: 'Senden', reject: 'Abbrechen', DONE: 'Gesendet', REJECTED: 'Abgebrochen', FAILED: 'Fehlgeschlagen', EXPIRED: 'Abgelaufen', PENDING: 'Wartet' },
  },
};

const en: Copy = {
  assistant: {
    title: 'AI assistant',
    homeTitle: 'Ask the AI assistant',
    homeText: 'About your application, documents and dates',
    emptyTitle: 'Hello! How can I help you?',
    emptyText: 'Ask about your application, missing documents, appointments, terms and life in Germany.',
    suggestions: ['Where is my application now?', 'Which documents are still missing?', 'When is my embassy appointment?', 'What does “Vorabzustimmung” mean?', 'I want to ask my case manager a question'],
    placeholder: 'Type your question…',
    send: 'Send',
    stop: 'Stop',
    newChat: 'New chat',
    thinking: 'Thinking…',
    disclaimer: 'AI can make mistakes and gives no legal guarantee. For important decisions, contact your case manager.',
    disabled: 'The AI assistant is not available right now. Please write your question to your case manager in your application messages.',
    error: 'Something went wrong. Please try again.',
    action: { title: 'Confirmation needed', confirm: 'Send', reject: 'Cancel', DONE: 'Sent', REJECTED: 'Cancelled', FAILED: 'Failed', EXPIRED: 'Expired', PENDING: 'Waiting' },
  },
};

const ru: Copy = {
  assistant: {
    title: 'AI-помощник',
    homeTitle: 'Спросите AI-помощника',
    homeText: 'О вашей заявке, документах и сроках',
    emptyTitle: 'Здравствуйте! Чем могу помочь?',
    emptyText: 'Спрашивайте о заявке, недостающих документах, записях, терминах и жизни в Германии.',
    suggestions: ['На каком этапе моя заявка?', 'Каких документов не хватает?', 'Когда моя запись в посольство?', 'Что означает «Vorabzustimmung»?', 'Хочу задать вопрос своему менеджеру'],
    placeholder: 'Напишите вопрос…',
    send: 'Отправить',
    stop: 'Стоп',
    newChat: 'Новый чат',
    thinking: 'Думаю…',
    disclaimer: 'AI может ошибаться и не даёт юридических гарантий. По важным решениям обращайтесь к своему менеджеру.',
    disabled: 'AI-помощник сейчас недоступен. Напишите вопрос своему менеджеру в сообщениях заявки.',
    error: 'Произошла ошибка. Попробуйте ещё раз.',
    action: { title: 'Требуется подтверждение', confirm: 'Отправить', reject: 'Отменить', DONE: 'Отправлено', REJECTED: 'Отменено', FAILED: 'Не удалось', EXPIRED: 'Истекло', PENDING: 'Ожидает' },
  },
};

const bundles = { az, de, en, ru };
for (const [lng, b] of Object.entries(bundles)) i18n.addResourceBundle(lng, 'translation', { m: b }, true, false);

export const assistantCopy = bundles;
