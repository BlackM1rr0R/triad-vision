import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import az from './locales/az.json';
import de from './locales/de.json';
import en from './locales/en.json';
import ru from './locales/ru.json';
import mAz from './mobile.az.json';
import mDe from './mobile.de.json';
import mEn from './mobile.en.json';
import mRu from './mobile.ru.json';
import { deepMerge, pickLanguage, SUPPORTED, type Lang } from './merge';

export { SUPPORTED as LANGUAGES, type Lang };

const LANG_KEY = 'tv_lang';

/** Web translations (synced from client/src/i18n) + mobile-only strings under `m.*`. */
export const resources = {
  az: { translation: deepMerge(az, mAz) },
  de: { translation: deepMerge(de, mDe) },
  en: { translation: deepMerge(en, mEn) },
  ru: { translation: deepMerge(ru, mRu) },
};

export const LANGUAGE_NAMES: Record<Lang, string> = { az: 'Azərbaycan', de: 'Deutsch', en: 'English', ru: 'Русский' };

export const deviceLanguage = (): Lang => {
  try {
    return pickLanguage(getLocales().map((l) => l.languageTag ?? l.languageCode));
  } catch {
    return 'az';
  }
};

void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: 'az',
  supportedLngs: [...SUPPORTED],
  interpolation: { escapeValue: false },
  returnObjects: true,
  react: { useSuspense: false },
});

/** Restores the language the user picked earlier on this phone (falls back to the device language). */
export const restoreLanguage = async () => {
  try {
    const saved = await SecureStore.getItemAsync(LANG_KEY);
    if (saved && (SUPPORTED as readonly string[]).includes(saved) && saved !== i18n.language) {
      await i18n.changeLanguage(saved);
    }
  } catch {
    /* keep device language */
  }
};

export const setAppLanguage = async (lng: Lang) => {
  if (i18n.language !== lng) await i18n.changeLanguage(lng);
  await SecureStore.setItemAsync(LANG_KEY, lng).catch(() => undefined);
};

export const currentLanguage = (): Lang => pickLanguage([i18n.language]);

export const DATE_LOCALE: Record<Lang, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

export default i18n;
