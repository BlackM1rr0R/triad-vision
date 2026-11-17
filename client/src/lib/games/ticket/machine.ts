/**
 * Ticket machine simulator (/ticket-machine): a GENERIC, fictional local transport association ("Verbund
 * Musterstadt") — stations, fare zones A / AB / ABC, ticket types, example prices (fictional, for training only:
 * real fares differ by operator and region) and the tasks with their scoring. Pure, unit-tested.
 *
 * Facts used in the help texts (as of 2026-11, see TICKET_SOURCES):
 * - Riding without a valid ticket: erhöhtes Beförderungsentgelt up to 60 € in bus / tram (§ 9 BefBedV), at least
 *   60 € (or twice the fare) on trains (§ 6 EVO); reduced to 7 € if a valid personal ticket is shown later.
 * - Deutschlandticket: subscription only (monthly, cancellable), 63 € a month since January 2026.
 */
import type { Tx } from '@/lib/games/common';
import { seededRandom, shuffle } from '@/lib/games/common';

export const TICKET_AS_OF = '2026-11';
export const PENALTY_FARE = 60;
export const PENALTY_REDUCED = 7;

export const TICKET_SOURCES = [
  { key: 'befbedv', url: 'https://www.gesetze-im-internet.de/befbedv/__9.html', label: '§ 9 BefBedV (Bus, Straßenbahn)' },
  { key: 'evo', url: 'https://www.gesetze-im-internet.de/evo_2023/__6.html', label: '§ 6 EVO (Eisenbahn)' },
  { key: 'dticket', url: 'https://regional.bahn.de/tickets/Deutschlandticket', label: 'Deutschlandticket (regional.bahn.de)' },
] as const;

export type Zone = 'A' | 'AB' | 'ABC';
export const ZONES: Zone[] = ['A', 'AB', 'ABC'];
export type TicketType = 'single' | 'fourRide' | 'day' | 'dayGroup';
export const TICKET_TYPES: TicketType[] = ['single', 'fourRide', 'day', 'dayGroup'];
export const GROUP_MAX = 5;

/** German machine labels (the machine UI is always German). */
export const TYPE_DE: Record<TicketType, string> = {
  single: 'Einzelfahrt',
  fourRide: '4-Fahrten-Karte',
  day: 'Tageskarte',
  dayGroup: 'Gruppen-Tageskarte (bis 5 Pers.)',
};

export interface Station {
  id: string;
  name: string;
  zone: 'A' | 'B' | 'C';
}

/** Start: "Musterstadt Hbf" (zone A). The zone of the destination decides the fare zone (A, AB or ABC). */
// prettier-ignore
export const STATIONS: Station[] = [
  { id: 'altstadt', name: 'Altstadt', zone: 'A' },
  { id: 'marktplatz', name: 'Marktplatz', zone: 'A' },
  { id: 'universitaet', name: 'Universität', zone: 'A' },
  { id: 'zoo', name: 'Zoo', zone: 'A' },
  { id: 'rathaus', name: 'Rathaus', zone: 'A' },
  { id: 'flughafen', name: 'Flughafen', zone: 'B' },
  { id: 'messe', name: 'Messe', zone: 'B' },
  { id: 'klinikum', name: 'Klinikum Nord', zone: 'B' },
  { id: 'sportpark', name: 'Sportpark', zone: 'B' },
  { id: 'gewerbegebiet', name: 'Gewerbegebiet Süd', zone: 'B' },
  { id: 'neustadt', name: 'Neustadt (Bahnhof)', zone: 'C' },
  { id: 'seedorf', name: 'Seedorf', zone: 'C' },
  { id: 'burgberg', name: 'Burgberg', zone: 'C' },
  { id: 'waldheim', name: 'Waldheim', zone: 'C' },
];
export const START_STATION = 'Musterstadt Hbf';

export const stationById = (id: string | null | undefined) => STATIONS.find((s) => s.id === id) ?? null;
export const zoneFor = (s: Station): Zone => (s.zone === 'A' ? 'A' : s.zone === 'B' ? 'AB' : 'ABC');
export const zoneRank = (z: Zone) => ZONES.indexOf(z);

/** Search as on the machine: case and umlaut insensitive, start of any word. */
const fold = (s: string) => s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
export const searchStations = (q: string): Station[] => {
  const f = fold(q.trim());
  if (!f) return STATIONS;
  return STATIONS.filter((s) => fold(s.name).split(/[\s()-]+/).some((w) => w.startsWith(f)) || fold(s.name).startsWith(f));
};

/** Example prices in euro (fictional training fares). [adult, child 6–14] per zone. */
// prettier-ignore
export const FARES: Record<TicketType, Record<Zone, [number, number]>> = {
  single:   { A: [2.4, 1.4], AB: [3.4, 1.9], ABC: [4.3, 2.4] },
  fourRide: { A: [8.8, 5.2], AB: [12.6, 7.0], ABC: [16.0, 8.8] },
  day:      { A: [6.4, 3.4], AB: [9.6, 4.8], ABC: [11.8, 5.9] },
  dayGroup: { A: [15.0, 15.0], AB: [24.0, 24.0], ABC: [29.0, 29.0] },
};
/** 1st class: only in regional trains; this machine adds a surcharge factor (example). */
export const FIRST_CLASS_FACTOR = 1.5;

export interface TicketChoice {
  station: string | null;
  zone: Zone;
  type: TicketType;
  adults: number;
  children: number;
  cls: 1 | 2;
  bahncard: boolean;
  /** 4-ride tickets: stamped in the Entwerter before boarding. */
  stamped: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Price of a choice in euro. Group day ticket: one price for up to 5 people. BahnCard: no discount on Verbund tickets. */
export const priceOf = (c: Pick<TicketChoice, 'zone' | 'type' | 'adults' | 'children' | 'cls'>): number => {
  const [a, k] = FARES[c.type][c.zone];
  const base = c.type === 'dayGroup' ? (c.adults + c.children > 0 ? a : 0) : c.adults * a + c.children * k;
  return round2(c.cls === 1 ? Math.round(base * FIRST_CLASS_FACTOR * 10) / 10 : base);
};

/** Whether the ticket must be stamped before the ride (tickets from the machine are validated on printing). */
export const needsStamp = (t: TicketType) => t === 'fourRide';

/** Validity issues of a choice by itself (more than 5 people on a group ticket, nobody, …). */
export const choiceProblems = (c: TicketChoice): ('noPerson' | 'groupTooBig')[] => {
  const out: ('noPerson' | 'groupTooBig')[] = [];
  if (c.adults + c.children <= 0) out.push('noPerson');
  if (c.type === 'dayGroup' && c.adults + c.children > GROUP_MAX) out.push('groupTooBig');
  return out;
};

export interface TicketTask {
  id: string;
  /** The destination station. */
  station: string;
  /** Accepted ticket types, the cheapest correct one first. */
  types: TicketType[];
  adults: number;
  /** Children 6–14 who need a ticket. */
  children: number;
  cls: 1 | 2;
  text: Tx;
}

// prettier-ignore
export const TASKS: TicketTask[] = [
  { id: 'uni', station: 'universitaet', types: ['single'], adults: 1, children: 0, cls: 2, text: {
    az: 'Özünüz üçün Universität dayanacağına birdəfəlik bilet alın.', de: 'Kaufen Sie für sich eine Einzelfahrt zur Universität.', en: 'Buy a single ticket for yourself to Universität.', ru: 'Купите себе разовый билет до Universität.', tr: 'Kendiniz için Universität’e tek yön bilet alın.', uk: 'Купіть собі разовий квиток до Universität.' } },
  { id: 'airport2', station: 'flughafen', types: ['day', 'dayGroup'], adults: 2, children: 0, cls: 2, text: {
    az: 'İki böyük üçün Flughafen-ə gündəlik bilet alın (gün ərzində bir neçə dəfə gedəcəksiniz).', de: 'Kaufen Sie eine Tageskarte für 2 Erwachsene zum Flughafen (Sie fahren heute mehrmals).', en: 'Buy a day ticket for 2 adults to Flughafen (you will ride several times today).', ru: 'Купите дневной билет для 2 взрослых до Flughafen (сегодня поедете несколько раз).', tr: '2 yetişkin için Flughafen’e günlük bilet alın (bugün birkaç kez gideceksiniz).', uk: 'Купіть денний квиток для 2 дорослих до Flughafen (сьогодні поїдете кілька разів).' } },
  { id: 'zooKid', station: 'zoo', types: ['single'], adults: 1, children: 1, cls: 2, text: {
    az: '8 yaşlı uşağınızla Zoo-ya bir istiqamətdə gedirsiniz.', de: 'Sie fahren mit Ihrem 8-jährigen Kind einfach zum Zoo.', en: 'You ride one way to Zoo with your 8-year-old child.', ru: 'Вы едете в одну сторону до Zoo с ребёнком 8 лет.', tr: '8 yaşındaki çocuğunuzla Zoo’ya tek yön gidiyorsunuz.', uk: 'Ви їдете в один бік до Zoo з дитиною 8 років.' } },
  { id: 'toddler', station: 'marktplatz', types: ['single'], adults: 1, children: 0, cls: 2, text: {
    az: '4 yaşlı uşağınızla Marktplatz-a bir istiqamətdə gedirsiniz.', de: 'Sie fahren mit Ihrem 4-jährigen Kind einfach zum Marktplatz.', en: 'You ride one way to Marktplatz with your 4-year-old child.', ru: 'Вы едете в одну сторону до Marktplatz с ребёнком 4 лет.', tr: '4 yaşındaki çocuğunuzla Marktplatz’a tek yön gidiyorsunuz.', uk: 'Ви їдете в один бік до Marktplatz з дитиною 4 років.' } },
  { id: 'messeGroup', station: 'messe', types: ['dayGroup', 'day'], adults: 4, children: 0, cls: 2, text: {
    az: '4 həmkarla bütün günü Messe-də olacaqsınız və geri qayıdacaqsınız. Ən sərfəli bileti seçin.', de: 'Sie fahren mit 4 Kollegen (Sie eingeschlossen) den ganzen Tag zur Messe und zurück. Wählen Sie das günstigste Ticket.', en: 'You and 3 colleagues (4 people) go to Messe and back for the whole day. Pick the cheapest ticket.', ru: 'Вы с 3 коллегами (4 человека) весь день на Messe и обратно. Выберите самый выгодный билет.', tr: 'Siz ve 3 meslektaşınız (4 kişi) bütün gün Messe’ye gidip döneceksiniz. En ucuz bileti seçin.', uk: 'Ви з 3 колегами (4 особи) цілий день на Messe й назад. Оберіть найвигідніший квиток.' } },
  { id: 'seedorf4', station: 'seedorf', types: ['fourRide'], adults: 1, children: 0, cls: 2, text: {
    az: 'Seedorf-a tez-tez gedirsiniz: 4 səfərlik kart alın və mindikdən əvvəl kompostlayın.', de: 'Sie fahren oft nach Seedorf: Kaufen Sie eine 4-Fahrten-Karte und entwerten Sie sie vor der Fahrt.', en: 'You often go to Seedorf: buy a 4-ride ticket and validate (stamp) it before boarding.', ru: 'Вы часто ездите в Seedorf: купите карту на 4 поездки и прокомпостируйте её перед посадкой.', tr: 'Seedorf’a sık gidiyorsunuz: 4 yolculuk kartı alın ve binmeden önce damgalayın.', uk: 'Ви часто їздите до Seedorf: купіть картку на 4 поїздки та прокомпостуйте її перед посадкою.' } },
  { id: 'neustadt1', station: 'neustadt', types: ['single'], adults: 1, children: 0, cls: 1, text: {
    az: 'Regional qatarla Neustadt-a 1-ci siniflə bir istiqamətdə gedin.', de: 'Fahren Sie einfach in der 1. Klasse des Regionalzugs nach Neustadt.', en: 'Go one way to Neustadt in 1st class of the regional train.', ru: 'Поезжайте в одну сторону до Neustadt первым классом регионального поезда.', tr: 'Bölgesel trenin 1. sınıfında Neustadt’a tek yön gidin.', uk: 'Поїдьте в один бік до Neustadt першим класом регіонального поїзда.' } },
  { id: 'klinikumD', station: 'klinikum', types: ['single'], adults: 1, children: 0, cls: 2, text: {
    az: 'Dostunuzun Deutschlandticket-i var. Yalnız özünüz üçün Klinikum Nord-a birdəfəlik bilet alın.', de: 'Ihre Freundin hat ein Deutschlandticket. Kaufen Sie nur für sich eine Einzelfahrt zum Klinikum Nord.', en: 'Your friend has a Deutschlandticket. Buy a single ticket to Klinikum Nord only for yourself.', ru: 'У подруги есть Deutschlandticket. Купите разовый билет до Klinikum Nord только себе.', tr: 'Arkadaşınızın Deutschlandticket’ı var. Sadece kendiniz için Klinikum Nord’a tek yön bilet alın.', uk: 'Подруга має Deutschlandticket. Купіть разовий квиток до Klinikum Nord лише собі.' } },
  { id: 'waldheimDay', station: 'waldheim', types: ['day'], adults: 1, children: 0, cls: 2, text: {
    az: 'Bütün gün Waldheim-da gəzəcək və bir neçə dəfə avtobusa minəcəksiniz. Özünüz üçün bilet alın.', de: 'Sie sind den ganzen Tag in Waldheim unterwegs und fahren mehrmals Bus. Kaufen Sie ein Ticket für sich.', en: 'You spend the whole day around Waldheim and take the bus several times. Buy a ticket for yourself.', ru: 'Вы весь день в Waldheim и несколько раз едете на автобусе. Купите билет себе.', tr: 'Bütün gün Waldheim’dasınız ve birkaç kez otobüse bineceksiniz. Kendiniz için bilet alın.', uk: 'Ви цілий день у Waldheim і кілька разів їдете автобусом. Купіть квиток собі.' } },
];

export const TASK_ROUND = 5;
export const MAX_TASK_POINTS = 100;

export type Mistake =
  | 'zoneLow' // invalid: fine
  | 'zoneHigh' // valid, overpaid
  | 'type' // wrong kind of ticket
  | 'personsLow' // someone rides without a ticket: fine
  | 'personsHigh' // overpaid (e.g. a ticket for a child under 6)
  | 'cls' // wrong class
  | 'notStamped' // 4-ride ticket not validated: counts as no ticket
  | 'pricier' // valid, but a cheaper accepted ticket exists
  | 'groupTooBig';

const PENALTY: Record<Mistake, number> = {
  zoneLow: 60,
  personsLow: 60,
  notStamped: 50,
  groupTooBig: 60,
  type: 40,
  zoneHigh: 25,
  personsHigh: 25,
  cls: 25,
  pricier: 15,
};

/** Mistakes that make the ticket invalid (a ticket inspector would charge the penalty fare). */
export const INVALID: Mistake[] = ['zoneLow', 'personsLow', 'notStamped', 'groupTooBig'];

export interface TaskResult {
  points: number;
  mistakes: Mistake[];
  valid: boolean;
  paid: number;
  /** Price of the cheapest correct ticket. */
  best: number;
}

/** Scores a purchase against a task. */
export const scoreTask = (task: TicketTask, c: TicketChoice): TaskResult => {
  const station = stationById(task.station);
  const need = station ? zoneFor(station) : 'A';
  const mistakes: Mistake[] = [];
  const zr = zoneRank(c.zone) - zoneRank(need);
  if (zr < 0) mistakes.push('zoneLow');
  if (zr > 0) mistakes.push('zoneHigh');
  if (!task.types.includes(c.type)) mistakes.push('type');
  const isGroup = c.type === 'dayGroup';
  if (isGroup) {
    const people = c.adults + c.children;
    const needPeople = task.adults + task.children;
    if (people > GROUP_MAX) mistakes.push('groupTooBig');
    else if (people < needPeople) mistakes.push('personsLow');
    else if (people > needPeople) mistakes.push('personsHigh');
  } else {
    // A child ticket for an adult is too little; an adult ticket for a child is fine (overpaid).
    if (c.adults < task.adults || c.adults + c.children < task.adults + task.children) mistakes.push('personsLow');
    else if (c.adults + c.children > task.adults + task.children || c.adults > task.adults) mistakes.push('personsHigh');
  }
  if (c.cls !== task.cls) mistakes.push('cls');
  if (needsStamp(c.type) && !c.stamped) mistakes.push('notStamped');
  const best = priceOf({ zone: need, type: task.types[0], adults: task.adults, children: task.children, cls: task.cls });
  const paid = priceOf(c);
  if (!mistakes.length && paid > best + 0.001) mistakes.push('pricier');
  const points = Math.max(0, MAX_TASK_POINTS - mistakes.reduce((s, m) => s + PENALTY[m], 0));
  return { points, mistakes, valid: !mistakes.some((m) => INVALID.includes(m)), paid, best };
};

/** The tasks of a round: TASK_ROUND tasks shuffled by `seed`. */
export const pickTasks = (seed: number, n = TASK_ROUND): TicketTask[] => shuffle(TASKS, seededRandom(seed)).slice(0, n);

export const newSeed = () => 1 + Math.floor(Math.random() * 999_999);
export const parseSeed = (v: string | null): number | null => {
  if (!v || !/^\d{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
};

/** Coins and notes the machine takes (cash). */
export const CASH = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20] as const;
/** Change to return in coins (largest first), for the "Rückgeld" line. */
export const changeCoins = (paid: number, price: number): number[] => {
  let rest = Math.round((paid - price) * 100);
  const out: number[] = [];
  for (const c of [200, 100, 50, 20, 10, 5]) {
    while (rest >= c) {
      out.push(c / 100);
      rest -= c;
    }
  }
  return out;
};

export const emptyChoice = (): TicketChoice => ({ station: null, zone: 'A', type: 'single', adults: 1, children: 0, cls: 2, bahncard: false, stamped: false });
