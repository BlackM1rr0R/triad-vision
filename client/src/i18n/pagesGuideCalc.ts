// Compact calculators embedded in the topic guides (`::calculator{type="…"}`, components/guides/calculators).
// The Chancenkarte and Blue Card widgets reuse the ckCalc / bcCheck copy of pagesSeo; this file holds the rest.
// All six site languages: registered with registerCopy(pagesGuideCalc) by the widget chunk.

const az = {
  guideCalc: {
    eyebrow: 'İnteraktiv kalkulyator',
    live: 'Nəticə dəyərləri dəyişdikcə dərhal yenilənir.',
    openFull: 'Tam kalkulyatoru açın',
    titles: { chancenkarte: 'Chancenkarte xallarınızı hesablayın', blueCard: 'Maaşınız Mavi Kart üçün kifayətdirmi?', cost: 'Köçün təxmini xərcləri', salary: 'Almaniyada xalis maaşınız' },
    salary: {
      gross: 'Aylıq ümumi (brutto) maaş, €',
      taxClass: 'Vergi sinfi',
      state: 'Federal əyalət',
      net: 'Aylıq xalis (netto)',
      deductions: 'Vergi və sosial ödənişlər',
      hint: 'Sadələşdirilmiş hesablama: kilsə vergisi və uşaq yoxdur, dövlət tibbi sığortası.',
    },
    cost: {
      visa: 'Viza növü',
      adults: 'Böyüklər',
      children: 'Uşaqlar',
      pick: 'Hesablamaq üçün viza növünü seçin.',
      oneTime: 'Birdəfəlik xərclər',
      refundable: 'Geri qaytarılan (bloklanmış hesab və s.)',
      disabled: 'Xərc kalkulyatoru hazırda əlçatan deyil.',
    },
    ck: { assumeFunds: 'Yaşayış xərclərinin təmin olunduğu fərz edilir.' },
    error: 'Hesablama yüklənmədi. Tam kalkulyatoru açın.',
  },
};

const de: typeof az = {
  guideCalc: {
    eyebrow: 'Interaktiver Rechner',
    live: 'Das Ergebnis aktualisiert sich sofort bei jeder Eingabe.',
    openFull: 'Vollständigen Rechner öffnen',
    titles: { chancenkarte: 'Chancenkarte-Punkte berechnen', blueCard: 'Reicht Ihr Gehalt für die Blaue Karte?', cost: 'Geschätzte Kosten der Auswanderung', salary: 'Ihr Nettogehalt in Deutschland' },
    salary: {
      gross: 'Bruttogehalt pro Monat, €',
      taxClass: 'Steuerklasse',
      state: 'Bundesland',
      net: 'Netto pro Monat',
      deductions: 'Steuern und Sozialabgaben',
      hint: 'Vereinfachte Berechnung: ohne Kirchensteuer und Kinder, gesetzlich krankenversichert.',
    },
    cost: {
      visa: 'Visumart',
      adults: 'Erwachsene',
      children: 'Kinder',
      pick: 'Wählen Sie eine Visumart für die Berechnung.',
      oneTime: 'Einmalige Kosten',
      refundable: 'Rückzahlbar (Sperrkonto u. a.)',
      disabled: 'Der Kostenrechner ist derzeit nicht verfügbar.',
    },
    ck: { assumeFunds: 'Angenommen: Der Lebensunterhalt ist gesichert.' },
    error: 'Die Berechnung konnte nicht geladen werden. Öffnen Sie den vollständigen Rechner.',
  },
};

const en: typeof az = {
  guideCalc: {
    eyebrow: 'Interactive calculator',
    live: 'The result updates instantly as you change the values.',
    openFull: 'Open the full calculator',
    titles: { chancenkarte: 'Calculate your Opportunity Card points', blueCard: 'Is your salary enough for the Blue Card?', cost: 'Estimated cost of moving', salary: 'Your net salary in Germany' },
    salary: {
      gross: 'Gross salary per month, €',
      taxClass: 'Tax class',
      state: 'Federal state',
      net: 'Net per month',
      deductions: 'Tax and social contributions',
      hint: 'Simplified estimate: no church tax, no children, statutory health insurance.',
    },
    cost: {
      visa: 'Visa type',
      adults: 'Adults',
      children: 'Children',
      pick: 'Choose a visa type to see the estimate.',
      oneTime: 'One-off costs',
      refundable: 'Refundable (blocked account etc.)',
      disabled: 'The cost calculator is not available right now.',
    },
    ck: { assumeFunds: 'Assumes your livelihood is secured.' },
    error: 'The calculation could not be loaded. Open the full calculator.',
  },
};

const ru: typeof az = {
  guideCalc: {
    eyebrow: 'Интерактивный калькулятор',
    live: 'Результат обновляется сразу при изменении данных.',
    openFull: 'Открыть полный калькулятор',
    titles: { chancenkarte: 'Посчитайте баллы Chancenkarte', blueCard: 'Хватит ли вашей зарплаты для Голубой карты?', cost: 'Примерные расходы на переезд', salary: 'Ваша зарплата нетто в Германии' },
    salary: {
      gross: 'Зарплата брутто в месяц, €',
      taxClass: 'Налоговый класс',
      state: 'Федеральная земля',
      net: 'Нетто в месяц',
      deductions: 'Налоги и соцвзносы',
      hint: 'Упрощённый расчёт: без церковного налога и детей, государственная медстраховка.',
    },
    cost: {
      visa: 'Тип визы',
      adults: 'Взрослые',
      children: 'Дети',
      pick: 'Выберите тип визы, чтобы увидеть расчёт.',
      oneTime: 'Разовые расходы',
      refundable: 'Возвратные (блокированный счёт и др.)',
      disabled: 'Калькулятор расходов сейчас недоступен.',
    },
    ck: { assumeFunds: 'Предполагается, что средства к существованию обеспечены.' },
    error: 'Не удалось загрузить расчёт. Откройте полный калькулятор.',
  },
};

const tr: typeof az = {
  guideCalc: {
    eyebrow: 'Etkileşimli hesaplayıcı',
    live: 'Sonuç, değerleri değiştirdikçe anında güncellenir.',
    openFull: 'Tam hesaplayıcıyı açın',
    titles: { chancenkarte: 'Fırsat Kartı puanınızı hesaplayın', blueCard: 'Maaşınız Mavi Kart için yeterli mi?', cost: 'Taşınmanın tahmini maliyeti', salary: 'Almanya’daki net maaşınız' },
    salary: {
      gross: 'Aylık brüt maaş, €',
      taxClass: 'Vergi sınıfı',
      state: 'Eyalet',
      net: 'Aylık net',
      deductions: 'Vergi ve sosyal kesintiler',
      hint: 'Basitleştirilmiş hesap: kilise vergisi ve çocuk yok, yasal sağlık sigortası.',
    },
    cost: {
      visa: 'Vize türü',
      adults: 'Yetişkinler',
      children: 'Çocuklar',
      pick: 'Tahmini görmek için bir vize türü seçin.',
      oneTime: 'Tek seferlik maliyetler',
      refundable: 'İade edilebilir (bloke hesap vb.)',
      disabled: 'Maliyet hesaplayıcı şu anda kullanılamıyor.',
    },
    ck: { assumeFunds: 'Geçiminizin güvence altında olduğu varsayılır.' },
    error: 'Hesaplama yüklenemedi. Tam hesaplayıcıyı açın.',
  },
};

const uk: typeof az = {
  guideCalc: {
    eyebrow: 'Інтерактивний калькулятор',
    live: 'Результат оновлюється одразу під час зміни даних.',
    openFull: 'Відкрити повний калькулятор',
    titles: { chancenkarte: 'Порахуйте бали Chancenkarte', blueCard: 'Чи вистачить вашої зарплати для Блакитної карти?', cost: 'Орієнтовні витрати на переїзд', salary: 'Ваша зарплата нетто в Німеччині' },
    salary: {
      gross: 'Зарплата брутто на місяць, €',
      taxClass: 'Податковий клас',
      state: 'Федеральна земля',
      net: 'Нетто на місяць',
      deductions: 'Податки та соцвнески',
      hint: 'Спрощений розрахунок: без церковного податку й дітей, державне медичне страхування.',
    },
    cost: {
      visa: 'Тип візи',
      adults: 'Дорослі',
      children: 'Діти',
      pick: 'Оберіть тип візи, щоб побачити розрахунок.',
      oneTime: 'Разові витрати',
      refundable: 'Повертаються (блокований рахунок тощо)',
      disabled: 'Калькулятор витрат зараз недоступний.',
    },
    ck: { assumeFunds: 'Передбачається, що кошти на проживання забезпечені.' },
    error: 'Не вдалося завантажити розрахунок. Відкрийте повний калькулятор.',
  },
};

export const pagesGuideCalc = { az, de, en, ru, tr, uk };
