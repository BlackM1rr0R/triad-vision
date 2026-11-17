/**
 * Official sources of the legal facts in the workplace etiquette quiz (/workplace-etiquette). Checked 2026-11.
 * Customs (Sie / du, birthday cake, small talk, feedback) are not law: the quiz labels them as customs.
 */

export const ETIQUETTE_AS_OF = '2026-11-17';

export const ETIQUETTE_SOURCES = {
  entgfg5: { label: '§ 5 EntgFG – Anzeige- und Nachweispflichten (Krankmeldung, AU / eAU)', url: 'https://www.gesetze-im-internet.de/entgfg/__5.html' },
  arbzg3: { label: '§ 3 ArbZG – Arbeitszeit (8 h, bis 10 h)', url: 'https://www.gesetze-im-internet.de/arbzg/__3.html' },
  arbzg4: { label: '§ 4 ArbZG – Ruhepausen', url: 'https://www.gesetze-im-internet.de/arbzg/__4.html' },
  burlg3: { label: '§ 3 BUrlG – Dauer des Urlaubs', url: 'https://www.gesetze-im-internet.de/burlg/__3.html' },
  burlg4: { label: '§ 4 BUrlG – Wartezeit', url: 'https://www.gesetze-im-internet.de/burlg/__4.html' },
  burlg7: { label: '§ 7 BUrlG – Zeitpunkt des Urlaubs (Urlaubswünsche)', url: 'https://www.gesetze-im-internet.de/burlg/__7.html' },
  bgb622: { label: '§ 622 BGB – Kündigungsfristen (Probezeit)', url: 'https://www.gesetze-im-internet.de/bgb/__622.html' },
  betrvg1: { label: '§ 1 BetrVG – Errichtung von Betriebsräten', url: 'https://www.gesetze-im-internet.de/betrvg/__1.html' },
  arbschg3: { label: '§ 3 ArbSchG – Grundpflichten des Arbeitgebers (keine Kosten für Beschäftigte)', url: 'https://www.gesetze-im-internet.de/arbschg/__3.html' },
  arbschg15: { label: '§ 15 ArbSchG – Pflichten der Beschäftigten (PSA benutzen)', url: 'https://www.gesetze-im-internet.de/arbschg/__15.html' },
  dguv1: { label: 'DGUV Vorschrift 1 – Grundsätze der Prävention (§ 24: Erste Hilfe dokumentieren)', url: 'https://publikationen.dguv.de/regelwerk/dguv-vorschriften/2909/grundsaetze-der-praevention' },
  gewabfv3: { label: '§ 3 GewAbfV – Getrennte Sammlung gewerblicher Siedlungsabfälle', url: 'https://www.gesetze-im-internet.de/gewabfv_2017/__3.html' },
  gewo106: { label: '§ 106 GewO – Weisungsrecht des Arbeitgebers', url: 'https://www.gesetze-im-internet.de/gewo/__106.html' },
  stvo23: { label: '§ 23 StVO – Handy am Steuer', url: 'https://www.gesetze-im-internet.de/stvo_2013/__23.html' },
  gewo109: { label: '§ 109 GewO – Arbeitszeugnis', url: 'https://www.gesetze-im-internet.de/gewo/__109.html' },
  schwarzarbg1: { label: '§ 1 SchwarzArbG – Schwarzarbeit', url: 'https://www.gesetze-im-internet.de/schwarzarbg_2004/__1.html' },
  aufenthg4a: { label: '§ 4a AufenthG – Erwerbstätigkeit nur, wenn der Aufenthaltstitel sie erlaubt', url: 'https://www.gesetze-im-internet.de/aufenthg_2004/__4a.html' },
} as const;

export type EtiquetteSourceKey = keyof typeof ETIQUETTE_SOURCES;
