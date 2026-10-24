import type { siteNavCopy } from '../../siteNav';
import type { SiteCopy } from '../types';

const copy: SiteCopy<(typeof siteNavCopy)['en']> = {
  siteNav: {
    workers: 'Працівникам',
    employers: 'Роботодавцям',
    tools: 'Інструменти',
    book: 'Записатися на консультацію',
    bookShort: 'Консультація',
    portal: 'Кабінет',
    workersMenu: 'Меню для працівників',
    employersMenu: 'Меню для роботодавців',
    overview: {
      worker: { title: 'Усе для працівників', text: 'Вакансії, візи, Ausbildung і підтримка на кожному кроці.' },
      employer: { title: 'Усе для роботодавців', text: 'Фахівці з-за кордону: підбір, віза та інтеграція від однієї команди.' },
    },
    w: {
      how: 'Як це працює',
      visas: 'Візи',
      ausbildung: 'Ausbildung',
      jobs: 'Вакансії',
      tools: 'Калькулятори й тести',
      stories: 'Історії успіху',
      faq: 'Запитання та відповіді',
      events: 'Заходи та вебінари',
      apply: 'Безкоштовна реєстрація',
    },
    e: {
      services: 'Послуги для компаній',
      how: 'Як відбувається найм',
      cooperation: 'Співпраця',
      request: 'Запросити кандидатів',
      register: 'Реєстрація компанії',
      partners: 'Наші партнери',
      stories: 'Відгуки компаній',
    },
    footer: {
      workers: 'Працівникам',
      employers: 'Роботодавцям',
      resources: 'Ресурси',
      company: 'Компанія',
      cookiePolicy: 'Політика cookie',
      status: 'Статус заявки',
    },
    home: {
      question: 'Хто ви?',
      hint: 'Оберіть — і ми покажемо лише те, що стосується вас.',
      worker: { title: 'Я працівник', text: 'Шукаю роботу, візу або Ausbildung у Німеччині' },
      employer: { title: 'Я роботодавець', text: 'Шукаю працівників з-за кордону для своєї компанії' },
      showingWorker: 'Матеріали для працівників',
      showingEmployer: 'Матеріали для роботодавців',
      switchToWorker: 'Дивитися як працівник',
      switchToEmployer: 'Дивитися як роботодавець',
      showAll: 'Показати все',
      fullPage: 'Відкрити всю сторінку',
    },
  },
};

export default copy;
