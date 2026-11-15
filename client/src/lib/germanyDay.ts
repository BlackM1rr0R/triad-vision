import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import { useChosenCase } from './caseContext';

/**
 * Client side of /api/account/germany (server: routes/accountGermany.ts, lib/departure, lib/badges):
 * "My Germany day", the arrival card and badges — types, queries, the first-day phrases, speech and the vCard.
 */

export type WeatherIcon = 'sun' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export type DayWeather =
  | { mode: 'forecast'; city: string; country: string | null; days: { date: string; icon: WeatherIcon; max: number | null; min: number | null; rain: number | null }[] }
  | { mode: 'climate'; city: string | null; month: number; avgMax: number; avgMin: number; generic: boolean };

export interface PackingState {
  open: boolean;
  opensInDays: number | null;
  items: { key: string; checkedAt: string | null }[];
  done: number;
  total: number;
}

export interface GermanyDay {
  case: { id: string; number: string } | null;
  departureAt: string | null;
  dayOnly: boolean;
  days: number | null;
  phase: 'NO_CASE' | 'NO_FLIGHT' | 'UPCOMING' | 'TODAY' | 'ARRIVED';
  flightNumber: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  city: string | null;
  weather: DayWeather | null;
  packing: PackingState;
}

export interface ArrivalCardData {
  generatedAt: string;
  case: { id: string; number: string };
  holder: { name: string; phone: string | null };
  address: { text: string | null; city: string | null; source: 'ARRIVAL_PLAN' | 'PARTNER_HOUSING' | 'CITY' | null; landlord: { name: string | null; phone: string | null } | null; moveInDate: string | null };
  employer: { name: string | null; contactName: string | null; phone: string | null; email: string | null; address: string | null } | null;
  firstWorkDay: string | null;
  arrival: { at: string | null; flightNumber: string | null; airport: string | null; pickup: string | null } | null;
  emergency: { key: 'emergency' | 'police' | 'doctorOnCall'; number: string }[];
  embassy: { website: string; phone: string; email: string; consular: { address: string; phone: string; email: string } };
  support: { phone: string };
}

export interface ClientBadge {
  key: string;
  group: 'journey' | 'german';
  icon: string;
  earned: boolean;
  earnedAt: string | null;
  fresh: boolean;
  progress: { value: number; goal: number } | null;
}
export interface BadgesResponse {
  badges: ClientBadge[];
  earned: number;
  total: number;
  streak: number;
  wordsLearned: number;
}

export const GERMANY_DAY_KEY = 'account-germany-day';
export const BADGES_KEY = 'account-badges';

export const useGermanyDay = () => {
  const { user } = useAuth();
  const chosen = useChosenCase(user?.id);
  return useQuery({
    queryKey: [GERMANY_DAY_KEY, chosen ?? 'default'],
    queryFn: async () => (await api.get<GermanyDay>('/account/germany/day', { params: chosen ? { case: chosen } : undefined })).data,
    staleTime: 10 * 60_000,
    enabled: user?.role === 'CLIENT',
    retry: false,
  });
};

export const useBadges = (enabled = true) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [BADGES_KEY],
    queryFn: async () => (await api.get<BadgesResponse>('/account/germany/badges')).data,
    staleTime: 5 * 60_000,
    enabled: enabled && user?.role === 'CLIENT',
    retry: false,
  });
};

// ─── Countdown ───────────────────────────────────────────────────────

/** Whole days / hours / minutes left until `at` (all 0 once passed). Pure. */
export const timeLeft = (at: string | Date, now = Date.now()) => {
  const ms = Math.max(0, new Date(at).getTime() - now);
  const minutes = Math.floor(ms / 60_000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60, past: ms === 0 };
};

// ─── First-day phrases ───────────────────────────────────────────────

/**
 * First-day German phrases: German, the meaning in the client's language and a simple pronunciation written the way
 * a speaker of that language would read it (az: Azerbaijani Latin letters, ru: Cyrillic, en: English spelling; tr
 * uses az, uk uses ru). German UI: the German text only.
 */
export interface Phrase {
  de: string;
  tr: { az: string; en: string; ru: string };
  say: { az: string; en: string; ru: string };
}

export const PHRASES: Phrase[] = [
  { de: 'Guten Tag!', tr: { az: 'Salam! (Günortanız xeyir)', en: 'Hello! (Good day)', ru: 'Добрый день!' }, say: { az: 'qutən taq', en: 'GOO-ten tahk', ru: 'гутен так' } },
  { de: 'Ich heiße …', tr: { az: 'Mənim adım …', en: 'My name is …', ru: 'Меня зовут …' }, say: { az: 'ix hayse', en: 'ikh HY-seh', ru: 'их хайсэ' } },
  { de: 'Ich komme aus Aserbaidschan.', tr: { az: 'Mən Azərbaycandanam.', en: 'I come from Azerbaijan.', ru: 'Я из Азербайджана.' }, say: { az: 'ix kome aus azerbaycan', en: 'ikh KOM-meh ows ah-zer-by-JAHN', ru: 'их коммэ аус азербайджан' } },
  { de: 'Heute ist mein erster Arbeitstag.', tr: { az: 'Bu gün işdə ilk günümdür.', en: 'Today is my first day at work.', ru: 'Сегодня мой первый рабочий день.' }, say: { az: 'hoyte ist mayn erster arbaytstaq', en: 'HOY-teh ist mine AIR-ster AR-bites-tahk', ru: 'хойтэ ист майн эрстер арбайтстак' } },
  { de: 'Ich spreche ein bisschen Deutsch.', tr: { az: 'Bir az almanca danışıram.', en: 'I speak a little German.', ru: 'Я немного говорю по-немецки.' }, say: { az: 'ix şprexe ayn bisxen doyç', en: 'ikh SHPREH-kheh ine BISS-khen doytch', ru: 'их шпрэхэ айн бисхен дойч' } },
  { de: 'Ich verstehe das nicht.', tr: { az: 'Bunu başa düşmürəm.', en: "I don't understand that.", ru: 'Я этого не понимаю.' }, say: { az: 'ix ferşteye das nixt', en: 'ikh fer-SHTAY-eh dahs nikht', ru: 'их ферштээ дас нихт' } },
  { de: 'Können Sie das bitte wiederholen?', tr: { az: 'Zəhmət olmasa, təkrar edərsiniz?', en: 'Could you repeat that, please?', ru: 'Повторите, пожалуйста.' }, say: { az: 'könen zi das bite vidərholen', en: 'KER-nen zee dahs BIT-teh vee-der-HOH-len', ru: 'кённен зи дас биттэ видерхолен' } },
  { de: 'Bitte langsamer.', tr: { az: 'Zəhmət olmasa, yavaş danışın.', en: 'Slower, please.', ru: 'Помедленнее, пожалуйста.' }, say: { az: 'bite lanqzamer', en: 'BIT-teh LAHNG-zah-mer', ru: 'биттэ лангзамер' } },
  { de: 'Wo ist mein Arbeitsplatz?', tr: { az: 'Mənim iş yerim haradadır?', en: 'Where is my workplace?', ru: 'Где моё рабочее место?' }, say: { az: 'vo ist mayn arbaytsplats', en: 'voh ist mine AR-bites-plahts', ru: 'во ист майн арбайтсплац' } },
  { de: 'Wo ist der Bahnhof?', tr: { az: 'Vağzal haradadır?', en: 'Where is the train station?', ru: 'Где вокзал?' }, say: { az: 'vo ist der banhof', en: 'voh ist dair BAHN-hohf', ru: 'во ист дер банхоф' } },
  { de: 'Ich brauche einen Arzt.', tr: { az: 'Mənə həkim lazımdır.', en: 'I need a doctor.', ru: 'Мне нужен врач.' }, say: { az: 'ix brauxe aynen artst', en: 'ikh BROW-kheh INE-en artst', ru: 'их браухэ айнен арцт' } },
  { de: 'Entschuldigung!', tr: { az: 'Bağışlayın!', en: 'Excuse me!', ru: 'Извините!' }, say: { az: 'entşuldiqunq', en: 'ent-SHOOL-dee-goong', ru: 'энтшульдигунг' } },
  { de: 'Danke schön!', tr: { az: 'Çox sağ olun!', en: 'Thank you very much!', ru: 'Большое спасибо!' }, say: { az: 'danke şön', en: 'DAHN-keh shern', ru: 'данкэ шён' } },
  { de: 'Auf Wiedersehen! / Tschüss!', tr: { az: 'Sağ olun! / Hələlik!', en: 'Goodbye! / Bye!', ru: 'До свидания! / Пока!' }, say: { az: 'auf vidərzeyen / çüs', en: 'owf VEE-der-zayn / chooss', ru: 'ауф видерзеен / чюс' } },
];

/** Which translation / pronunciation column a UI language uses (null: German UI, no translation needed). */
export const phraseLang = (ui: string): 'az' | 'en' | 'ru' | null => {
  const l = ui.slice(0, 2);
  if (l === 'de') return null;
  if (l === 'az' || l === 'tr') return 'az';
  if (l === 'ru' || l === 'uk') return 'ru';
  return 'en';
};

// ─── Speech (browser only, de-DE voice only) ─────────────────────────

/** A German voice of the browser's own speech synthesis, or null (then the speaker buttons are hidden). */
export const germanVoice = (): SpeechSynthesisVoice | null => {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    return window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().replace('_', '-').startsWith('de')) ?? null;
  } catch {
    return null;
  }
};

export const speakGerman = (text: string) => {
  const voice = germanVoice();
  if (!voice) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/…/g, ''));
    u.voice = voice;
    u.lang = 'de-DE';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
};

// ─── vCard (QR on the arrival card) ──────────────────────────────────

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** vCard 3.0 of one contact (name, organisation, phone, e-mail). Pure. */
export const vCard = (c: { name: string; org?: string | null; phone?: string | null; email?: string | null; note?: string | null }) => {
  const parts = c.name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : '';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(last)};${esc(parts.join(' '))};;;`, `FN:${esc(c.name.trim())}`];
  if (c.org) lines.push(`ORG:${esc(c.org)}`);
  if (c.phone) lines.push(`TEL;TYPE=WORK,VOICE:${c.phone.replace(/[^\d+]/g, '')}`);
  if (c.email) lines.push(`EMAIL;TYPE=WORK:${c.email}`);
  if (c.note) lines.push(`NOTE:${esc(c.note)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
};

/** Digits and a leading + for tel: links. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
