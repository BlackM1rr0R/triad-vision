/**
 * "Guess the price" (/price-game): everyday prices in Germany, autumn 2026. Each item says whether its price is
 * taken from a named source (`basis: 'source'`, with the link and the date of that figure) or is our typical
 * estimate (`basis: 'estimate'`: a common shelf / menu price at discounters, bakeries and in mid-size cities —
 * real prices vary by shop, city and offer). Rents are computed from the city guide's 2026 ranges
 * (lib/cities/data.ts), so both pages agree.
 */
import { CITIES, DEUTSCHLANDTICKET, KINDERGELD, RUNDFUNK } from '@/lib/cities/data';
import type { Tx } from '@/lib/games/common';

export const PRICE_AS_OF = '2026-11';

export type PriceCategory = 'food' | 'eatOut' | 'transport' | 'housing' | 'services' | 'official';

export interface PriceItem {
  id: string;
  category: PriceCategory;
  /** German name as on a price tag / menu (shown to everybody). */
  de: string;
  name: Tx;
  /** Typical price in euro. */
  price: number;
  /** 'source': the figure comes from `source`; 'estimate': our typical price (label it as an estimate). */
  basis: 'source' | 'estimate';
  source?: { label: string; url: string; date: string };
}

type Row = [id: string, category: PriceCategory, de: string, az: string, en: string, ru: string, tr: string, uk: string, price: number, source?: PriceItem['source']];

const city = (slug: string) => {
  const c = CITIES.find((x) => x.slug === slug);
  if (!c) throw new Error(`city ${slug}`);
  return c;
};
const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;
/** Warm rent of a 30 m² one-room flat: mid cold rent per m² plus mid Nebenkosten incl. heating, rounded to 10 €. */
const oneRoomWarm = (slug: string) => {
  const c = city(slug);
  return Math.round((30 * (mid(c.rent.oneRoom) + mid(c.utilities))) / 10) * 10;
};
const CITY_SRC = (date: string) => ({ label: 'Triad Vision city guide (rent indices 2025 + trend)', url: '/cities', date });

// prettier-ignore
const ROWS: Row[] = [
  // food (supermarket / discounter / bakery)
  ['bread', 'food', 'Mischbrot vom Bäcker, 750 g', 'Çörək (çörəkxanadan), 750 q', 'Loaf of bread from a bakery, 750 g', 'Хлеб из пекарни, 750 г', 'Fırından ekmek, 750 g', 'Хліб із пекарні, 750 г', 3.9],
  ['roll', 'food', 'Brötchen vom Bäcker (1 Stück)', 'Bulka (1 ədəd, çörəkxana)', 'Bread roll from a bakery (1)', 'Булочка из пекарни (1 шт.)', 'Fırından küçük ekmek (1 adet)', 'Булочка з пекарні (1 шт.)', 0.55],
  ['milk', 'food', 'Frische Vollmilch 3,5 %, 1 l', 'Təzə süd 3,5 %, 1 l', 'Fresh whole milk 3.5 %, 1 l', 'Свежее молоко 3,5 %, 1 л', 'Taze tam yağlı süt %3,5, 1 l', 'Свіже молоко 3,5 %, 1 л', 1.09],
  ['eggs', 'food', 'Eier aus Freilandhaltung, 10 Stück', 'Yumurta (sərbəst saxlama), 10 ədəd', 'Free-range eggs, 10', 'Яйца свободного выгула, 10 шт.', 'Gezen tavuk yumurtası, 10 adet', 'Яйця вільного вигулу, 10 шт.', 2.99, { label: 'supermarktcheck.de (Aldi Süd, Landfreude Freiland)', url: 'https://www.supermarktcheck.de/product/309059-landfreude-eier-aus-freilandhaltung-', date: '2026-03' }],
  ['butter', 'food', 'Deutsche Markenbutter, 250 g', 'Kərə yağı, 250 q', 'Butter, 250 g', 'Сливочное масло, 250 г', 'Tereyağı, 250 g', 'Вершкове масло, 250 г', 1.15, { label: 'Lidl / Aldi price cut (ms-aktuell.de)', url: 'https://ms-aktuell.de/welt/lidl-butterpreis-gesenkt-31-10-2026/', date: '2026-10' }],
  ['bananas', 'food', 'Bananen, 1 kg', 'Banan, 1 kq', 'Bananas, 1 kg', 'Бананы, 1 кг', 'Muz, 1 kg', 'Банани, 1 кг', 1.49],
  ['apples', 'food', 'Äpfel, 1 kg', 'Alma, 1 kq', 'Apples, 1 kg', 'Яблоки, 1 кг', 'Elma, 1 kg', 'Яблука, 1 кг', 2.49],
  ['potatoes', 'food', 'Kartoffeln, 2,5 kg', 'Kartof, 2,5 kq', 'Potatoes, 2.5 kg', 'Картофель, 2,5 кг', 'Patates, 2,5 kg', 'Картопля, 2,5 кг', 2.99],
  ['pasta', 'food', 'Spaghetti, 500 g (Eigenmarke)', 'Spagetti, 500 q (mağaza markası)', 'Spaghetti, 500 g (store brand)', 'Спагетти, 500 г (марка магазина)', 'Spagetti, 500 g (market markası)', 'Спагеті, 500 г (марка магазину)', 0.99],
  ['rice', 'food', 'Basmatireis, 1 kg', 'Basmati düyüsü, 1 kq', 'Basmati rice, 1 kg', 'Рис басмати, 1 кг', 'Basmati pirinç, 1 kg', 'Рис басмати, 1 кг', 2.99],
  ['chicken', 'food', 'Hähnchenbrustfilet, 1 kg', 'Toyuq döşü filesi, 1 kq', 'Chicken breast fillet, 1 kg', 'Куриное филе, 1 кг', 'Tavuk göğsü fileto, 1 kg', 'Куряче філе, 1 кг', 10.9],
  ['coffeeBeans', 'food', 'Kaffeebohnen, 1 kg', 'Qəhvə dənələri, 1 kq', 'Coffee beans, 1 kg', 'Кофе в зёрнах, 1 кг', 'Çekirdek kahve, 1 kg', 'Кава в зернах, 1 кг', 14.99],
  ['water', 'food', 'Mineralwasser 1,5 l (zzgl. 0,25 € Pfand)', 'Mineral su 1,5 l (+0,25 € Pfand)', 'Mineral water 1.5 l (+ €0.25 deposit)', 'Минеральная вода 1,5 л (+0,25 € залог)', 'Maden suyu 1,5 l (+0,25 € depozito)', 'Мінеральна вода 1,5 л (+0,25 € застава)', 0.29],
  ['cola', 'food', 'Cola 1,5 l (Markenware, zzgl. Pfand)', 'Kola 1,5 l (marka, + Pfand)', 'Cola 1.5 l (brand, + deposit)', 'Кола 1,5 л (бренд, + залог)', 'Kola 1,5 l (marka, + depozito)', 'Кола 1,5 л (бренд, + застава)', 1.79],
  ['beerShop', 'food', 'Bier 0,5 l im Supermarkt (zzgl. Pfand)', 'Pivə 0,5 l (supermarket, + Pfand)', 'Beer 0.5 l at the supermarket (+ deposit)', 'Пиво 0,5 л в супермаркете (+ залог)', 'Bira 0,5 l markette (+ depozito)', 'Пиво 0,5 л у супермаркеті (+ застава)', 0.99],
  ['toothpaste', 'food', 'Zahnpasta, 75 ml (Drogerie-Eigenmarke)', 'Diş pastası, 75 ml', 'Toothpaste, 75 ml (drugstore brand)', 'Зубная паста, 75 мл', 'Diş macunu, 75 ml', 'Зубна паста, 75 мл', 0.95],
  // eating out
  ['doener', 'eatOut', 'Döner Kebab', 'Dönər', 'Döner kebab', 'Дёнер', 'Döner', 'Дьонер', 7.5, { label: 'doener.io price survey, 14 big cities (via ms-aktuell.de)', url: 'https://ms-aktuell.de/welt/doenerpreise-deutschland-18-10-2026/', date: '2026-05' }],
  ['cappuccino', 'eatOut', 'Cappuccino im Café', 'Kafedə kapuçino', 'Cappuccino in a café', 'Капучино в кафе', 'Kafede kapuçino', 'Капучино в кафе', 3.9],
  ['beerPub', 'eatOut', 'Bier 0,5 l in der Kneipe', 'Barda pivə 0,5 l', 'Beer 0.5 l in a pub', 'Пиво 0,5 л в баре', 'Barda bira 0,5 l', 'Пиво 0,5 л у барі', 5.2],
  ['pizza', 'eatOut', 'Pizza Margherita im Restaurant', 'Restoranda Marqarita pizza', 'Pizza Margherita in a restaurant', 'Пицца «Маргарита» в ресторане', 'Restoranda Margherita pizza', 'Піца «Маргарита» в ресторані', 10.5],
  ['currywurst', 'eatOut', 'Currywurst mit Pommes', 'Karri kolbasa və kartof fri', 'Currywurst with fries', 'Карривурст с картошкой фри', 'Patates kızartmalı currywurst', 'Каррівурст із картоплею фрі', 6.9],
  ['canteen', 'eatOut', 'Mittagessen in der Kantine', 'İş yerinin yeməkxanasında nahar', 'Lunch in a works canteen', 'Обед в столовой на работе', 'İş yeri kantininde öğle yemeği', 'Обід у їдальні на роботі', 5.5],
  // transport
  ['dticket', 'transport', 'Deutschlandticket (1 Monat)', 'Deutschlandticket (1 ay)', 'Deutschlandticket (1 month)', 'Deutschlandticket (1 месяц)', 'Deutschlandticket (1 ay)', 'Deutschlandticket (1 місяць)', DEUTSCHLANDTICKET, { label: 'Deutsche Bahn: Deutschlandticket', url: 'https://regional.bahn.de/tickets/Deutschlandticket', date: '2026-01' }],
  ['petrol', 'transport', 'Super E10, 1 Liter', 'Benzin Super E10, 1 litr', 'Petrol Super E10, 1 litre', 'Бензин Super E10, 1 литр', 'Benzin Super E10, 1 litre', 'Бензин Super E10, 1 літр', 1.98, { label: 'ADAC national average (11 Nov 2026)', url: 'https://presse.adac.de/meldungen/adac-ev/verkehr/kraftstoffpreise-super-e10-wieder-unter-2-euro.html', date: '2026-11' }],
  ['taxi', 'transport', 'Taxifahrt, 5 km in der Stadt', 'Taksi, şəhərdə 5 km', 'Taxi ride, 5 km in town', 'Такси, 5 км по городу', 'Taksi, şehir içi 5 km', 'Таксі, 5 км містом', 16],
  ['flixbus', 'transport', 'Fernbus Berlin–Hamburg (früh gebucht)', 'Avtobus Berlin–Hamburq (erkən alınmış)', 'Long-distance bus Berlin–Hamburg (booked early)', 'Автобус Берлин–Гамбург (заранее)', 'Otobüs Berlin–Hamburg (erken alınmış)', 'Автобус Берлін–Гамбург (заздалегідь)', 14.99],
  // housing
  ['rentMunich', 'housing', '1-Zimmer-Wohnung 30 m² in München, warm', 'Münhendə 1 otaqlı mənzil, 30 m², isti kirayə', '1-room flat, 30 m², Munich, rent incl. bills', 'Однушка 30 м² в Мюнхене, тёплая аренда', 'Münih’te 1 odalı daire, 30 m², sıcak kira', 'Однокімнатна 30 м² у Мюнхені, тепла оренда', oneRoomWarm('muenchen'), CITY_SRC('2026')],
  ['rentLeipzig', 'housing', '1-Zimmer-Wohnung 30 m² in Leipzig, warm', 'Leypsiqdə 1 otaqlı mənzil, 30 m², isti kirayə', '1-room flat, 30 m², Leipzig, rent incl. bills', 'Однушка 30 м² в Лейпциге, тёплая аренда', 'Leipzig’de 1 odalı daire, 30 m², sıcak kira', 'Однокімнатна 30 м² у Лейпцигу, тепла оренда', oneRoomWarm('leipzig'), CITY_SRC('2026')],
  ['wgBerlin', 'housing', 'WG-Zimmer in Berlin, warm', 'Berlində WG otağı (paylaşılan mənzil)', 'Room in a shared flat (WG), Berlin', 'Комната в WG в Берлине', 'Berlin’de WG odası (ortak ev)', 'Кімната у WG в Берліні', Math.round(mid(city('berlin').wgRoom) / 10) * 10, CITY_SRC('2026')],
  ['electricity', 'housing', 'Strom für 1 Person (1 500 kWh/Jahr), pro Monat', 'Bir nəfər üçün elektrik (1 500 kVt·s/il), aylıq', 'Electricity for 1 person (1,500 kWh/year), per month', 'Электричество на 1 человека (1 500 кВт·ч/год), в месяц', '1 kişilik elektrik (1.500 kWh/yıl), aylık', 'Електроенергія на 1 особу (1 500 кВт·год/рік), на місяць', 48],
  ['internet', 'housing', 'Internet zu Hause (DSL/Kabel 100 Mbit/s), pro Monat', 'Evdə internet (100 Mbit/s), aylıq', 'Home internet (100 Mbit/s), per month', 'Домашний интернет (100 Мбит/с), в месяц', 'Ev interneti (100 Mbit/s), aylık', 'Домашній інтернет (100 Мбіт/с), на місяць', 35],
  // services
  ['haircut', 'services', 'Herrenhaarschnitt beim Friseur', 'Bərbərdə kişi saç kəsimi', 'Men’s haircut', 'Мужская стрижка', 'Erkek saç kesimi', 'Чоловіча стрижка', 28],
  ['cinema', 'services', 'Kinoticket (Durchschnitt)', 'Kino bileti (orta)', 'Cinema ticket (average)', 'Билет в кино (в среднем)', 'Sinema bileti (ortalama)', 'Квиток у кіно (у середньому)', 10.05, { label: 'FFA, Kinobesucher:innen 2025 (average 2025)', url: 'https://www.ffa.de/files/dokumentenverwaltung/studien%20mafo/2026/FFA_Kinobesucher_innen_2025.pdf', date: '2025' }],
  ['gym', 'services', 'Fitnessstudio (Discount-Kette), pro Monat', 'İdman zalı (ucuz şəbəkə), aylıq', 'Gym (budget chain), per month', 'Фитнес-клуб (бюджетная сеть), в месяц', 'Spor salonu (uygun zincir), aylık', 'Фітнес-клуб (бюджетна мережа), на місяць', 29.99],
  ['mobile', 'services', 'Handyvertrag mit 10 GB, pro Monat', '10 GB mobil tarif, aylıq', 'Mobile plan with 10 GB, per month', 'Мобильный тариф 10 ГБ, в месяц', '10 GB mobil tarife, aylık', 'Мобільний тариф 10 ГБ, на місяць', 9.99],
  ['liability', 'services', 'Private Haftpflichtversicherung, pro Jahr', 'Şəxsi məsuliyyət sığortası, illik', 'Personal liability insurance, per year', 'Страхование гражданской ответственности, в год', 'Özel sorumluluk sigortası, yıllık', 'Страхування цивільної відповідальності, на рік', 60],
  // official / fixed amounts
  ['rundfunk', 'official', 'Rundfunkbeitrag pro Wohnung, pro Monat', 'Radio-TV rüsumu (Rundfunkbeitrag), mənzil üçün aylıq', 'Broadcasting fee per household, per month', 'Взнос за радио и ТВ на квартиру, в месяц', 'Yayın katkı payı (hane başına), aylık', 'Внесок за радіо й ТБ на квартиру, на місяць', RUNDFUNK, { label: 'rundfunkbeitrag.de', url: 'https://www.rundfunkbeitrag.de/', date: '2026' }],
  ['stamp', 'official', 'Briefmarke Standardbrief (Inland)', 'Adi məktub üçün marka (ölkə daxili)', 'Stamp for a standard letter (domestic)', 'Марка на стандартное письмо (по Германии)', 'Standart mektup pulu (yurt içi)', 'Марка на стандартний лист (по Німеччині)', 0.95, { label: 'Deutsche Post, Briefe national', url: 'https://www.deutschepost.de/de/b/briefe-in-deutschland.html', date: '2026-01' }],
  ['minWage', 'official', 'Gesetzlicher Mindestlohn pro Stunde (brutto)', 'Minimum əmək haqqı, saatlıq (brutto)', 'Statutory minimum wage per hour (gross)', 'Минимальная оплата труда в час (брутто)', 'Yasal asgari ücret, saatlik (brüt)', 'Мінімальна оплата праці за годину (брутто)', 13.9, { label: 'Bundesregierung: Mindestlohn 13,90 €', url: 'https://www.bundesregierung.de/breg-de/aktuelles/mindestlohn-steigt-2391010', date: '2026-01' }],
  ['kindergeld', 'official', 'Kindergeld pro Kind, pro Monat', 'Uşaq pulu (Kindergeld), hər uşaq üçün aylıq', 'Child benefit per child, per month', 'Детское пособие на ребёнка, в месяц', 'Çocuk parası, çocuk başına aylık', 'Дитячі гроші на дитину, на місяць', KINDERGELD, { label: 'Familienkasse (Bundesagentur für Arbeit)', url: 'https://www.arbeitsagentur.de/familie-und-kinder/kindergeld-anspruch-hoehe-dauer', date: '2026-01' }],
];

export const PRICE_ITEMS: PriceItem[] = ROWS.map(([id, category, de, az, en, ru, tr, uk, price, source]) => ({
  id,
  category,
  de,
  name: { az, de, en, ru, tr, uk },
  price,
  basis: source ? 'source' : 'estimate',
  source,
}));

export const PRICE_BY_ID = new Map(PRICE_ITEMS.map((i) => [i.id, i]));
