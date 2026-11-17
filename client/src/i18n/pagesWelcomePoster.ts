/**
 * "Welcome poster" for a worker's first work day (company portal → arrival checklist). Keys under welcomePoster.*.
 * Employer-facing: de, en, az, ru. Registered with registerCopy(pagesWelcomePoster).
 */
const de = {
  welcomePoster: {
    button: 'Willkommensposter (A3-PDF)',
    title: 'Begrüßen Sie {{name}} am ersten Tag',
    text: 'Zweisprachiges Poster „Xoş gəlmisiniz / Herzlich willkommen“ mit Ihrem Logo, Feldern für Team-Fotos oder Unterschriften und 10 wichtigen Sätzen. Die Ansprechperson aus dem Punkt „Ansprechperson / Buddy“ (erste Zeile der Notiz) wird übernommen – tragen Sie dort den Namen ein.',
    hint: 'Tipp: Willkommensposter ausdrucken und am Arbeitsplatz aufhängen.',
    error: 'Das Poster konnte nicht erstellt werden.',
  },
};

const en: typeof de = {
  welcomePoster: {
    button: 'Welcome poster (A3 PDF)',
    title: 'Welcome {{name}} on the first day',
    text: 'Bilingual poster “Xoş gəlmisiniz / Herzlich willkommen” with your logo, frames for team photos or signatures and 10 key phrases. The contact person from the “Contact person / buddy” item (first line of its note) is included – enter the name there.',
    hint: 'Tip: print the welcome poster and put it up at the workplace.',
    error: 'The poster could not be created.',
  },
};

const az: typeof de = {
  welcomePoster: {
    button: 'Xoş gəlmisiniz posteri (A3 PDF)',
    title: 'İlk iş günü: {{name}} üçün xoş qarşılama',
    text: 'İki dilli «Xoş gəlmisiniz / Herzlich willkommen» posteri: loqonuz, komanda şəkilləri və ya imzalar üçün çərçivələr və 10 vacib ifadə. «Əlaqə şəxsi / iş yoldaşı (Buddy)» bəndinin qeydinin ilk sətri posterə əlavə olunur — adı ora yazın.',
    hint: 'Məsləhət: posteri çap edib iş yerində asın.',
    error: 'Posteri yaratmaq alınmadı.',
  },
};

const ru: typeof de = {
  welcomePoster: {
    button: 'Приветственный плакат (A3 PDF)',
    title: 'Поприветствуйте {{name}} в первый день',
    text: 'Двуязычный плакат «Xoş gəlmisiniz / Herzlich willkommen» с вашим логотипом, рамками для фото команды или подписей и 10 важными фразами. Первая строка заметки пункта «Контактное лицо / наставник (Buddy)» переносится на плакат — впишите туда имя.',
    hint: 'Совет: распечатайте плакат и повесьте его на рабочем месте.',
    error: 'Не удалось создать плакат.',
  },
};

export const pagesWelcomePoster = { az, de, en, ru };
