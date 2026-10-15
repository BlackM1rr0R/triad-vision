import i18n from 'i18next';

/**
 * Mobile strings for two-factor login and email verification (legal & security stream).
 * Registered once from lib/auth.tsx; keys live under m.twoFactor.* / m.verify.* and add error
 * messages under m.errors.* (looked up by useErrorMessage).
 */
const az = {
  m: {
    twoFactor: {
      title: 'İki faktorlu təsdiq',
      subtitle: 'Autentifikator tətbiqindəki 6 rəqəmli kodu daxil edin.',
      recoverySubtitle: 'Yadda saxladığınız bərpa kodlarından birini daxil edin. Hər kod yalnız bir dəfə işləyir.',
      code: 'Təsdiq kodu',
      recoveryCode: 'Bərpa kodu',
      useRecovery: 'Bərpa kodundan istifadə et',
      useCode: 'Tətbiqdəki koddan istifadə et',
      submit: 'Təsdiqlə',
      back: 'Girişə qayıt',
      attemptsLeft: 'Qalan cəhdlər: {{count}}',
    },
    verify: {
      checkInbox: '{{email}} ünvanına təsdiq linki göndərdik. Viza müraciəti üçün e-poçtunuzu təsdiqləyin.',
    },
    errors: {
      INVALID_CODE: 'Kod yanlışdır. Tətbiqdəki yeni kodu daxil edin.',
      TWO_FACTOR_CHALLENGE_INVALID: 'Təsdiq müddəti bitdi. Yenidən daxil olun.',
      EMAIL_NOT_VERIFIED: 'Əvvəlcə e-poçt ünvanınızı təsdiqləyin. Təsdiq linki e-poçtunuza göndərilib.',
      TWO_FACTOR_ENROLLMENT_REQUIRED: 'Əvvəlcə veb idarəetmə panelində (Təhlükəsizlik bölməsi) iki faktorlu autentifikasiyanı aktivləşdirin.',
    },
  },
};

type Copy = typeof az;

const de: Copy = {
  m: {
    twoFactor: {
      title: 'Zwei-Faktor-Bestätigung',
      subtitle: 'Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein.',
      recoverySubtitle: 'Geben Sie einen Ihrer gespeicherten Wiederherstellungscodes ein. Jeder Code funktioniert nur einmal.',
      code: 'Bestätigungscode',
      recoveryCode: 'Wiederherstellungscode',
      useRecovery: 'Wiederherstellungscode verwenden',
      useCode: 'Code aus der App verwenden',
      submit: 'Bestätigen',
      back: 'Zurück zur Anmeldung',
      attemptsLeft: 'Verbleibende Versuche: {{count}}',
    },
    verify: {
      checkInbox: 'Wir haben einen Bestätigungslink an {{email}} gesendet. Bitte bestätigen Sie Ihre E-Mail-Adresse, um einen Visumantrag zu starten.',
    },
    errors: {
      INVALID_CODE: 'Der Code ist falsch. Bitte geben Sie den aktuellen Code aus Ihrer App ein.',
      TWO_FACTOR_CHALLENGE_INVALID: 'Die Bestätigung ist abgelaufen. Bitte melden Sie sich erneut an.',
      EMAIL_NOT_VERIFIED: 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Der Link wurde Ihnen per E-Mail gesendet.',
      TWO_FACTOR_ENROLLMENT_REQUIRED: 'Bitte richten Sie zuerst im Web-Verwaltungsbereich (Sicherheit) die Zwei-Faktor-Authentifizierung ein.',
    },
  },
};

const en: Copy = {
  m: {
    twoFactor: {
      title: 'Two-factor verification',
      subtitle: 'Enter the 6-digit code from your authenticator app.',
      recoverySubtitle: 'Enter one of your saved recovery codes. Each code works only once.',
      code: 'Verification code',
      recoveryCode: 'Recovery code',
      useRecovery: 'Use a recovery code',
      useCode: 'Use the code from the app',
      submit: 'Verify',
      back: 'Back to login',
      attemptsLeft: 'Attempts left: {{count}}',
    },
    verify: {
      checkInbox: 'We sent a confirmation link to {{email}}. Please confirm your email to start a visa application.',
    },
    errors: {
      INVALID_CODE: 'The code is incorrect. Please enter the current code from your app.',
      TWO_FACTOR_CHALLENGE_INVALID: 'The verification has expired. Please log in again.',
      EMAIL_NOT_VERIFIED: 'Please confirm your email address first. We sent you the link by email.',
      TWO_FACTOR_ENROLLMENT_REQUIRED: 'Please set up two-factor authentication in the web admin panel (Security) first.',
    },
  },
};

const ru: Copy = {
  m: {
    twoFactor: {
      title: 'Двухфакторное подтверждение',
      subtitle: 'Введите 6-значный код из приложения-аутентификатора.',
      recoverySubtitle: 'Введите один из сохранённых кодов восстановления. Каждый код действует один раз.',
      code: 'Код подтверждения',
      recoveryCode: 'Код восстановления',
      useRecovery: 'Использовать код восстановления',
      useCode: 'Использовать код из приложения',
      submit: 'Подтвердить',
      back: 'Вернуться ко входу',
      attemptsLeft: 'Осталось попыток: {{count}}',
    },
    verify: {
      checkInbox: 'Мы отправили ссылку для подтверждения на {{email}}. Подтвердите e-mail, чтобы начать оформление визы.',
    },
    errors: {
      INVALID_CODE: 'Неверный код. Введите текущий код из приложения.',
      TWO_FACTOR_CHALLENGE_INVALID: 'Время подтверждения истекло. Войдите снова.',
      EMAIL_NOT_VERIFIED: 'Сначала подтвердите адрес электронной почты. Ссылка отправлена вам по e-mail.',
      TWO_FACTOR_ENROLLMENT_REQUIRED: 'Сначала включите двухфакторную аутентификацию в веб-панели управления (раздел «Безопасность»).',
    },
  },
};

export const mobileLegal = { az, de, en, ru };

let registered = false;
/** Adds the strings to i18next without overwriting existing keys (idempotent). */
export const registerLegalCopy = () => {
  if (registered) return;
  const add = () => {
    if (registered) return;
    registered = true;
    (Object.keys(mobileLegal) as (keyof typeof mobileLegal)[]).forEach((lng) =>
      i18n.addResourceBundle(lng, 'translation', mobileLegal[lng], true, false),
    );
  };
  if (i18n.store) add();
  else i18n.on('initialized', add);
};
