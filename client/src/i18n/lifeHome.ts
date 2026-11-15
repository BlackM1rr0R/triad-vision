/**
 * Home / about pieces of "Life in Germany": the Baku → Germany scroll journey and the live numbers board.
 * Small on purpose (ships with the home page chunk). Registered with registerCopy(lifeHomeCopy). Keys under life.*.
 */

const az = {
  life: {
    journey: {
      eyebrow: 'Bakıdan Almaniyaya',
      title: 'Sənədlərdən Almaniyaya gəlişə qədər',
      subtitle: 'Dörd əsas addım — hər birində yanınızdayıq.',
      baku: 'Bakı',
      germany: 'Almaniya',
      aria: 'Bakıdan Almaniyaya yol: sənədlər, müqavilə, viza, gəliş',
      cta: 'Almaniyada həyatınız necə olacaq? Simulyatoru açın',
    },
    live: {
      eyebrow: 'Canlı rəqəmlər',
      title: 'Bu ay Triad Vision ilə',
      titlePrevious: 'Keçən ay Triad Vision ilə',
      visas: 'viza verildi',
      arrivals: 'nəfər Almaniyaya gəldi',
      professions: 'Ən çox peşələr',
      cities: 'Ən çox şəhərlər',
      note: 'Anonim və ümumiləşdirilmiş məlumat; {{n}} nəfərdən az olan rəqəmlər göstərilmir. Saatda bir yenilənir.',
    },
  },
};

type Copy = typeof az;

const de: Copy = {
  life: {
    journey: {
      eyebrow: 'Von Baku nach Deutschland',
      title: 'Von den Unterlagen bis zur Ankunft',
      subtitle: 'Vier große Schritte — bei jedem sind wir an Ihrer Seite.',
      baku: 'Baku',
      germany: 'Deutschland',
      aria: 'Weg von Baku nach Deutschland: Unterlagen, Vertrag, Visum, Ankunft',
      cta: 'Wie wird Ihr Leben in Deutschland? Zum Simulator',
    },
    live: {
      eyebrow: 'Live-Zahlen',
      title: 'Diesen Monat mit Triad Vision',
      titlePrevious: 'Letzten Monat mit Triad Vision',
      visas: 'Visa erteilt',
      arrivals: 'Menschen in Deutschland angekommen',
      professions: 'Häufigste Berufe',
      cities: 'Häufigste Städte',
      note: 'Anonym und zusammengefasst; Werte unter {{n}} werden nicht gezeigt. Stündlich aktualisiert.',
    },
  },
};

const en: Copy = {
  life: {
    journey: {
      eyebrow: 'From Baku to Germany',
      title: 'From your documents to your arrival',
      subtitle: 'Four big steps — we are with you at each of them.',
      baku: 'Baku',
      germany: 'Germany',
      aria: 'Route from Baku to Germany: documents, contract, visa, arrival',
      cta: 'What will life in Germany look like? Open the simulator',
    },
    live: {
      eyebrow: 'Live numbers',
      title: 'This month with Triad Vision',
      titlePrevious: 'Last month with Triad Vision',
      visas: 'visas granted',
      arrivals: 'people arrived in Germany',
      professions: 'Top professions',
      cities: 'Top cities',
      note: 'Anonymous and aggregated; figures below {{n}} are not shown. Updated hourly.',
    },
  },
};

const ru: Copy = {
  life: {
    journey: {
      eyebrow: 'Из Баку в Германию',
      title: 'От документов до приезда',
      subtitle: 'Четыре больших шага — на каждом мы рядом.',
      baku: 'Баку',
      germany: 'Германия',
      aria: 'Путь из Баку в Германию: документы, договор, виза, приезд',
      cta: 'Какой будет жизнь в Германии? Открыть симулятор',
    },
    live: {
      eyebrow: 'Живые цифры',
      title: 'В этом месяце с Triad Vision',
      titlePrevious: 'В прошлом месяце с Triad Vision',
      visas: 'виз получено',
      arrivals: 'человек приехали в Германию',
      professions: 'Чаще всего профессии',
      cities: 'Чаще всего города',
      note: 'Анонимно и в обобщённом виде; цифры меньше {{n}} не показываются. Обновляется раз в час.',
    },
  },
};

const tr: Copy = {
  life: {
    journey: {
      eyebrow: 'Bakü’den Almanya’ya',
      title: 'Belgelerden varışa kadar',
      subtitle: 'Dört büyük adım — her birinde yanınızdayız.',
      baku: 'Bakü',
      germany: 'Almanya',
      aria: 'Bakü’den Almanya’ya yol: belgeler, sözleşme, vize, varış',
      cta: 'Almanya’da hayat nasıl olacak? Simülatörü açın',
    },
    live: {
      eyebrow: 'Canlı rakamlar',
      title: 'Bu ay Triad Vision ile',
      titlePrevious: 'Geçen ay Triad Vision ile',
      visas: 'vize verildi',
      arrivals: 'kişi Almanya’ya geldi',
      professions: 'En çok meslekler',
      cities: 'En çok şehirler',
      note: 'Anonim ve toplu veriler; {{n}} altındaki rakamlar gösterilmez. Saatte bir güncellenir.',
    },
  },
};

const uk: Copy = {
  life: {
    journey: {
      eyebrow: 'З Баку до Німеччини',
      title: 'Від документів до приїзду',
      subtitle: 'Чотири великі кроки — на кожному ми поруч.',
      baku: 'Баку',
      germany: 'Німеччина',
      aria: 'Шлях з Баку до Німеччини: документи, договір, віза, приїзд',
      cta: 'Яким буде життя в Німеччині? Відкрити симулятор',
    },
    live: {
      eyebrow: 'Живі цифри',
      title: 'Цього місяця з Triad Vision',
      titlePrevious: 'Минулого місяця з Triad Vision',
      visas: 'віз видано',
      arrivals: 'людей приїхали до Німеччини',
      professions: 'Найчастіші професії',
      cities: 'Найчастіші міста',
      note: 'Анонімно й узагальнено; цифри менші за {{n}} не показуються. Оновлюється щогодини.',
    },
  },
};


export const lifeHomeCopy = { az, de, en, ru, tr, uk };
