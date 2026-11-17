/**
 * Virtual German apartment (/german-apartment): the rooms of the self-drawn floor plan and its clickable hotspots.
 * Coordinates are in the plan's viewBox (APARTMENT_W × APARTMENT_H). Texts: i18n/apartment/* (apt.hotspots.<id>).
 * Glossary slugs link to /glossary/:slug (server lib/glossary/terms).
 */

export const APARTMENT_W = 1000;
export const APARTMENT_H = 720;
export const APARTMENT_AS_OF = '2026-11-16';

export const ROOMS = ['entrance', 'hallway', 'kitchen', 'bathroom', 'living', 'bedroom', 'balcony', 'cellar', 'yard'] as const;
export type Room = (typeof ROOMS)[number];

export interface Hotspot {
  id: string;
  room: Room;
  x: number;
  y: number;
  glossary: string[];
}

export const HOTSPOTS: Hotspot[] = [
  { id: 'klingel', room: 'entrance', x: 70, y: 598, glossary: ['anmeldung', 'wohnungsgeberbestaetigung', 'buergeramt'] },
  { id: 'briefkasten', room: 'entrance', x: 150, y: 650, glossary: ['einschreiben', 'bescheid', 'frist'] },
  { id: 'hausordnung', room: 'entrance', x: 222, y: 598, glossary: ['hausordnung', 'ruhezeiten'] },
  { id: 'wohnungstuer', room: 'hallway', x: 105, y: 492, glossary: ['uebergabeprotokoll', 'kaution', 'haftpflichtversicherung'] },
  { id: 'sicherungskasten', room: 'hallway', x: 44, y: 380, glossary: ['vermieter'] },
  { id: 'router', room: 'hallway', x: 222, y: 445, glossary: ['lastschrift'] },
  { id: 'kuehlschrank', room: 'kitchen', x: 62, y: 66, glossary: ['pfand'] },
  { id: 'herd', room: 'kitchen', x: 150, y: 62, glossary: ['mietvertrag'] },
  { id: 'spuele', room: 'kitchen', x: 232, y: 140, glossary: ['nebenkosten'] },
  { id: 'muellKueche', room: 'kitchen', x: 200, y: 262, glossary: ['muelltrennung'] },
  { id: 'dusche', room: 'bathroom', x: 300, y: 350, glossary: ['schoenheitsreparaturen'] },
  { id: 'therme', room: 'bathroom', x: 418, y: 330, glossary: ['vermieter', 'warmmiete'] },
  { id: 'wasserzaehler', room: 'bathroom', x: 418, y: 492, glossary: ['nebenkosten', 'nebenkostenabrechnung'] },
  { id: 'heizkoerper', room: 'living', x: 390, y: 42, glossary: ['nebenkosten', 'warmmiete'] },
  { id: 'fenster', room: 'living', x: 560, y: 34, glossary: ['hausverwaltung'] },
  { id: 'sofa', room: 'living', x: 330, y: 222, glossary: ['ruhezeiten', 'hausordnung'] },
  { id: 'rundfunk', room: 'living', x: 520, y: 262, glossary: ['rundfunkbeitrag'] },
  { id: 'ordner', room: 'living', x: 700, y: 120, glossary: ['nebenkostenabrechnung', 'kaltmiete', 'warmmiete'] },
  { id: 'rauchmelder', room: 'bedroom', x: 600, y: 330, glossary: ['vermieter'] },
  { id: 'mietvertrag', room: 'bedroom', x: 680, y: 452, glossary: ['mietvertrag', 'kaution'] },
  { id: 'schimmel', room: 'bedroom', x: 742, y: 505, glossary: ['vermieter', 'hausverwaltung'] },
  { id: 'grill', room: 'balcony', x: 860, y: 96, glossary: ['hausordnung'] },
  { id: 'blumenkasten', room: 'balcony', x: 920, y: 240, glossary: ['haftpflichtversicherung', 'hausratversicherung'] },
  { id: 'waschmaschine', room: 'cellar', x: 330, y: 640, glossary: ['hausordnung'] },
  { id: 'stromzaehler', room: 'cellar', x: 462, y: 610, glossary: ['stromvertrag'] },
  { id: 'kellerabteil', room: 'cellar', x: 610, y: 655, glossary: ['hausratversicherung'] },
  { id: 'muelltonnen', room: 'yard', x: 840, y: 640, glossary: ['muelltrennung', 'pfand', 'nebenkosten'] },
];

export const hotspotById = (id: string | null | undefined) => HOTSPOTS.find((h) => h.id === id) ?? null;
export const hotspotNumber = (id: string) => HOTSPOTS.findIndex((h) => h.id === id) + 1;

/** Official sources behind the facts in the texts (shown on the page with the as-of date). */
export const APARTMENT_SOURCES = [
  { key: 'bgb551', url: 'https://www.gesetze-im-internet.de/bgb/__551.html' },
  { key: 'bgb556', url: 'https://www.gesetze-im-internet.de/bgb/__556.html' },
  { key: 'bmg17', url: 'https://www.gesetze-im-internet.de/bmg/__17.html' },
  { key: 'bmg19', url: 'https://www.gesetze-im-internet.de/bmg/__19.html' },
  { key: 'tkg56', url: 'https://www.gesetze-im-internet.de/tkg_2021/__56.html' },
  { key: 'verpackg31', url: 'https://www.gesetze-im-internet.de/verpackdg/__46.html' },
  { key: 'rundfunk', url: 'https://www.rundfunkbeitrag.de/' },
  { key: 'heating', url: 'https://www.verbraucherzentrale.nrw/wissen/energie/heizen-und-warmwasser/heizung-optimieren-und-heizkosten-sparen-so-gehts-30096' },
] as const;
