import type { Locale } from '@prisma/client';
import type { QualityCode, QualityReason } from './quality.js';
import type { DocType } from './types.js';

/**
 * Server-side texts of smart uploads (the reason written on a document staff send back with one click,
 * notifications). The UI has its own copy (client/src/i18n/pagesUploadAi.ts, mobile m.uploadAi.*).
 */

type L = Record<Locale, string>;

export const TYPE_LABEL: Record<DocType, L> = {
  PASSPORT: { az: 'pasport', de: 'Reisepass', en: 'passport', ru: 'паспорт' },
  ID_CARD: { az: 'şəxsiyyət vəsiqəsi', de: 'Personalausweis', en: 'ID card', ru: 'удостоверение личности' },
  BIRTH_CERT: { az: 'doğum şəhadətnaməsi', de: 'Geburtsurkunde', en: 'birth certificate', ru: 'свидетельство о рождении' },
  DIPLOMA: { az: 'diplom', de: 'Diplom', en: 'diploma', ru: 'диплом' },
  TRANSCRIPT: { az: 'diplom əlavəsi (qiymət cədvəli)', de: 'Notenauszug', en: 'transcript', ru: 'приложение к диплому' },
  VOCATIONAL_CERT: { az: 'peşə təhsili sənədi', de: 'Berufsabschluss', en: 'vocational certificate', ru: 'документ о профобразовании' },
  DRIVING_LICENCE: { az: 'sürücülük vəsiqəsi', de: 'Führerschein', en: 'driving licence', ru: 'водительское удостоверение' },
  CV: { az: 'CV', de: 'Lebenslauf', en: 'CV', ru: 'резюме' },
  PHOTO: { az: 'foto', de: 'Foto', en: 'photo', ru: 'фото' },
  EMPLOYMENT_CONTRACT: { az: 'əmək müqaviləsi', de: 'Arbeitsvertrag', en: 'employment contract', ru: 'трудовой договор' },
  JOB_OFFER: { az: 'iş təklifi', de: 'Arbeitsangebot', en: 'job offer', ru: 'предложение о работе' },
  EMPLOYMENT_REFERENCE: { az: 'iş yerindən arayış', de: 'Arbeitszeugnis', en: 'employment reference', ru: 'справка с места работы' },
  LANGUAGE_CERT: { az: 'dil sertifikatı', de: 'Sprachzertifikat', en: 'language certificate', ru: 'языковой сертификат' },
  RECOGNITION_DECISION: { az: 'tanınma qərarı (Anerkennung)', de: 'Anerkennungsbescheid', en: 'recognition decision', ru: 'решение о признании' },
  INSURANCE: { az: 'sığorta', de: 'Versicherungsnachweis', en: 'insurance', ru: 'страховка' },
  BANK_STATEMENT: { az: 'bank çıxarışı', de: 'Kontoauszug', en: 'bank statement', ru: 'банковская выписка' },
  POLICE_CERT: { az: 'məhkumluq haqqında arayış', de: 'Führungszeugnis', en: 'police certificate', ru: 'справка о несудимости' },
  MARRIAGE_CERT: { az: 'nikah şəhadətnaməsi', de: 'Heiratsurkunde', en: 'marriage certificate', ru: 'свидетельство о браке' },
  VISA: { az: 'viza', de: 'Visum', en: 'visa', ru: 'виза' },
  RESIDENCE_PERMIT: { az: 'yaşayış icazəsi', de: 'Aufenthaltstitel', en: 'residence permit', ru: 'вид на жительство' },
  OTHER: { az: 'sənəd', de: 'Dokument', en: 'document', ru: 'документ' },
};

const QUALITY: Record<QualityCode, L> = {
  LOW_RESOLUTION: {
    az: 'Şəklin ölçüsü çox kiçikdir — mətn oxunmaya bilər.',
    de: 'Das Bild ist zu klein – der Text ist womöglich nicht lesbar.',
    en: 'The image resolution is too low — the text may not be readable.',
    ru: 'Слишком низкое разрешение — текст может быть нечитаемым.',
  },
  BLURRY: {
    az: 'Şəkil bulanıqdır.',
    de: 'Das Foto ist unscharf.',
    en: 'The photo is blurry.',
    ru: 'Фото размыто.',
  },
  TOO_DARK: {
    az: 'Şəkil çox qaranlıqdır.',
    de: 'Das Foto ist zu dunkel.',
    en: 'The photo is too dark.',
    ru: 'Фото слишком тёмное.',
  },
  OVEREXPOSED: {
    az: 'Şəkil çox açıqdır, mətn solğun görünür.',
    de: 'Das Foto ist überbelichtet, der Text ist blass.',
    en: 'The photo is overexposed, the text looks faded.',
    ru: 'Фото пересвечено, текст бледный.',
  },
  NO_CONTENT: {
    az: 'Şəkildə sənəd görünmür.',
    de: 'Auf dem Bild ist kein Dokument zu erkennen.',
    en: 'No document can be seen in the image.',
    ru: 'На изображении не виден документ.',
  },
  GLARE: {
    az: 'Şəkildə parıltı (işıq əksi) var — mətnin bir hissəsi görünmür.',
    de: 'Auf dem Foto spiegelt Licht – ein Teil des Textes ist nicht zu sehen.',
    en: 'There is glare on the photo — part of the text cannot be seen.',
    ru: 'На фото блик — часть текста не видна.',
  },
  CUT_OFF: {
    az: 'Sənədin kənarları kəsilib.',
    de: 'Die Ränder des Dokuments sind abgeschnitten.',
    en: 'The edges of the document are cut off.',
    ru: 'Края документа обрезаны.',
  },
  TOO_COMPRESSED: {
    az: 'Şəkil çox sıxılıb, keyfiyyət aşağıdır.',
    de: 'Das Bild ist stark komprimiert, die Qualität ist gering.',
    en: 'The image is heavily compressed, the quality is low.',
    ru: 'Изображение сильно сжато, качество низкое.',
  },
  UNREADABLE: {
    az: 'Şəkil faylı zədələnib və açılmır.',
    de: 'Die Bilddatei ist beschädigt und lässt sich nicht öffnen.',
    en: 'The image file is damaged and cannot be opened.',
    ru: 'Файл изображения повреждён и не открывается.',
  },
  PDF_UNREADABLE: {
    az: 'PDF faylı açılmır (zədələnib və ya şifrələnib).',
    de: 'Die PDF-Datei lässt sich nicht öffnen (beschädigt oder verschlüsselt).',
    en: 'The PDF cannot be opened (damaged or encrypted).',
    ru: 'PDF-файл не открывается (повреждён или зашифрован).',
  },
  PDF_LOW_DPI: {
    az: 'Skan çox aşağı keyfiyyətlə edilib.',
    de: 'Der Scan hat eine zu geringe Auflösung.',
    en: 'The scan resolution is too low.',
    ru: 'Скан сделан со слишком низким разрешением.',
  },
  PDF_SMALL_PAGE: {
    az: 'PDF səhifəsi çox kiçikdir.',
    de: 'Die PDF-Seite ist sehr klein.',
    en: 'The PDF page is very small.',
    ru: 'Страница PDF очень маленькая.',
  },
  PDF_NO_PAGES: {
    az: 'PDF faylında səhifə yoxdur.',
    de: 'Die PDF-Datei enthält keine Seiten.',
    en: 'The PDF has no pages.',
    ru: 'В PDF-файле нет страниц.',
  },
};

const TIPS: L = {
  az: 'Sənədi düz səthə qoyun, gün işığında, flaşsız və bütün kənarları görünəcək şəkildə yenidən çəkin.',
  de: 'Bitte legen Sie das Dokument flach hin und fotografieren Sie es bei Tageslicht, ohne Blitz und mit allen Rändern neu.',
  en: 'Please lay the document flat and retake it in daylight, without flash, with all edges visible.',
  ru: 'Положите документ на ровную поверхность и переснимите при дневном свете, без вспышки, чтобы были видны все края.',
};

const WRONG: L = {
  az: 'Bu fayl «{{found}}» sənədinə oxşayır, tələb olunan isə «{{expected}}».',
  de: 'Die Datei sieht aus wie: {{found}}. Verlangt ist: {{expected}}.',
  en: 'This file looks like a {{found}}, but a {{expected}} is required.',
  ru: 'Файл похож на: {{found}}, а требуется: {{expected}}.',
};

const PLEASE: L = {
  az: 'Zəhmət olmasa sənədi yenidən yükləyin.',
  de: 'Bitte laden Sie das Dokument erneut hoch.',
  en: 'Please upload the document again.',
  ru: 'Пожалуйста, загрузите документ заново.',
};

export const qualityText = (code: QualityCode, locale: Locale) => QUALITY[code][locale];

/**
 * The note on a document sent back with "Ask client to re-upload": the quality problems (and the wrong type
 * when the recogniser saw one), the photo tips and a request to upload again — in the client's language.
 */
export const reuploadNote = (locale: Locale, input: { reasons: QualityReason[]; found?: DocType | null; expected?: DocType | null }) => {
  const lines: string[] = [];
  if (input.found && input.expected && input.found !== input.expected) {
    lines.push(WRONG[locale].replace('{{found}}', TYPE_LABEL[input.found][locale]).replace('{{expected}}', TYPE_LABEL[input.expected][locale]));
  }
  const codes = [...new Set(input.reasons.map((r) => r.code))];
  for (const c of codes.slice(0, 3)) lines.push(QUALITY[c][locale]);
  if (codes.some((c) => !c.startsWith('PDF_'))) lines.push(TIPS[locale]);
  lines.push(PLEASE[locale]);
  return lines.join(' ').slice(0, 1000);
};
