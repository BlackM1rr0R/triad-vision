/**
 * Supermarket game (/supermarket-game): the aisles, ~60 products with their German shelf name, translations,
 * a typical price (euro, as of autumn 2026: taken from the price game's data where the product is the same —
 * lib/games/price/items.ts — otherwise our estimate of a common discounter price), the VAT rate on the receipt
 * (7 % food, 19 % drinks except milk, and non-food) and the deposit (Pfand) of drinks.
 *
 * Pfand: 0.25 € on single-use bottles and cans (fixed by the Verpackungsgesetz); reusable (Mehrweg) amounts are
 * not fixed by law, usually 0.08 € (beer bottles) or 0.15 € (water bottles, swing tops). Juice cartons: no Pfand.
 */
import type { Tx } from '@/lib/games/common';
import { PRICE_BY_ID } from '@/lib/games/price/items';

export const SUPERMARKET_AS_OF = '2026-11';

export type Aisle = 'obst' | 'brot' | 'kuehl' | 'fleisch' | 'vorrat' | 'getraenke' | 'drogerie';
export const AISLES: Aisle[] = ['obst', 'brot', 'kuehl', 'fleisch', 'vorrat', 'getraenke', 'drogerie'];
/** Aisle signs as in the shop (German). */
export const AISLE_DE: Record<Aisle, string> = {
  obst: 'Obst & Gemüse',
  brot: 'Brot & Backwaren',
  kuehl: 'Kühlregal',
  fleisch: 'Fleisch & Wurst',
  vorrat: 'Grundnahrungsmittel',
  getraenke: 'Getränke',
  drogerie: 'Drogerie & Haushalt',
};

export type Shape = 'fruit' | 'bag' | 'loaf' | 'carton' | 'tub' | 'pack' | 'bottle' | 'glass' | 'can' | 'box' | 'roll' | 'jar' | 'tube';

export interface Product {
  id: string;
  aisle: Aisle;
  /** Name on the shelf / shopping list, German. */
  de: string;
  /** Pack size as on the label, e.g. "500 g". */
  unit: string;
  name: Tx;
  price: number;
  /** 'priceGame': the same figure as the price game (and its source); 'estimate': our typical price. */
  basis: 'priceGame' | 'estimate';
  vat: 7 | 19;
  pfand?: 0.08 | 0.15 | 0.25;
  shape: Shape;
  colour: string;
  /** Explanation shown when this product is confused with another one (tricky products only). */
  note?: Tx;
}

type Row = [id: string, aisle: Aisle, de: string, unit: string, az: string, en: string, ru: string, tr: string, uk: string, price: number | string, vat: 7 | 19, shape: Shape, colour: string, pfand?: 0.08 | 0.15 | 0.25];

// price: a number (estimate) or the id of the price game item (same figure there).
// prettier-ignore
const ROWS: Row[] = [
  // Obst & Gemüse
  ['bananen', 'obst', 'Bananen', '1 kg', 'Banan', 'Bananas', 'Бананы', 'Muz', 'Банани', 'bananas', 7, 'fruit', '#facc15'],
  ['aepfel', 'obst', 'Äpfel', '1 kg', 'Alma', 'Apples', 'Яблоки', 'Elma', 'Яблука', 'apples', 7, 'fruit', '#ef4444'],
  ['kartoffeln', 'obst', 'Kartoffeln, festkochend', '2,5 kg', 'Kartof', 'Potatoes', 'Картофель', 'Patates', 'Картопля', 'potatoes', 7, 'bag', '#b45309'],
  ['tomaten', 'obst', 'Tomaten', '500 g', 'Pomidor', 'Tomatoes', 'Помидоры', 'Domates', 'Помідори', 1.99, 7, 'fruit', '#dc2626'],
  ['gurke', 'obst', 'Salatgurke', '1 Stück', 'Xiyar', 'Cucumber', 'Огурец', 'Salatalık', 'Огірок', 0.79, 7, 'fruit', '#16a34a'],
  ['zwiebeln', 'obst', 'Zwiebeln', '1 kg', 'Soğan', 'Onions', 'Лук', 'Soğan', 'Цибуля', 1.29, 7, 'bag', '#d97706'],
  ['paprika', 'obst', 'Paprika rot', '1 Stück', 'Qırmızı bibər', 'Red pepper', 'Красный перец', 'Kırmızı biber', 'Червоний перець', 0.99, 7, 'fruit', '#b91c1c'],
  ['zitronen', 'obst', 'Zitronen', '500 g', 'Limon', 'Lemons', 'Лимоны', 'Limon', 'Лимони', 1.49, 7, 'fruit', '#fde047'],
  ['petersilie', 'obst', 'Petersilie', '1 Bund', 'Cəfəri', 'Parsley', 'Петрушка', 'Maydanoz', 'Петрушка', 0.99, 7, 'fruit', '#15803d'],
  // Brot & Backwaren
  ['broetchen', 'brot', 'Brötchen', '1 Stück', 'Bulka (təzə)', 'Bread roll (fresh)', 'Булочка (свежая)', 'Brötchen (taze)', 'Булочка (свіжа)', 'roll', 7, 'loaf', '#d6a058'],
  ['aufback', 'brot', 'Aufbackbrötchen', '6 Stück', 'Sobada bişirilən bulka', 'Bake-at-home rolls', 'Булочки для допекания', 'Fırında pişirilecek ekmek', 'Булочки для допікання', 1.29, 7, 'pack', '#e7c08a'],
  ['mischbrot', 'brot', 'Mischbrot', '750 g', 'Qarışıq çörək', 'Mixed rye-wheat bread', 'Ржано-пшеничный хлеб', 'Karışık ekmek', 'Житньо-пшеничний хліб', 'bread', 7, 'loaf', '#a16207'],
  ['toast', 'brot', 'Toastbrot', '500 g', 'Tost çörəyi', 'Sliced toast bread', 'Тостовый хлеб', 'Tost ekmeği', 'Тостовий хліб', 1.29, 7, 'pack', '#fcd9a8'],
  ['vollkornbrot', 'brot', 'Vollkornbrot', '500 g', 'Tam taxıl çörəyi', 'Wholegrain bread', 'Цельнозерновой хлеб', 'Tam tahıllı ekmek', 'Цільнозерновий хліб', 1.89, 7, 'pack', '#78350f'],
  ['brezel', 'brot', 'Laugenbrezel', '1 Stück', 'Brezel', 'Pretzel', 'Брецель', 'Brezel', 'Брецель', 0.79, 7, 'loaf', '#92400e'],
  // Kühlregal
  ['milch', 'kuehl', 'Frische Vollmilch 3,5 %', '1 l', 'Süd', 'Fresh whole milk', 'Молоко', 'Süt', 'Молоко', 'milk', 7, 'carton', '#3b82f6'],
  ['quark', 'kuehl', 'Magerquark', '500 g', 'Kəsmik (Quark)', 'Quark (fresh curd cheese)', 'Творог (Quark)', 'Lor peyniri (Quark)', 'Сир кисломолочний (Quark)', 1.29, 7, 'tub', '#60a5fa'],
  ['joghurt', 'kuehl', 'Naturjoghurt 3,5 %', '500 g', 'Qatıq', 'Plain yoghurt', 'Натуральный йогурт', 'Sade yoğurt', 'Натуральний йогурт', 0.99, 7, 'tub', '#93c5fd'],
  ['sahne', 'kuehl', 'Schlagsahne 30 %', '200 g', 'Qaymaq (çalınan)', 'Whipping cream', 'Сливки для взбивания', 'Krema (çırpma)', 'Вершки для збивання', 0.99, 7, 'carton', '#f8fafc'],
  ['sauresahne', 'kuehl', 'Saure Sahne 10 %', '200 g', 'Xama (az yağlı)', 'Sour cream', 'Сметана (10 %)', 'Ekşi krema', 'Сметана (10 %)', 0.69, 7, 'tub', '#e0f2fe'],
  ['schmand', 'kuehl', 'Schmand 24 %', '200 g', 'Xama (yağlı)', 'Schmand (rich sour cream)', 'Шманд (жирная сметана)', 'Schmand (yağlı ekşi krema)', 'Шманд (жирна сметана)', 0.89, 7, 'tub', '#fef3c7'],
  ['frischkaese', 'kuehl', 'Frischkäse Natur', '200 g', 'Krem pendir', 'Cream cheese', 'Сливочный сыр', 'Krem peynir', 'Вершковий сир', 1.19, 7, 'tub', '#a5b4fc'],
  ['gouda', 'kuehl', 'Gouda in Scheiben', '400 g', 'Dilimlənmiş Gouda pendiri', 'Sliced Gouda cheese', 'Гауда ломтиками', 'Dilim Gouda peyniri', 'Гауда скибочками', 2.79, 7, 'pack', '#fbbf24'],
  ['butter', 'kuehl', 'Deutsche Markenbutter', '250 g', 'Kərə yağı', 'Butter', 'Сливочное масло', 'Tereyağı', 'Вершкове масло', 'butter', 7, 'pack', '#fde68a'],
  ['eier', 'kuehl', 'Eier aus Freilandhaltung', '10 Stück', 'Yumurta', 'Free-range eggs', 'Яйца', 'Yumurta', 'Яйця', 'eggs', 7, 'box', '#fef9c3'],
  ['margarine', 'kuehl', 'Margarine', '500 g', 'Marqarin', 'Margarine', 'Маргарин', 'Margarin', 'Маргарин', 1.79, 7, 'tub', '#facc15'],
  ['mozzarella', 'kuehl', 'Mozzarella', '125 g', 'Motsarella', 'Mozzarella', 'Моцарелла', 'Mozzarella', 'Моцарела', 0.89, 7, 'bag', '#ecfdf5'],
  // Fleisch & Wurst
  ['hackrind', 'fleisch', 'Rinderhackfleisch', '500 g', 'Mal əti qiyməsi', 'Minced beef', 'Говяжий фарш', 'Dana kıyma', 'Яловичий фарш', 5.49, 7, 'pack', '#b91c1c'],
  ['hackgemischt', 'fleisch', 'Hackfleisch gemischt (Rind/Schwein)', '500 g', 'Qarışıq qiymə (mal + donuz)', 'Mixed mince (beef + pork)', 'Смешанный фарш (говядина + свинина)', 'Karışık kıyma (dana + domuz)', 'Змішаний фарш (яловичина + свинина)', 3.99, 7, 'pack', '#f87171'],
  ['haehnchen', 'fleisch', 'Hähnchenbrustfilet', '1 kg', 'Toyuq döşü filesi', 'Chicken breast fillet', 'Куриное филе', 'Tavuk göğsü', 'Куряче філе', 'chicken', 7, 'pack', '#fda4af'],
  ['aufschnitt', 'fleisch', 'Aufschnitt, gemischt', '200 g', 'Dilimlənmiş kolbasa çeşidi', 'Mixed cold cuts', 'Мясная нарезка ассорти', 'Karışık şarküteri dilimleri', 'М’ясна нарізка асорті', 1.79, 7, 'pack', '#fb7185'],
  ['salami', 'fleisch', 'Salami', '100 g', 'Salyami', 'Salami', 'Салями', 'Salam', 'Салямі', 1.49, 7, 'pack', '#9f1239'],
  ['pute', 'fleisch', 'Putenbrust-Aufschnitt', '150 g', 'Hind toyuğu dilimləri', 'Sliced turkey breast', 'Нарезка из индейки', 'Hindi göğüs dilimleri', 'Нарізка з індички', 1.99, 7, 'pack', '#fecdd3'],
  ['bratwurst', 'fleisch', 'Bratwurst', '400 g', 'Qızartma üçün kolbasa', 'Bratwurst (frying sausages)', 'Колбаски для жарки', 'Izgara sucuk (Bratwurst)', 'Ковбаски для смаження', 2.99, 7, 'pack', '#c2410c'],
  ['lachs', 'fleisch', 'Räucherlachs', '100 g', 'Hisə verilmiş qızılbalıq', 'Smoked salmon', 'Копчёный лосось', 'Füme somon', 'Копчений лосось', 2.49, 7, 'pack', '#fb923c'],
  // Grundnahrungsmittel
  ['mehl405', 'vorrat', 'Weizenmehl Type 405', '1 kg', 'Buğda unu (Type 405, ağ)', 'Plain wheat flour (Type 405)', 'Пшеничная мука (Type 405, белая)', 'Buğday unu (Type 405, beyaz)', 'Пшеничне борошно (Type 405, біле)', 0.79, 7, 'bag', '#f1f5f9'],
  ['mehl1050', 'vorrat', 'Weizenmehl Type 1050', '1 kg', 'Buğda unu (Type 1050, tünd)', 'Darker wheat flour (Type 1050)', 'Пшеничная мука (Type 1050, тёмная)', 'Buğday unu (Type 1050, esmer)', 'Пшеничне борошно (Type 1050, темне)', 0.99, 7, 'bag', '#d6d3d1'],
  ['vollkornmehl', 'vorrat', 'Weizenvollkornmehl', '1 kg', 'Tam taxıl unu', 'Wholemeal flour', 'Цельнозерновая мука', 'Tam buğday unu', 'Цільнозернове борошно', 1.19, 7, 'bag', '#a8a29e'],
  ['zucker', 'vorrat', 'Zucker', '1 kg', 'Şəkər', 'Sugar', 'Сахар', 'Şeker', 'Цукор', 0.99, 7, 'bag', '#ffffff'],
  ['salz', 'vorrat', 'Speisesalz, jodiert', '500 g', 'Yodlu duz', 'Iodised salt', 'Йодированная соль', 'İyotlu tuz', 'Йодована сіль', 0.39, 7, 'box', '#bfdbfe'],
  ['nudeln', 'vorrat', 'Spaghetti', '500 g', 'Spagetti', 'Spaghetti', 'Спагетти', 'Spagetti', 'Спагеті', 'pasta', 7, 'box', '#2563eb'],
  ['reis', 'vorrat', 'Basmatireis', '1 kg', 'Basmati düyüsü', 'Basmati rice', 'Рис басмати', 'Basmati pirinç', 'Рис басматі', 'rice', 7, 'bag', '#fef3c7'],
  ['haferflocken', 'vorrat', 'Haferflocken', '500 g', 'Yulaf yarması', 'Rolled oats', 'Овсяные хлопья', 'Yulaf ezmesi', 'Вівсяні пластівці', 0.79, 7, 'bag', '#d9f99d'],
  ['kaffee', 'vorrat', 'Kaffeebohnen', '1 kg', 'Qəhvə dənələri', 'Coffee beans', 'Кофе в зёрнах', 'Çekirdek kahve', 'Кава в зернах', 'coffeeBeans', 7, 'bag', '#422006'],
  ['oel', 'vorrat', 'Sonnenblumenöl', '1 l', 'Günəbaxan yağı', 'Sunflower oil', 'Подсолнечное масло', 'Ayçiçek yağı', 'Соняшникова олія', 1.79, 7, 'bottle', '#fde047'],
  // Getränke
  ['sprudel', 'getraenke', 'Mineralwasser Classic (Sprudel)', '1,5 l', 'Qazlı mineral su', 'Sparkling mineral water', 'Газированная минеральная вода', 'Gazlı maden suyu', 'Газована мінеральна вода', 'water', 19, 'bottle', '#0ea5e9', 0.25],
  ['still', 'getraenke', 'Mineralwasser still', '1,5 l', 'Qazsız mineral su', 'Still mineral water', 'Негазированная вода', 'Gazsız maden suyu', 'Негазована вода', 'water', 19, 'bottle', '#7dd3fc', 0.25],
  ['medium', 'getraenke', 'Mineralwasser Medium', '1,5 l', 'Az qazlı mineral su', 'Lightly sparkling water', 'Слабогазированная вода', 'Az gazlı maden suyu', 'Слабогазована вода', 'water', 19, 'bottle', '#38bdf8', 0.25],
  ['schorle', 'getraenke', 'Apfelschorle', '1,5 l', 'Qazlı su ilə alma şirəsi', 'Apple juice spritzer', 'Яблочный сок с газированной водой', 'Gazlı elma suyu', 'Яблучний сік з газованою водою', 0.99, 19, 'bottle', '#f59e0b', 0.25],
  ['cola', 'getraenke', 'Cola', '1,5 l', 'Kola', 'Cola', 'Кола', 'Kola', 'Кола', 'cola', 19, 'bottle', '#7f1d1d', 0.25],
  ['bier', 'getraenke', 'Pils, Flasche (Mehrweg)', '0,5 l', 'Pivə (şüşə)', 'Lager beer (glass bottle)', 'Пиво (стекло)', 'Bira (cam şişe)', 'Пиво (скло)', 'beerShop', 19, 'glass', '#854d0e', 0.08],
  ['saft', 'getraenke', 'Orangensaft (Tetrapak)', '1 l', 'Portağal şirəsi (karton)', 'Orange juice (carton)', 'Апельсиновый сок (пакет)', 'Portakal suyu (karton)', 'Апельсиновий сік (пакет)', 1.49, 19, 'carton', '#fb923c'],
  // Drogerie & Haushalt
  ['spuelmittel', 'drogerie', 'Spülmittel', '500 ml', 'Qab yuyucu maye', 'Washing-up liquid', 'Средство для мытья посуды', 'Bulaşık deterjanı', 'Засіб для миття посуду', 0.95, 19, 'bottle', '#22c55e'],
  ['tabs', 'drogerie', 'Spülmaschinentabs', '30 Stück', 'Qabyuyan maşın tabletləri', 'Dishwasher tablets', 'Таблетки для посудомойки', 'Bulaşık makinesi tableti', 'Таблетки для посудомийки', 3.49, 19, 'box', '#0d9488'],
  ['waschmittel', 'drogerie', 'Vollwaschmittel', '20 WL', 'Paltar yuyucu toz', 'Laundry detergent', 'Стиральный порошок', 'Çamaşır deterjanı', 'Пральний порошок', 3.95, 19, 'box', '#f97316'],
  ['weichspueler', 'drogerie', 'Weichspüler', '1 l', 'Paltar yumşaldıcı', 'Fabric softener', 'Кондиционер для белья', 'Yumuşatıcı', 'Кондиціонер для білизни', 1.29, 19, 'bottle', '#c084fc'],
  ['klopapier', 'drogerie', 'Toilettenpapier', '8 Rollen', 'Tualet kağızı', 'Toilet paper', 'Туалетная бумага', 'Tuvalet kâğıdı', 'Туалетний папір', 2.99, 19, 'roll', '#f1f5f9'],
  ['zahnpasta', 'drogerie', 'Zahnpasta', '75 ml', 'Diş pastası', 'Toothpaste', 'Зубная паста', 'Diş macunu', 'Зубна паста', 'toothpaste', 19, 'tube', '#06b6d4'],
  ['shampoo', 'drogerie', 'Shampoo', '300 ml', 'Şampun', 'Shampoo', 'Шампунь', 'Şampuan', 'Шампунь', 1.25, 19, 'bottle', '#ec4899'],
  ['muellbeutel', 'drogerie', 'Müllbeutel 35 l', '20 Stück', 'Zibil torbası', 'Bin bags', 'Мешки для мусора', 'Çöp torbası', 'Мішки для сміття', 1.49, 19, 'roll', '#475569'],
  ['kuechenrolle', 'drogerie', 'Küchenrolle', '4 Rollen', 'Mətbəx kağız dəsmalı', 'Kitchen roll', 'Бумажные полотенца', 'Kâğıt havlu', 'Паперові рушники', 2.29, 19, 'roll', '#e2e8f0'],
];

/** Explanations of the products people mix up (shown on a wrong pick and on the receipt review). */
// prettier-ignore
const NOTES: Record<string, Tx> = {
  quark: { de: 'Quark ist ein weicher Frischkäse aus Milch — kein Joghurt. Für Käsekuchen und Dips.', az: 'Quark — yumşaq, turş kəsmik; qatıq (Joghurt) deyil. Pendir bişirmək və şirniyyat üçün.', en: 'Quark is a soft fresh curd cheese — not yoghurt. Used for cheesecake and dips.', ru: 'Quark — мягкий творог, не йогурт. Для чизкейка и соусов.', tr: 'Quark yumuşak, taze lor peyniridir — yoğurt değil. Cheesecake ve soslarda kullanılır.', uk: 'Quark — м’який кисломолочний сир, не йогурт. Для чизкейку та соусів.' },
  joghurt: { de: 'Joghurt ist kein Quark: Quark ist fester und säuerlicher.', az: 'Joghurt — qatıq. Quark daha qatı kəsmikdir.', en: 'Joghurt is yoghurt. Quark is the thicker curd cheese.', ru: 'Joghurt — йогурт. Quark — более густой творог.', tr: 'Joghurt yoğurttur. Quark daha koyu lor peyniridir.', uk: 'Joghurt — йогурт. Quark — густіший кисломолочний сир.' },
  sahne: { de: 'Sahne (Schlagsahne) ist flüssig, zum Schlagen und für Soßen — keine saure Sahne.', az: 'Sahne (Schlagsahne) — maye qaymaq, çalmaq və sous üçün. Turş xama deyil.', en: 'Sahne (Schlagsahne) is liquid cream for whipping and sauces — not sour cream.', ru: 'Sahne (Schlagsahne) — жидкие сливки для взбивания и соусов, не сметана.', tr: 'Sahne (Schlagsahne) çırpmak ve sos için sıvı kremadır — ekşi krema değil.', uk: 'Sahne (Schlagsahne) — рідкі вершки для збивання й соусів, не сметана.' },
  sauresahne: { de: 'Saure Sahne hat nur 10 % Fett. Süße Sahne heißt Schlagsahne.', az: 'Saure Sahne — az yağlı xama (10 %). Şirin qaymaq lazımdırsa: Schlagsahne.', en: 'Saure Sahne is light sour cream (10 %). For sweet cream you need Schlagsahne.', ru: 'Saure Sahne — нежирная сметана (10 %). Сливки — это Schlagsahne.', tr: 'Saure Sahne hafif ekşi kremadır (%10). Tatlı krema için Schlagsahne gerekir.', uk: 'Saure Sahne — нежирна сметана (10 %). Вершки — це Schlagsahne.' },
  schmand: { de: 'Schmand ist saure Sahne mit 20–24 % Fett und flockt beim Kochen nicht aus.', az: 'Schmand — yağlı xama (20–24 %), bişirəndə laxtalanmır. Bizim xamaya ən yaxın.', en: 'Schmand is rich sour cream (20–24 %) that does not curdle when cooked — closest to smetana.', ru: 'Schmand — жирная сметана (20–24 %), не сворачивается при готовке; ближе всего к нашей сметане.', tr: 'Schmand yağlı ekşi kremadır (%20–24), pişerken kesilmez.', uk: 'Schmand — жирна сметана (20–24 %), не згортається під час готування.' },
  frischkaese: { de: 'Frischkäse ist streichfähig; Quark ist säuerlicher und trockener.', az: 'Frischkäse — çörəyə yaxılan krem pendir. Quark daha turş və quru olur.', en: 'Frischkäse is spreadable cream cheese. Quark is sourer and drier.', ru: 'Frischkäse — сливочный сыр для бутербродов. Quark кислее и суше.', tr: 'Frischkäse sürülebilir krem peynirdir. Quark daha ekşi ve kurudur.', uk: 'Frischkäse — вершковий сир для бутербродів. Quark кисліший і сухіший.' },
  hackrind: { de: 'Rinderhackfleisch ist reines Rind. Wer kein Schwein isst, nimmt dieses (nicht halal — dafür türkische Läden).', az: 'Rinderhackfleisch — yalnız mal əti. Donuz əti yemirsinizsə, bunu seçin (halal deyil — halal üçün türk marketlərinə baxın).', en: 'Rinderhackfleisch is 100 % beef. If you do not eat pork, take this one (not halal — for halal look in Turkish shops).', ru: 'Rinderhackfleisch — только говядина. Если не едите свинину — берите его (не халяль: халяль — в турецких магазинах).', tr: 'Rinderhackfleisch %100 danadır. Domuz yemiyorsanız bunu alın (helal değil — helal için Türk marketlerine bakın).', uk: 'Rinderhackfleisch — лише яловичина. Якщо не їсте свинину — беріть його (не халяль: халяль — у турецьких магазинах).' },
  hackgemischt: { de: 'Achtung: „Hackfleisch gemischt“ ist Rind und SCHWEIN — das häufigste Hackfleisch in Deutschland.', az: 'Diqqət: “Hackfleisch gemischt” = mal + DONUZ əti. Alman marketlərində ən çox satılan qiymədir.', en: 'Careful: “Hackfleisch gemischt” means beef + PORK. It is the most common mince in German shops.', ru: 'Внимание: «Hackfleisch gemischt» — говядина + СВИНИНА. Самый распространённый фарш в Германии.', tr: 'Dikkat: “Hackfleisch gemischt” dana + DOMUZ demektir. Almanya’da en yaygın kıymadır.', uk: 'Увага: «Hackfleisch gemischt» — яловичина + СВИНИНА. Найпоширеніший фарш у Німеччині.' },
  aufschnitt: { de: 'Aufschnitt ist Wurst in Scheiben fürs Brot, oft vom Schwein. Zutaten lesen!', az: 'Aufschnitt — çörək üçün dilimlənmiş kolbasa çeşidi; çox vaxt donuz ətindən. Tərkibə (Zutaten) baxın.', en: 'Aufschnitt is sliced cold cuts for bread, often pork. Check the ingredients (Zutaten).', ru: 'Aufschnitt — мясная нарезка для бутербродов, часто из свинины. Смотрите состав (Zutaten).', tr: 'Aufschnitt ekmek için dilimlenmiş şarküteridir, çoğu domuz etinden. İçindekilere (Zutaten) bakın.', uk: 'Aufschnitt — м’ясна нарізка для бутербродів, часто зі свинини. Дивіться склад (Zutaten).' },
  mehl405: { de: 'Type 405 ist das helle Standardmehl (Kuchen, Pfannkuchen, Soßen). Je höher die Zahl, desto dunkler das Mehl.', az: 'Type 405 — ən ağ, adi un (tort, pancake, sous). Rəqəm böyüdükcə un tündləşir.', en: 'Type 405 is the standard white flour (cakes, pancakes, sauces). Higher numbers mean darker flour.', ru: 'Type 405 — обычная белая мука (выпечка, блины, соусы). Чем больше число, тем темнее мука.', tr: 'Type 405 standart beyaz undur (kek, krep, sos). Sayı büyüdükçe un koyulaşır.', uk: 'Type 405 — звичайне біле борошно (випічка, млинці, соуси). Більше число — темніше борошно.' },
  mehl1050: { de: 'Type 1050 ist dunkleres Brotmehl. Steht Type 405 auf dem Zettel, brauchen Sie das helle.', az: 'Type 1050 — tünd un (çörək üçün). Siyahıda Type 405 yazılıbsa, ağ un lazımdır.', en: 'Type 1050 is a darker bread flour. If the list says Type 405, you need the white one.', ru: 'Type 1050 — тёмная мука для хлеба. Если в списке Type 405 — нужна белая.', tr: 'Type 1050 ekmek için esmer undur. Listede Type 405 yazıyorsa beyaz un lazım.', uk: 'Type 1050 — темне борошно для хліба. Якщо в списку Type 405 — потрібне біле.' },
  vollkornmehl: { de: 'Vollkornmehl ist nicht Type 405.', az: 'Vollkornmehl — kəpəkli tam taxıl unu, Type 405 deyil.', en: 'Vollkornmehl is wholemeal flour, not Type 405.', ru: 'Vollkornmehl — цельнозерновая мука, не Type 405.', tr: 'Vollkornmehl tam buğday unudur, Type 405 değil.', uk: 'Vollkornmehl — цільнозернове борошно, не Type 405.' },
  sprudel: { de: '„Sprudel“ / Classic = mit viel Kohlensäure. Ohne heißt „still“, wenig Kohlensäure „Medium“.', az: '“Sprudel” / Classic — qazlı su. Qazsız su: “still”, az qazlı: “Medium”.', en: '“Sprudel” / Classic = sparkling. Still water says “still”, lightly sparkling “Medium”.', ru: '«Sprudel» / Classic — газированная. Без газа: «still», слабогаз.: «Medium».', tr: '“Sprudel” / Classic gazlıdır. Gazsız: “still”, az gazlı: “Medium”.', uk: '«Sprudel» / Classic — газована. Без газу: «still», слабогазована: «Medium».' },
  still: { de: '„Still“ = ohne Kohlensäure. „Sprudel“ hat Kohlensäure.', az: '“Still” — qazsız su. “Sprudel” isə qazlı deməkdir.', en: '“Still” = no bubbles. “Sprudel” means sparkling.', ru: '«Still» — без газа. «Sprudel» — газированная.', tr: '“Still” gazsız demektir. “Sprudel” gazlıdır.', uk: '«Still» — без газу. «Sprudel» — газована.' },
  medium: { de: '„Medium“ hat wenig Kohlensäure — weder still noch Sprudel.', az: '“Medium” — az qazlı su: nə tam qazlı, nə qazsız.', en: '“Medium” is lightly sparkling — neither still nor fully sparkling.', ru: '«Medium» — слабогазированная: ни без газа, ни полностью газированная.', tr: '“Medium” az gazlıdır — ne gazsız ne tam gazlı.', uk: '«Medium» — слабогазована: ні без газу, ні повністю газована.' },
  broetchen: { de: 'Brötchen sind frisch vom Bäcker. Aufbackbrötchen backt man zu Hause im Ofen auf.', az: 'Brötchen — təzə bulka (çörək bölməsində və ya pekarnada). Aufbackbrötchen evdə sobada bişirilir.', en: 'Brötchen are fresh rolls (bakery counter). Aufbackbrötchen are baked at home in the oven.', ru: 'Brötchen — свежие булочки (у пекарни). Aufbackbrötchen допекают дома в духовке.', tr: 'Brötchen taze küçük ekmektir (fırın bölümü). Aufbackbrötchen evde fırında pişirilir.', uk: 'Brötchen — свіжі булочки (пекарня). Aufbackbrötchen допікають удома в духовці.' },
  aufback: { de: 'Aufbackbrötchen sind vorgebacken (10 Minuten in den Ofen) — keine frischen Brötchen.', az: 'Aufbackbrötchen — yarımbişmiş bulka, 10 dəq sobada. Təzə Brötchen deyil.', en: 'Aufbackbrötchen are part-baked rolls (10 min in the oven) — not fresh Brötchen.', ru: 'Aufbackbrötchen — полуфабрикат, 10 мин в духовке, не свежие Brötchen.', tr: 'Aufbackbrötchen yarı pişmiş ekmeklerdir (fırında 10 dk) — taze Brötchen değil.', uk: 'Aufbackbrötchen — напівфабрикат, 10 хв у духовці, не свіжі Brötchen.' },
  spuelmittel: { de: 'Spülmittel ist zum Abwaschen mit der Hand. Die Spülmaschine braucht Tabs.', az: 'Spülmittel — əllə qab yumaq üçün maye. Qabyuyan maşın üçün tabletlər (Tabs) lazımdır.', en: 'Spülmittel is washing-up liquid for washing by hand. The dishwasher needs tabs.', ru: 'Spülmittel — средство для мытья посуды руками. Для посудомойки нужны таблетки.', tr: 'Spülmittel elde bulaşık deterjanıdır. Makine için tablet gerekir.', uk: 'Spülmittel — засіб для миття посуду руками. Для посудомийки потрібні таблетки.' },
  tabs: { de: 'Spülmaschinentabs nur für die Spülmaschine; zum Abwaschen mit der Hand: Spülmittel.', az: 'Spülmaschinentabs — yalnız qabyuyan maşın üçün; əllə yumaq üçün Spülmittel.', en: 'Spülmaschinentabs are only for the dishwasher; for hand washing take Spülmittel.', ru: 'Spülmaschinentabs — только для посудомойки; для рук — Spülmittel.', tr: 'Spülmaschinentabs sadece makine içindir; elde yıkamak için Spülmittel.', uk: 'Spülmaschinentabs — лише для посудомийки; для рук — Spülmittel.' },
  waschmittel: { de: 'Waschmittel wäscht die Wäsche (WL = Waschladungen). Weichspüler macht sie nur weich.', az: 'Waschmittel — paltar yuyucu vasitə (WL = Waschladung, yuma sayı). Weichspüler yalnız yumşaldır.', en: 'Waschmittel is laundry detergent (WL = loads). Weichspüler only softens.', ru: 'Waschmittel — стиральное средство (WL — число стирок). Weichspüler только смягчает.', tr: 'Waschmittel çamaşır deterjanıdır (WL = yıkama sayısı). Weichspüler sadece yumuşatır.', uk: 'Waschmittel — пральний засіб (WL — кількість прань). Weichspüler лише пом’якшує.' },
  weichspueler: { de: 'Weichspüler macht Wäsche weich, wäscht aber nicht. Zum Waschen: Waschmittel.', az: 'Weichspüler — yumşaldıcı, paltarı təmizləmir. Paltar yumaq üçün Waschmittel lazımdır.', en: 'Weichspüler is fabric softener — it does not clean. For washing you need Waschmittel.', ru: 'Weichspüler — кондиционер, он не стирает. Для стирки нужен Waschmittel.', tr: 'Weichspüler yumuşatıcıdır, temizlemez. Yıkamak için Waschmittel gerekir.', uk: 'Weichspüler — кондиціонер, він не пере. Для прання потрібен Waschmittel.' },
};

/** Products that can be confused with each other (a list item and its look-alikes). */
export const CONFUSABLE: Record<string, string[]> = {
  quark: ['joghurt', 'frischkaese'],
  sahne: ['sauresahne', 'schmand'],
  hackrind: ['hackgemischt'],
  hackgemischt: ['hackrind'],
  mehl405: ['mehl1050', 'vollkornmehl'],
  sprudel: ['still', 'medium'],
  still: ['sprudel', 'medium'],
  broetchen: ['aufback'],
  spuelmittel: ['tabs'],
  waschmittel: ['weichspueler'],
  frischkaese: ['quark'],
  aufschnitt: ['salami', 'pute'],
};

export const PRODUCTS: Product[] = ROWS.map(([id, aisle, de, unit, az, en, ru, tr, uk, price, vat, shape, colour, pfand]) => {
  const ref = typeof price === 'string' ? PRICE_BY_ID.get(price) : undefined;
  if (typeof price === 'string' && !ref) throw new Error(`price item ${price}`);
  return {
    id,
    aisle,
    de,
    unit,
    name: { az, de, en, ru, tr, uk },
    price: ref ? ref.price : (price as number),
    basis: ref ? 'priceGame' : 'estimate',
    vat,
    pfand,
    shape,
    colour,
    note: NOTES[id],
  } satisfies Product;
});

export const PRODUCT_BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));
export const productsIn = (aisle: Aisle) => PRODUCTS.filter((p) => p.aisle === aisle);

/** Empty bottles / cans for the deposit machine step, with their deposit (0 = no Pfand: not taken by the machine). */
export interface Empty {
  id: string;
  de: string;
  pfand: 0 | 0.08 | 0.15 | 0.25;
  shape: Shape;
  colour: string;
  /** Where it goes instead when there is no Pfand. */
  bin?: 'glas' | 'gelb';
}
// prettier-ignore
export const EMPTIES: Empty[] = [
  { id: 'pet', de: 'Wasserflasche 1,5 l, Einweg (PET)', pfand: 0.25, shape: 'bottle', colour: '#38bdf8' },
  { id: 'dose', de: 'Getränkedose 0,33 l', pfand: 0.25, shape: 'can', colour: '#dc2626' },
  { id: 'bierflasche', de: 'Bierflasche 0,5 l, Mehrweg (Glas)', pfand: 0.08, shape: 'glass', colour: '#854d0e' },
  { id: 'glaswasser', de: 'Wasserflasche 0,7 l, Mehrweg (Glas)', pfand: 0.15, shape: 'glass', colour: '#0ea5e9' },
  { id: 'weinflasche', de: 'Weinflasche (Glas)', pfand: 0, shape: 'glass', colour: '#166534', bin: 'glas' },
  { id: 'saftkarton', de: 'Saftkarton 1 l', pfand: 0, shape: 'carton', colour: '#fb923c', bin: 'gelb' },
  { id: 'schorle', de: 'Apfelschorle 1,5 l, Einweg (PET)', pfand: 0.25, shape: 'bottle', colour: '#f59e0b' },
  { id: 'marmeladenglas', de: 'Marmeladenglas', pfand: 0, shape: 'jar', colour: '#be123c', bin: 'glas' },
];
export const PFAND_OPTIONS = [0, 0.08, 0.15, 0.25] as const;

/** Paper bag at the till (estimate; light plastic carrier bags are banned since 1 Jan 2022, § 5 VerpackG). */
export const BAG_PRICE = 0.2;

export const SUPERMARKET_SOURCES = [
  { key: 'pfand', url: 'https://www.verbraucherzentrale.de/wissen/umwelt-haushalt/abfall/mehrweg-oder-einweg-wichtige-unterschiede-beim-pfand-11504' },
  { key: 'bags', url: 'https://www.bundesregierung.de/breg-de/aktuelles/dunne-plastiktueten-verboten-1688818' },
  { key: 'vat', url: 'https://www.gesetze-im-internet.de/ustg_1980/__12.html' },
] as const;
