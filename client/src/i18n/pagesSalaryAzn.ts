/**
 * Manat equivalent under the salary calculator (/salary-calculator): net pay in AZN at the official CBAR rate.
 * All six site languages. Keys under salaryAzn.*. {{rate}} = 1 € in ₼, {{date}} = bulletin date.
 */
const az = {
  salaryAzn: {
    title: 'Xalis maaş manatla (təxmini)',
    month: 'Ayda',
    year: 'İldə',
    rate: '1 € = {{rate}} ₼ · AMB-nin rəsmi məzənnəsi, {{date}}',
    stale: 'son məlum məzənnə; AMB hazırda əlçatan deyil',
    none: 'Manat məbləği hələ yoxdur: AMB məzənnəsi alınmayıb.',
  },
};
type Copy = typeof az;

const de: Copy = {
  salaryAzn: {
    title: 'Netto in Manat (ungefähr)',
    month: 'Pro Monat',
    year: 'Pro Jahr',
    rate: '1 € = {{rate}} ₼ · amtlicher Kurs der CBAR, {{date}}',
    stale: 'letzter bekannter Kurs; die CBAR ist gerade nicht erreichbar',
    none: 'Noch kein Manat-Betrag: Kurs der CBAR nicht abgerufen.',
  },
};
const en: Copy = {
  salaryAzn: {
    title: 'Net pay in manat (approx.)',
    month: 'Per month',
    year: 'Per year',
    rate: '1 € = {{rate}} ₼ · official CBAR rate, {{date}}',
    stale: 'last known rate; CBAR cannot be reached right now',
    none: 'No manat amount yet: the CBAR rate has not been fetched.',
  },
};
const ru: Copy = {
  salaryAzn: {
    title: 'Нетто в манатах (примерно)',
    month: 'В месяц',
    year: 'В год',
    rate: '1 € = {{rate}} ₼ · официальный курс ЦБА, {{date}}',
    stale: 'последний известный курс; ЦБА сейчас недоступен',
    none: 'Суммы в манатах пока нет: курс ЦБА не получен.',
  },
};
const tr: Copy = {
  salaryAzn: {
    title: 'Manat olarak net maaş (yaklaşık)',
    month: 'Aylık',
    year: 'Yıllık',
    rate: '1 € = {{rate}} ₼ · Azerbaycan Merkez Bankası (CBAR) resmi kuru, {{date}}',
    stale: 'bilinen son kur; CBAR şu anda erişilemiyor',
    none: 'Henüz manat tutarı yok: CBAR kuru alınamadı.',
  },
};
const uk: Copy = {
  salaryAzn: {
    title: 'Нетто в манатах (приблизно)',
    month: 'На місяць',
    year: 'На рік',
    rate: '1 € = {{rate}} ₼ · офіційний курс ЦБА, {{date}}',
    stale: 'останній відомий курс; ЦБА зараз недоступний',
    none: 'Суми в манатах поки немає: курс ЦБА не отримано.',
  },
};

export const pagesSalaryAzn = { az, de, en, ru, tr, uk };
