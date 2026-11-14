// Visitor live chat additions: offline handover (the AI answers until a colleague is online), typing indicator,
// message times and the unread badge on the advisor button. The base live chat copy is pagesCalls (`livechat.*`).
// Registered with registerCopy(pagesLiveChatPlus) by components/livechat and components/publicAi/AdvisorBubble.

const az = {
  lcx: {
    offlineTitle: 'Hazırda oflaynıq',
    offlineBack: 'Əməkdaşlar {{when}} onlayn olacaq',
    offlineText: 'Sualınızı yazın: AI köməkçimiz dərhal cavab verəcək, əməkdaşımız isə onlayn olan kimi burada yazacaq.',
    question: 'Sualınız',
    startOffline: 'Göndər',
    orCallback: 'Zəng gözləmək istəyirsiniz?',
    offlineBanner: 'Əməkdaşlar oflayndır. AI köməkçi indi cavab verir; əməkdaş qayıdan kimi bu söhbətə yazacaq.',
    leaveContact: 'Əlaqə məlumatı qoyun ki, sizə çataq',
    typing: '{{name}} yazır…',
    aiTyping: 'AI köməkçi yazır…',
    staffTyping: 'Əməkdaş yazır…',
    ai: 'AI köməkçi',
    sent: 'Göndərildi',
    unread: '{{count}} yeni mesaj',
    attachHint: 'Sənədləri çatda göndərməyin — qeydiyyatdan sonra şəxsi kabinetə təhlükəsiz yükləyə bilərsiniz.',
  },
};

type Copy = typeof az;

const de: Copy = {
  lcx: {
    offlineTitle: 'Gerade sind wir offline',
    offlineBack: 'Unser Team ist {{when}} wieder online',
    offlineText: 'Schreiben Sie Ihre Frage: Unser KI-Assistent antwortet sofort, und ein Mitarbeiter schreibt hier, sobald er online ist.',
    question: 'Ihre Frage',
    startOffline: 'Senden',
    orCallback: 'Lieber einen Rückruf?',
    offlineBanner: 'Unser Team ist offline. Der KI-Assistent antwortet in der Zwischenzeit; ein Mitarbeiter schreibt hier, sobald er zurück ist.',
    leaveContact: 'Kontakt hinterlassen, damit wir Sie erreichen',
    typing: '{{name}} schreibt…',
    aiTyping: 'KI-Assistent schreibt…',
    staffTyping: 'Mitarbeiter schreibt…',
    ai: 'KI-Assistent',
    sent: 'Gesendet',
    unread: '{{count}} neue Nachrichten',
    attachHint: 'Bitte keine Dokumente im Chat senden — nach der Registrierung laden Sie sie sicher im Kundenportal hoch.',
  },
};

const en: Copy = {
  lcx: {
    offlineTitle: 'We are offline right now',
    offlineBack: 'Our team is back online {{when}}',
    offlineText: 'Type your question: our AI assistant answers right away, and a colleague writes here as soon as they are online.',
    question: 'Your question',
    startOffline: 'Send',
    orCallback: 'Prefer a call back?',
    offlineBanner: 'Our team is offline. The AI assistant answers in the meantime; a colleague will write here when they are back.',
    leaveContact: 'Leave your contact details so we can reach you',
    typing: '{{name}} is typing…',
    aiTyping: 'AI assistant is typing…',
    staffTyping: 'A colleague is typing…',
    ai: 'AI assistant',
    sent: 'Sent',
    unread: '{{count}} new messages',
    attachHint: 'Please do not send documents in the chat — after signing up you can upload them securely in your portal.',
  },
};

const ru: Copy = {
  lcx: {
    offlineTitle: 'Сейчас мы офлайн',
    offlineBack: 'Команда будет онлайн {{when}}',
    offlineText: 'Напишите вопрос: наш ИИ-ассистент ответит сразу, а сотрудник напишет здесь, как только будет онлайн.',
    question: 'Ваш вопрос',
    startOffline: 'Отправить',
    orCallback: 'Хотите, чтобы вам перезвонили?',
    offlineBanner: 'Сотрудники офлайн. Пока отвечает ИИ-ассистент; сотрудник напишет в этот чат, когда вернётся.',
    leaveContact: 'Оставьте контакты, чтобы мы могли с вами связаться',
    typing: '{{name}} печатает…',
    aiTyping: 'ИИ-ассистент печатает…',
    staffTyping: 'Сотрудник печатает…',
    ai: 'ИИ-ассистент',
    sent: 'Отправлено',
    unread: '{{count}} новых сообщений',
    attachHint: 'Не отправляйте документы в чат — после регистрации их можно безопасно загрузить в личном кабинете.',
  },
};

const tr: Copy = {
  lcx: {
    offlineTitle: 'Şu anda çevrimdışıyız',
    offlineBack: 'Ekibimiz {{when}} tekrar çevrimiçi',
    offlineText: 'Sorunuzu yazın: yapay zekâ asistanımız hemen yanıtlar, bir çalışanımız çevrimiçi olur olmaz buraya yazar.',
    question: 'Sorunuz',
    startOffline: 'Gönder',
    orCallback: 'Geri aranmayı mı tercih edersiniz?',
    offlineBanner: 'Ekibimiz çevrimdışı. Bu arada yapay zekâ asistanı yanıtlıyor; bir çalışan döndüğünde buraya yazacak.',
    leaveContact: 'Size ulaşabilmemiz için iletişim bilgilerinizi bırakın',
    typing: '{{name}} yazıyor…',
    aiTyping: 'Yapay zekâ asistanı yazıyor…',
    staffTyping: 'Bir çalışan yazıyor…',
    ai: 'Yapay zekâ asistanı',
    sent: 'Gönderildi',
    unread: '{{count}} yeni mesaj',
    attachHint: 'Lütfen sohbette belge göndermeyin — kayıttan sonra portalınıza güvenle yükleyebilirsiniz.',
  },
};

const uk: Copy = {
  lcx: {
    offlineTitle: 'Зараз ми офлайн',
    offlineBack: 'Команда буде онлайн {{when}}',
    offlineText: 'Напишіть запитання: наш ШІ-асистент відповість одразу, а співробітник напише тут, щойно буде онлайн.',
    question: 'Ваше запитання',
    startOffline: 'Надіслати',
    orCallback: 'Бажаєте, щоб вам передзвонили?',
    offlineBanner: 'Співробітники офлайн. Поки що відповідає ШІ-асистент; співробітник напише в цей чат, коли повернеться.',
    leaveContact: 'Залиште контакти, щоб ми могли з вами зв’язатися',
    typing: '{{name}} друкує…',
    aiTyping: 'ШІ-асистент друкує…',
    staffTyping: 'Співробітник друкує…',
    ai: 'ШІ-асистент',
    sent: 'Надіслано',
    unread: '{{count}} нових повідомлень',
    attachHint: 'Не надсилайте документи в чат — після реєстрації їх можна безпечно завантажити в особистому кабінеті.',
  },
};

export const pagesLiveChatPlus = { az, de, en, ru, tr, uk };
