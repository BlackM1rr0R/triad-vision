import type { Locale } from '@prisma/client';

/** Notification texts of the client-data features (client in their language; staff in German as elsewhere). */

type T = (title: string) => { title: string; body: string };

export const FORM_SENT: Record<Locale, T> = {
  az: (f) => ({ title: 'Yeni anket', body: `Zəhmət olmasa kabinetinizdə "${f}" anketini doldurun. Qaralama kimi saxlayıb sonra davam edə bilərsiniz.` }),
  de: (f) => ({ title: 'Neuer Fragebogen', body: `Bitte füllen Sie in Ihrem Kundenbereich den Fragebogen „${f}“ aus. Sie können ihn als Entwurf speichern und später fortsetzen.` }),
  en: (f) => ({ title: 'New questionnaire', body: `Please fill in the questionnaire "${f}" in your account. You can save a draft and continue later.` }),
  ru: (f) => ({ title: 'Новая анкета', body: `Пожалуйста, заполните анкету «${f}» в личном кабинете. Можно сохранить черновик и продолжить позже.` }),
};

export const FORM_REMINDER: Record<Locale, T> = {
  az: (f) => ({ title: 'Xatırlatma: anket', body: `"${f}" anketi hələ göndərilməyib. Zəhmət olmasa doldurub göndərin.` }),
  de: (f) => ({ title: 'Erinnerung: Fragebogen', body: `Der Fragebogen „${f}“ wurde noch nicht abgeschickt. Bitte füllen Sie ihn aus und senden Sie ihn ab.` }),
  en: (f) => ({ title: 'Reminder: questionnaire', body: `The questionnaire "${f}" has not been submitted yet. Please fill it in and submit it.` }),
  ru: (f) => ({ title: 'Напоминание: анкета', body: `Анкета «${f}» ещё не отправлена. Пожалуйста, заполните и отправьте её.` }),
};

export const FORM_REOPENED: Record<Locale, T> = {
  az: (f) => ({ title: 'Anketdə düzəliş lazımdır', body: `Zəhmət olmasa "${f}" anketini yoxlayıb yenidən göndərin.` }),
  de: (f) => ({ title: 'Fragebogen bitte ergänzen', body: `Bitte prüfen Sie den Fragebogen „${f}“ und senden Sie ihn erneut ab.` }),
  en: (f) => ({ title: 'Questionnaire needs changes', body: `Please check the questionnaire "${f}" and submit it again.` }),
  ru: (f) => ({ title: 'Анкету нужно дополнить', body: `Пожалуйста, проверьте анкету «${f}» и отправьте её снова.` }),
};

export const CONFIRM_REQUESTED: Record<Locale, { title: string; body: string }> = {
  az: { title: 'Məlumatlarınızı təsdiqləyin', body: 'Səfirliyə gedəcək məlumatları yoxlayın: hər sətirdə "Düzdür" və ya "Düzəlt" seçin.' },
  de: { title: 'Bitte bestätigen Sie Ihre Daten', body: 'Bitte prüfen Sie die Angaben, die an die Botschaft gehen: in jeder Zeile „Stimmt“ oder „Korrigieren“.' },
  en: { title: 'Please confirm your data', body: 'Please check the details that go to the embassy: mark each line "Correct" or "Fix".' },
  ru: { title: 'Подтвердите ваши данные', body: 'Проверьте данные, которые уйдут в посольство: в каждой строке «Верно» или «Исправить».' },
};

export const CONFIRM_REMINDER: Record<Locale, { title: string; body: string }> = {
  az: { title: 'Xatırlatma: məlumatların təsdiqi', body: 'Səfirlik üçün məlumatlarınız hələ təsdiqlənməyib. Zəhmət olmasa yoxlayıb təsdiqləyin.' },
  de: { title: 'Erinnerung: Datenbestätigung', body: 'Ihre Angaben für die Botschaft sind noch nicht bestätigt. Bitte prüfen und bestätigen Sie sie.' },
  en: { title: 'Reminder: confirm your data', body: 'Your details for the embassy are not confirmed yet. Please check and confirm them.' },
  ru: { title: 'Напоминание: подтверждение данных', body: 'Ваши данные для посольства ещё не подтверждены. Пожалуйста, проверьте и подтвердите их.' },
};

export const STAFF_FORM_SUBMITTED = (form: string, number: string) => ({ title: 'Fragebogen ausgefüllt', body: `${number}: Der Kunde hat „${form}“ abgeschickt — Antworten prüfen und ins Profil übernehmen.` });
export const STAFF_CONFIRM_SUBMITTED = (number: string, corrections: number) =>
  corrections
    ? { title: 'Datenbestätigung mit Korrekturen', body: `${number}: Der Kunde hat ${corrections} Korrektur(en) gemeldet — bitte annehmen oder ablehnen.` }
    : { title: 'Daten bestätigt', body: `${number}: Der Kunde hat alle Angaben für die Botschaft bestätigt.` };
