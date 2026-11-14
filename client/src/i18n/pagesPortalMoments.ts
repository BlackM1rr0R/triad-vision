// Client portal moments: the one-time "visa approved" celebration screen (pages/account/portal/ApprovedCelebration)
// and the per-requirement document state chips (components/portal/CaseDocuments). Same keys in every language;
// tr / uk fall back to English like the rest of the portal copy.

const az = {
  pmom: {
    approved: {
      eyebrow: 'Təbrik edirik!',
      title: 'Vizanız təsdiqləndi',
      text: '{{number}} nömrəli müraciətiniz uğurla başa çatdı. Almaniyaya yolunuz açıqdır — indi gəlişə hazırlaşaq.',
      nextTitle: 'Gəliş üçün növbəti addımlar',
      steps: {
        arrival: { title: 'Gəlişinizi planlaşdırın', text: 'Uçuş tarixini bildirin, qarşılanma lazımdırsa qeyd edin.' },
        housing: { title: 'Mənzil', text: 'İlk həftələr üçün yaşayış yerini birlikdə tapaq.' },
        onboarding: { title: 'İlk günlər Almaniyada', text: 'Anmeldung, bank hesabı, sığorta — yoxlama siyahısı.' },
        german: { title: 'Alman dili', text: 'Gündəlik həyat üçün dilinizi gücləndirin.' },
      },
      inviteTitle: 'Dostunuz da Almaniyada işləmək istəyir?',
      inviteText: 'Onu dəvət edin — tövsiyə proqramımız hər ikinizə fayda verir.',
      invite: 'Dostu dəvət et',
      plan: 'Gəlişi planlaşdır',
      close: 'Bağla',
    },
    docState: {
      label: 'Sənədin vəziyyəti',
      waiting: 'Yüklənməyi gözləyir',
      review: 'Yoxlanılır',
      accepted: 'Qəbul edildi',
      rejected: 'Qəbul edilmədi',
    },
    rejectedNoReason: 'Komanda bu faylı qəbul etmədi. Zəhmət olmasa yenisini yükləyin.',
    reasonLabel: 'Səbəb',
    reupload: 'Yenidən yüklə',
  },
};

type Copy = typeof az;

const de: Copy = {
  pmom: {
    approved: {
      eyebrow: 'Herzlichen Glückwunsch!',
      title: 'Ihr Visum wurde erteilt',
      text: 'Ihr Antrag {{number}} ist erfolgreich abgeschlossen. Der Weg nach Deutschland ist frei — bereiten wir jetzt Ihre Ankunft vor.',
      nextTitle: 'Nächste Schritte für die Ankunft',
      steps: {
        arrival: { title: 'Ankunft planen', text: 'Teilen Sie uns Ihren Flug mit und ob Sie abgeholt werden möchten.' },
        housing: { title: 'Wohnung', text: 'Wir finden gemeinsam eine Unterkunft für die ersten Wochen.' },
        onboarding: { title: 'Die ersten Tage in Deutschland', text: 'Anmeldung, Bankkonto, Versicherung — Ihre Checkliste.' },
        german: { title: 'Deutsch', text: 'Stärken Sie Ihr Deutsch für den Alltag.' },
      },
      inviteTitle: 'Möchte ein Freund auch in Deutschland arbeiten?',
      inviteText: 'Laden Sie ihn ein — von unserem Empfehlungsprogramm profitieren Sie beide.',
      invite: 'Freund einladen',
      plan: 'Ankunft planen',
      close: 'Schließen',
    },
    docState: {
      label: 'Status der Unterlage',
      waiting: 'Wartet auf Upload',
      review: 'In Prüfung',
      accepted: 'Akzeptiert',
      rejected: 'Abgelehnt',
    },
    rejectedNoReason: 'Das Team hat diese Datei nicht akzeptiert. Bitte laden Sie eine neue hoch.',
    reasonLabel: 'Grund',
    reupload: 'Erneut hochladen',
  },
};

const en: Copy = {
  pmom: {
    approved: {
      eyebrow: 'Congratulations!',
      title: 'Your visa has been approved',
      text: 'Your application {{number}} has been completed successfully. The way to Germany is open — let’s get your arrival ready.',
      nextTitle: 'Next steps for your arrival',
      steps: {
        arrival: { title: 'Plan your arrival', text: 'Tell us your flight and whether you need a pickup.' },
        housing: { title: 'Housing', text: 'Let’s find a place for your first weeks together.' },
        onboarding: { title: 'Your first days in Germany', text: 'Registration, bank account, insurance — your checklist.' },
        german: { title: 'German', text: 'Brush up your German for everyday life.' },
      },
      inviteTitle: 'Does a friend want to work in Germany too?',
      inviteText: 'Invite them — our referral programme rewards you both.',
      invite: 'Invite a friend',
      plan: 'Plan my arrival',
      close: 'Close',
    },
    docState: {
      label: 'Document status',
      waiting: 'Waiting for upload',
      review: 'In review',
      accepted: 'Accepted',
      rejected: 'Rejected',
    },
    rejectedNoReason: 'The team did not accept this file. Please upload a new one.',
    reasonLabel: 'Reason',
    reupload: 'Re-upload',
  },
};

const ru: Copy = {
  pmom: {
    approved: {
      eyebrow: 'Поздравляем!',
      title: 'Ваша виза одобрена',
      text: 'Ваша заявка {{number}} успешно завершена. Дорога в Германию открыта — давайте подготовим ваш приезд.',
      nextTitle: 'Следующие шаги к приезду',
      steps: {
        arrival: { title: 'Спланируйте приезд', text: 'Сообщите нам рейс и нужна ли встреча в аэропорту.' },
        housing: { title: 'Жильё', text: 'Вместе найдём жильё на первые недели.' },
        onboarding: { title: 'Первые дни в Германии', text: 'Прописка (Anmeldung), счёт в банке, страховка — ваш чек-лист.' },
        german: { title: 'Немецкий язык', text: 'Подтяните немецкий для повседневной жизни.' },
      },
      inviteTitle: 'Друг тоже хочет работать в Германии?',
      inviteText: 'Пригласите его — наша реферальная программа выгодна вам обоим.',
      invite: 'Пригласить друга',
      plan: 'Спланировать приезд',
      close: 'Закрыть',
    },
    docState: {
      label: 'Статус документа',
      waiting: 'Ожидает загрузки',
      review: 'На проверке',
      accepted: 'Принят',
      rejected: 'Отклонён',
    },
    rejectedNoReason: 'Команда не приняла этот файл. Пожалуйста, загрузите новый.',
    reasonLabel: 'Причина',
    reupload: 'Загрузить заново',
  },
};

export const pagesPortalMoments: { az: Copy; de: Copy; en: Copy; ru: Copy } = { az, de, en, ru };
