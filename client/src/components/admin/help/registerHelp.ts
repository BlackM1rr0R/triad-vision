import { useEffect, useState } from 'react';
import { registerCopy } from '@/i18n';

const ui = {
  az: {
    adminHelpUi: {
      button: 'Kömək',
      open: 'Bu səhifə necə işləyir?',
      allGuides: 'Bütün bələdçilər',
      who: 'Kim istifadə edir',
      how: 'Necə edilir',
      tips: 'Məsləhətlər',
      missing: 'Bu səhifə üçün bələdçi hələ hazırlanır.',
      centerTitle: 'Kömək mərkəzi',
      centerIntro: 'Admin panelin hər bölməsi üçün qısa bələdçi: nə üçündür, kim istifadə edir və addım-addım necə işləmək lazımdır.',
      search: 'Bələdçilərdə axtar…',
      nothing: 'Heç nə tapılmadı.',
      groups: { start: 'Başlanğıc', clients: 'Müştərilər və müraciətlər', jobs: 'İş və işəgötürənlər', communication: 'Ünsiyyət', system: 'Sistem və idarəetmə' },
    },
  },
  de: {
    adminHelpUi: {
      button: 'Hilfe',
      open: 'Wie funktioniert diese Seite?',
      allGuides: 'Alle Anleitungen',
      who: 'Wer nutzt das',
      how: 'So geht es',
      tips: 'Tipps',
      missing: 'Die Anleitung für diese Seite wird noch erstellt.',
      centerTitle: 'Hilfe-Center',
      centerIntro: 'Eine kurze Anleitung für jeden Bereich des Admin-Panels: wofür er da ist, wer ihn nutzt und wie man Schritt für Schritt arbeitet.',
      search: 'Anleitungen durchsuchen…',
      nothing: 'Nichts gefunden.',
      groups: { start: 'Erste Schritte', clients: 'Kunden und Anträge', jobs: 'Jobs und Arbeitgeber', communication: 'Kommunikation', system: 'System und Verwaltung' },
    },
  },
  en: {
    adminHelpUi: {
      button: 'Help',
      open: 'How does this page work?',
      allGuides: 'All guides',
      who: 'Who uses it',
      how: 'How to',
      tips: 'Tips',
      missing: 'The guide for this page is still being written.',
      centerTitle: 'Help centre',
      centerIntro: 'A short guide for every section of the admin panel: what it is for, who uses it and how to work with it step by step.',
      search: 'Search the guides…',
      nothing: 'Nothing found.',
      groups: { start: 'Getting started', clients: 'Clients and cases', jobs: 'Jobs and employers', communication: 'Communication', system: 'System and administration' },
    },
  },
  ru: {
    adminHelpUi: {
      button: 'Помощь',
      open: 'Как работает эта страница?',
      allGuides: 'Все инструкции',
      who: 'Кто пользуется',
      how: 'Как это сделать',
      tips: 'Советы',
      missing: 'Инструкция для этой страницы ещё готовится.',
      centerTitle: 'Центр помощи',
      centerIntro: 'Короткая инструкция для каждого раздела админ-панели: для чего он, кто им пользуется и как работать шаг за шагом.',
      search: 'Поиск по инструкциям…',
      nothing: 'Ничего не найдено.',
      groups: { start: 'Начало работы', clients: 'Клиенты и заявки', jobs: 'Вакансии и работодатели', communication: 'Общение', system: 'Система и управление' },
    },
  },
};

let done = false;
/** Registers the help UI texts (button, drawer, help centre chrome) once. */
export const registerHelpCopy = () => {
  if (done) return;
  done = true;
  registerCopy(ui);
};

// The guides themselves (~300 kB in four languages) are their own chunk: fetched when a guide is first
// shown (help drawer opened, help centre visited), not with every admin page.
let guides: Promise<void> | null = null;
let guidesReady = false;
export const loadHelpGuides = () =>
  (guides ??= Promise.all([import('@/i18n/adminHelp/part1'), import('@/i18n/adminHelp/part2')])
    .then(([p1, p2]) => {
      registerCopy(p1.adminHelpPart1);
      registerCopy(p2.adminHelpPart2);
      guidesReady = true;
    })
    .catch((err) => {
      guides = null; // allow a retry (e.g. offline, or a new deployment replaced the chunk)
      throw err;
    }));

/** True once the guide texts are registered; starts loading them when `load` is true. */
export const useHelpGuides = (load = true) => {
  const [ready, setReady] = useState(guidesReady);
  useEffect(() => {
    if (!load || ready) return;
    let alive = true;
    loadHelpGuides().then(
      () => alive && setReady(true),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [load, ready]);
  return ready;
};
