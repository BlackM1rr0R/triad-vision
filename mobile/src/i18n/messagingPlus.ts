import i18n from './index';

/**
 * Mobile strings of messaging plus (automatic translation, voice message playback) under `m.msgPlus.*`.
 * Registered by the feature module itself (src/features/chat/messagingPlus.tsx). German formal "Sie", Russian "вы".
 */
const az = {
  msgPlus: {
    translated: 'Tərcümə olunub',
    showOriginal: 'Orijinalı göstər',
    showTranslation: 'Tərcüməni göstər',
    unavailable: 'Avtomatik tərcümə hazırda mümkün deyil — mesajlar orijinal dildə göstərilir.',
    voice: 'Səsli mesaj',
    play: 'Dinlə',
    playFailed: 'Səsli mesajı açmaq alınmadı.',
    transcriptPending: 'Mətnə çevrilir…',
    transcriptOff: 'Mətnə çevirmə qoşulmayıb',
    transcriptFailed: 'Mətnə çevirmək alınmadı',
    transcriptEmpty: 'Danışıq tanınmadı',
  },
};

type Copy = typeof az;

const de: Copy = {
  msgPlus: {
    translated: 'Übersetzt',
    showOriginal: 'Original anzeigen',
    showTranslation: 'Übersetzung anzeigen',
    unavailable: 'Die automatische Übersetzung ist gerade nicht verfügbar — die Nachrichten werden im Original angezeigt.',
    voice: 'Sprachnachricht',
    play: 'Abspielen',
    playFailed: 'Die Sprachnachricht konnte nicht geöffnet werden.',
    transcriptPending: 'Wird in Text umgewandelt…',
    transcriptOff: 'Umwandlung in Text nicht eingerichtet',
    transcriptFailed: 'Umwandlung in Text fehlgeschlagen',
    transcriptEmpty: 'Keine Sprache erkannt',
  },
};

const en: Copy = {
  msgPlus: {
    translated: 'Translated',
    showOriginal: 'Show original',
    showTranslation: 'Show translation',
    unavailable: 'Automatic translation is not available right now — messages are shown in their original language.',
    voice: 'Voice message',
    play: 'Play',
    playFailed: 'The voice message could not be opened.',
    transcriptPending: 'Transcribing…',
    transcriptOff: 'Transcription is not set up',
    transcriptFailed: 'Transcription failed',
    transcriptEmpty: 'No speech recognised',
  },
};

const ru: Copy = {
  msgPlus: {
    translated: 'Переведено',
    showOriginal: 'Показать оригинал',
    showTranslation: 'Показать перевод',
    unavailable: 'Автоматический перевод сейчас недоступен — сообщения показаны на языке оригинала.',
    voice: 'Голосовое сообщение',
    play: 'Слушать',
    playFailed: 'Не удалось открыть голосовое сообщение.',
    transcriptPending: 'Преобразуется в текст…',
    transcriptOff: 'Преобразование в текст не настроено',
    transcriptFailed: 'Не удалось преобразовать в текст',
    transcriptEmpty: 'Речь не распознана',
  },
};

const bundles = { az, de, en, ru };
for (const [lng, b] of Object.entries(bundles)) i18n.addResourceBundle(lng, 'translation', { m: b }, true, false);

export const messagingPlusCopy = bundles;
