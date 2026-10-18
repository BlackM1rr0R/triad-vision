// Super-admin AI assistant panel in the drive, the spreadsheet editor and the settlements page
// (components/aiAdmin). Registered with registerCopy(pagesAiAdmin) by AdminAiPanel. Same keys in every language.
const az = {
  aiAdmin: {
    button: 'AI',
    buttonTitle: 'AI köməkçi: sənədlər, cədvəllər, hesablaşmalar',
    title: 'AI köməkçi',
    close: 'Bağla',
    unavailable: 'AI köməkçi hələ əlçatan deyil.',
    sheetHint: 'Bu cədvəllə işlə',
    driveHint: 'Bu qovluqla işlə',
    settlementsHint: 'Hesablaşmalarla işlə',
    sheetChanged: 'AI bu faylı dəyişdi. Yenidən yükləyin — saxlanılmamış dəyişiklikləriniz itəcək.',
    sheetReloaded: 'AI dəyişikliyindən sonra cədvəl yeniləndi.',
    reload: 'Yenidən yüklə',
    dismiss: 'Bağla',
  },
};

type Copy = typeof az;

const de: Copy = {
  aiAdmin: {
    button: 'KI',
    buttonTitle: 'KI-Assistent: Dokumente, Tabellen, Abrechnungen',
    title: 'KI-Assistent',
    close: 'Schließen',
    unavailable: 'Der KI-Assistent ist noch nicht verfügbar.',
    sheetHint: 'Mit dieser Tabelle arbeiten',
    driveHint: 'Mit diesem Ordner arbeiten',
    settlementsHint: 'Mit den Abrechnungen arbeiten',
    sheetChanged: 'Die KI hat diese Datei geändert. Neu laden — Ihre ungespeicherten Änderungen gehen verloren.',
    sheetReloaded: 'Tabelle nach der KI-Änderung neu geladen.',
    reload: 'Neu laden',
    dismiss: 'Schließen',
  },
};

const en: Copy = {
  aiAdmin: {
    button: 'AI',
    buttonTitle: 'AI assistant: documents, spreadsheets, settlements',
    title: 'AI assistant',
    close: 'Close',
    unavailable: 'The AI assistant is not available yet.',
    sheetHint: 'Work with this spreadsheet',
    driveHint: 'Work with this folder',
    settlementsHint: 'Work with the settlements',
    sheetChanged: 'The AI changed this file. Reload — your unsaved changes will be lost.',
    sheetReloaded: 'Spreadsheet reloaded after the AI change.',
    reload: 'Reload',
    dismiss: 'Dismiss',
  },
};

const ru: Copy = {
  aiAdmin: {
    button: 'ИИ',
    buttonTitle: 'ИИ-ассистент: документы, таблицы, расчёты',
    title: 'ИИ-ассистент',
    close: 'Закрыть',
    unavailable: 'ИИ-ассистент пока недоступен.',
    sheetHint: 'Работать с этой таблицей',
    driveHint: 'Работать с этой папкой',
    settlementsHint: 'Работать с расчётами',
    sheetChanged: 'ИИ изменил этот файл. Перезагрузите — несохранённые изменения будут потеряны.',
    sheetReloaded: 'Таблица обновлена после изменения ИИ.',
    reload: 'Перезагрузить',
    dismiss: 'Закрыть',
  },
};

export const pagesAiAdmin: { az: Copy; de: Copy; en: Copy; ru: Copy } = { az, de, en, ru };
