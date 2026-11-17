/** Server texts of the access-control module, keyed by locale (az primary). */
export type AccessLocale = 'az' | 'de' | 'en' | 'ru';

export const accessTexts: Record<AccessLocale, { breakGlassTitle: (who: string, number: string) => string; breakGlassBody: (reason: string, hours: number) => string }> = {
  az: {
    breakGlassTitle: (who, number) => `Təcili giriş: ${who} → müraciət ${number}`,
    breakGlassBody: (reason, hours) => `Səbəb: ${reason}\nGiriş ${hours} saat açıqdır. Giriş Mərkəzində baxa və ləğv edə bilərsiniz.`,
  },
  de: {
    breakGlassTitle: (who, number) => `Notfallzugriff: ${who} → Fall ${number}`,
    breakGlassBody: (reason, hours) => `Grund: ${reason}\nDer Zugriff gilt ${hours} Stunden. Im Access Center einsehen und widerrufen.`,
  },
  en: {
    breakGlassTitle: (who, number) => `Emergency access: ${who} → case ${number}`,
    breakGlassBody: (reason, hours) => `Reason: ${reason}\nAccess is open for ${hours} hours. Review or revoke it in the Access Center.`,
  },
  ru: {
    breakGlassTitle: (who, number) => `Экстренный доступ: ${who} → дело ${number}`,
    breakGlassBody: (reason, hours) => `Причина: ${reason}\nДоступ открыт на ${hours} ч. Проверить или отозвать можно в Центре доступа.`,
  },
};

export const accessText = (locale: string | null | undefined) => accessTexts[(locale as AccessLocale) in accessTexts ? (locale as AccessLocale) : 'az'];
