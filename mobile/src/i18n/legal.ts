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
      emailSubtitle: '6 rəqəmli kodu {{email}} ünvanına göndərdik. Kod 10 dəqiqə etibarlıdır.',
      emailSubtitleGeneric: 'E-poçtunuza göndərdiyimiz 6 rəqəmli kodu daxil edin. Kod 10 dəqiqə etibarlıdır.',
      emailCode: 'E-poçtdakı kod',
      emailNotSent: 'Yeni kod hələ göndərilməyib. Taymer bitdikdən sonra "Kodu yenidən göndər" düyməsini basın.',
      emailInvalid: 'Kod yanlışdır. E-poçtdakı ən son kodu daxil edin.',
      resend: 'Kodu yenidən göndər',
      resendIn: 'Yeni kod {{seconds}} san. sonra',
      resent: 'Yeni kod göndərildi.',
      useEmail: 'Bunun əvəzinə kodu e-poçtuma göndər',
    },
    verify: {
      checkInbox: '{{email}} ünvanına təsdiq linki göndərdik. Viza müraciəti üçün e-poçtunuzu təsdiqləyin.',
    },
    errors: {
      INVALID_CODE: 'Kod yanlışdır. Tətbiqdəki yeni kodu daxil edin.',
      TWO_FACTOR_CHALLENGE_INVALID: 'Təsdiq müddəti bitdi. Yenidən daxil olun.',
      CODE_EXPIRED: 'Kodun vaxtı bitib. Yeni kod istəyin.',
      EMAIL_OTP_TOO_SOON: 'Yeni kodu bir az sonra istəyə bilərsiniz.',
      EMAIL_OTP_LIMIT: 'Həddindən çox kod istənilib. Bir qədər sonra yenidən cəhd edin.',
      EMAIL_OTP_NOT_AVAILABLE: 'E-poçt ilə kod bu hesab üçün mövcud deyil.',
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
      emailSubtitle: 'Wir haben einen 6-stelligen Code an {{email}} gesendet. Er ist 10 Minuten gültig.',
      emailSubtitleGeneric: 'Geben Sie den 6-stelligen Code ein, den wir Ihnen per E-Mail gesendet haben. Er ist 10 Minuten gültig.',
      emailCode: 'Code aus der E-Mail',
      emailNotSent: 'Es wurde noch kein neuer Code gesendet. Tippen Sie nach Ablauf des Timers auf „Code erneut senden“.',
      emailInvalid: 'Der Code ist falsch. Bitte geben Sie den neuesten Code aus der E-Mail ein.',
      resend: 'Code erneut senden',
      resendIn: 'Neuer Code in {{seconds}} s',
      resent: 'Ein neuer Code wurde gesendet.',
      useEmail: 'Stattdessen einen Code an meine E-Mail senden',
    },
    verify: {
      checkInbox: 'Wir haben einen Bestätigungslink an {{email}} gesendet. Bitte bestätigen Sie Ihre E-Mail-Adresse, um einen Visumantrag zu starten.',
    },
    errors: {
      INVALID_CODE: 'Der Code ist falsch. Bitte geben Sie den aktuellen Code aus Ihrer App ein.',
      TWO_FACTOR_CHALLENGE_INVALID: 'Die Bestätigung ist abgelaufen. Bitte melden Sie sich erneut an.',
      CODE_EXPIRED: 'Der Code ist abgelaufen. Bitte fordern Sie einen neuen Code an.',
      EMAIL_OTP_TOO_SOON: 'Sie können in Kürze einen neuen Code anfordern.',
      EMAIL_OTP_LIMIT: 'Zu viele Codes angefordert. Bitte versuchen Sie es später erneut.',
      EMAIL_OTP_NOT_AVAILABLE: 'Codes per E-Mail sind für dieses Konto nicht verfügbar.',
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
      emailSubtitle: 'We sent a 6-digit code to {{email}}. It is valid for 10 minutes.',
      emailSubtitleGeneric: 'Enter the 6-digit code we sent to your email. It is valid for 10 minutes.',
      emailCode: 'Code from the email',
      emailNotSent: 'No new code has been sent yet. Tap "Resend code" once the timer runs out.',
      emailInvalid: 'The code is incorrect. Please enter the latest code from the email.',
      resend: 'Resend code',
      resendIn: 'New code in {{seconds}} s',
      resent: 'A new code has been sent.',
      useEmail: 'Send a code to my email instead',
    },
    verify: {
      checkInbox: 'We sent a confirmation link to {{email}}. Please confirm your email to start a visa application.',
    },
    errors: {
      INVALID_CODE: 'The code is incorrect. Please enter the current code from your app.',
      TWO_FACTOR_CHALLENGE_INVALID: 'The verification has expired. Please log in again.',
      CODE_EXPIRED: 'The code has expired. Please request a new one.',
      EMAIL_OTP_TOO_SOON: 'You can request a new code shortly.',
      EMAIL_OTP_LIMIT: 'Too many codes requested. Please try again later.',
      EMAIL_OTP_NOT_AVAILABLE: 'Email codes are not available for this account.',
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
      emailSubtitle: 'Мы отправили 6-значный код на {{email}}. Код действителен 10 минут.',
      emailSubtitleGeneric: 'Введите 6-значный код, который мы отправили вам на e-mail. Код действителен 10 минут.',
      emailCode: 'Код из письма',
      emailNotSent: 'Новый код ещё не отправлен. Нажмите «Отправить код ещё раз», когда закончится таймер.',
      emailInvalid: 'Неверный код. Введите последний код из письма.',
      resend: 'Отправить код ещё раз',
      resendIn: 'Новый код через {{seconds}} с',
      resent: 'Новый код отправлен.',
      useEmail: 'Вместо этого отправить код на мой e-mail',
    },
    verify: {
      checkInbox: 'Мы отправили ссылку для подтверждения на {{email}}. Подтвердите e-mail, чтобы начать оформление визы.',
    },
    errors: {
      INVALID_CODE: 'Неверный код. Введите текущий код из приложения.',
      TWO_FACTOR_CHALLENGE_INVALID: 'Время подтверждения истекло. Войдите снова.',
      CODE_EXPIRED: 'Срок действия кода истёк. Запросите новый код.',
      EMAIL_OTP_TOO_SOON: 'Новый код можно будет запросить чуть позже.',
      EMAIL_OTP_LIMIT: 'Запрошено слишком много кодов. Попробуйте позже.',
      EMAIL_OTP_NOT_AVAILABLE: 'Коды по e-mail недоступны для этой учётной записи.',
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
