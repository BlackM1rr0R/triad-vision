/**
 * Waste sorting game (/waste-sorting, Mülltrennung): the bins and ~60 household items with the bin most German
 * municipalities expect, a short explanation in all six site languages and a "tricky" flag for the classic
 * mistakes. Rules differ between municipalities (Kommunen): the answers follow the nationwide recommendations
 * of the Umweltbundesamt, the dual systems' initiative "Mülltrennung wirkt" and the consumer advice centres;
 * the page tells players to check their local Abfallkalender. No imports besides types (unit tests load it).
 */
import type { Tx } from '../common';

export const WASTE_AS_OF = '2026-11';

export const WASTE_SOURCES: { label: string; url: string }[] = [
  { label: 'Umweltbundesamt: Abfälle im Haushalt', url: 'https://www.umweltbundesamt.de/themen/abfaelle-im-haushalt' },
  { label: 'Umweltbundesamt: Ohne Mülltrennung kein Recycling', url: 'https://www.umweltbundesamt.de/themen/ohne-muelltrennung-kein-recycling' },
  { label: 'Mülltrennung wirkt (duale Systeme)', url: 'https://www.muelltrennung-wirkt.de/' },
  { label: 'Verbraucherzentrale NRW: Wertstoffe richtig trennen', url: 'https://www.verbraucherzentrale.nrw/wissen/umwelt-haushalt/abfall/recycling-von-verpackungen-wertstoffe-fuer-den-muell-richtig-trennen-32617' },
  { label: 'DPG Deutsche Pfandsystem GmbH', url: 'https://dpg-pfandsystem.de/' },
  { label: 'Arzneimittelentsorgung (BMUV / ISOE)', url: 'https://arzneimittelentsorgung.de/' },
  { label: 'Batterien zurück (Stiftung GRS)', url: 'https://www.batterie-zurueck.de/' },
  { label: 'E-Schrott entsorgen (BMUV)', url: 'https://www.e-schrott-entsorgen.org/' },
];

export const WASTE_BINS = ['gelb', 'papier', 'bio', 'rest', 'glas', 'pfand', 'sonder'] as const;
export type WasteBin = (typeof WASTE_BINS)[number];
export type GlassColour = 'weiss' | 'gruen' | 'braun';

export interface BinInfo {
  key: WasteBin;
  /** German name as written on bins and in the Abfallkalender. */
  de: string;
  /** Colour of the lid / container (CSS colour for the self-drawn bin). */
  colour: string;
  name: Tx;
  /** What belongs there, one line. */
  hint: Tx;
}

export const BINS: BinInfo[] = [
  {
    key: 'gelb',
    de: 'Gelber Sack / Gelbe Tonne',
    colour: '#f2c200',
    name: { az: 'Sarı kisə / sarı qab', de: 'Gelber Sack / Gelbe Tonne', en: 'Yellow bag / bin', ru: 'Жёлтый мешок / бак', tr: 'Sarı torba / kutu', uk: 'Жовтий мішок / бак' },
    hint: {
      az: 'Boş qablaşdırma: plastik, metal, kompozit (kağız və şüşədən başqa).',
      de: 'Leere Verpackungen aus Kunststoff, Metall und Verbund (nicht Papier, nicht Glas).',
      en: 'Empty packaging made of plastic, metal or composites (not paper, not glass).',
      ru: 'Пустая упаковка из пластика, металла и комбинированных материалов (не бумага и не стекло).',
      tr: 'Plastik, metal ve kompozit boş ambalajlar (kâğıt ve cam hariç).',
      uk: 'Порожня упаковка з пластику, металу й комбінованих матеріалів (не папір і не скло).',
    },
  },
  {
    key: 'papier',
    de: 'Papiertonne (blau)',
    colour: '#1f5fbf',
    name: { az: 'Kağız (göy qab)', de: 'Papier (blaue Tonne)', en: 'Paper (blue bin)', ru: 'Бумага (синий бак)', tr: 'Kâğıt (mavi kutu)', uk: 'Папір (синій бак)' },
    hint: {
      az: 'Qəzet, karton, kağız paketlər — təmiz və quru.',
      de: 'Zeitungen, Kartons, Papiertüten – sauber und trocken.',
      en: 'Newspapers, cardboard, paper bags — clean and dry.',
      ru: 'Газеты, картон, бумажные пакеты — чистые и сухие.',
      tr: 'Gazete, karton, kâğıt poşet — temiz ve kuru.',
      uk: 'Газети, картон, паперові пакети — чисті й сухі.',
    },
  },
  {
    key: 'bio',
    de: 'Biotonne (braun)',
    colour: '#7a4a1f',
    name: { az: 'Bio (qəhvəyi qab)', de: 'Bio (braune Tonne)', en: 'Organic (brown bin)', ru: 'Био (коричневый бак)', tr: 'Organik (kahverengi kutu)', uk: 'Біо (коричневий бак)' },
    hint: {
      az: 'Mətbəx və bağ tullantıları; plastik paket olmadan.',
      de: 'Küchen- und Gartenabfälle, ohne Plastiktüten.',
      en: 'Kitchen and garden waste, without plastic bags.',
      ru: 'Кухонные и садовые отходы, без пластиковых пакетов.',
      tr: 'Mutfak ve bahçe atıkları, plastik poşetsiz.',
      uk: 'Кухонні та садові відходи, без пластикових пакетів.',
    },
  },
  {
    key: 'rest',
    de: 'Restmüll (schwarz/grau)',
    colour: '#3d434a',
    name: { az: 'Qalıq tullantı (qara/boz)', de: 'Restmüll (schwarz/grau)', en: 'General waste (black/grey)', ru: 'Остаточный мусор (чёрный/серый)', tr: 'Evsel atık (siyah/gri)', uk: 'Залишкове сміття (чорний/сірий)' },
    hint: {
      az: 'Təkrar emal olunmayan hər şey: gigiyena, çini, çek kağızı.',
      de: 'Alles, was nicht verwertet werden kann: Hygieneartikel, Keramik, Kassenbons.',
      en: 'Everything that cannot be recycled: hygiene items, ceramics, receipts.',
      ru: 'Всё, что не перерабатывается: гигиена, керамика, кассовые чеки.',
      tr: 'Geri dönüştürülemeyen her şey: hijyen ürünleri, seramik, fişler.',
      uk: 'Усе, що не переробляється: гігієна, кераміка, касові чеки.',
    },
  },
  {
    key: 'glas',
    de: 'Altglascontainer (weiß/grün/braun)',
    colour: '#2e8b57',
    name: { az: 'Şüşə konteyneri', de: 'Altglas (weiß/grün/braun)', en: 'Glass bank (white/green/brown)', ru: 'Контейнер для стекла', tr: 'Cam kumbarası', uk: 'Контейнер для скла' },
    hint: {
      az: 'Boş şüşə qablar rənginə görə: ağ, yaşıl, qəhvəyi; digər rənglər — yaşıla.',
      de: 'Leere Glasverpackungen nach Farbe: weiß, grün, braun; andere Farben zu Grün.',
      en: 'Empty glass packaging by colour: white, green, brown; other colours go to green.',
      ru: 'Пустая стеклотара по цвету: белое, зелёное, коричневое; другие цвета — в зелёный.',
      tr: 'Boş cam ambalaj renge göre: beyaz, yeşil, kahverengi; diğer renkler yeşile.',
      uk: 'Порожня скляна тара за кольором: біле, зелене, коричневе; інші кольори — у зелений.',
    },
  },
  {
    key: 'pfand',
    de: 'Pfandrückgabe im Laden',
    colour: '#0e7c86',
    name: { az: 'Pfand (mağazada qaytar)', de: 'Pfand (zurück in den Laden)', en: 'Deposit return (shop)', ru: 'Пфанд (вернуть в магазин)', tr: 'Depozito (markete iade)', uk: 'Пфанд (повернути в магазин)' },
    hint: {
      az: 'Pfand nişanlı butulka və bankalar — avtomatda pul geri.',
      de: 'Flaschen und Dosen mit Pfandzeichen – Geld zurück am Automaten.',
      en: 'Bottles and cans with a deposit mark — money back at the machine.',
      ru: 'Бутылки и банки со знаком пфанда — деньги назад в автомате.',
      tr: 'Depozito işaretli şişe ve kutular — makineden para iadesi.',
      uk: 'Пляшки та банки зі знаком пфанду — гроші назад в автоматі.',
    },
  },
  {
    key: 'sonder',
    de: 'Wertstoffhof & Sammelstellen',
    colour: '#c2410c',
    name: { az: 'Wertstoffhof və toplama yerləri', de: 'Wertstoffhof & Sammelstellen', en: 'Recycling centre & drop-off points', ru: 'Пункт приёма (Wertstoffhof)', tr: 'Geri dönüşüm merkezi ve toplama noktaları', uk: 'Пункт приймання (Wertstoffhof)' },
    hint: {
      az: 'Batareya, elektronika, boya, köhnə paltar: mağaza qutuları, Wertstoffhof, konteyner.',
      de: 'Batterien, Elektrogeräte, Farben, Altkleider: Sammelbox im Handel, Wertstoffhof, Container.',
      en: 'Batteries, electronics, paint, old clothes: shop collection boxes, recycling centre, containers.',
      ru: 'Батарейки, электроника, краски, старая одежда: боксы в магазинах, Wertstoffhof, контейнеры.',
      tr: 'Pil, elektronik, boya, eski giysi: mağaza kutuları, geri dönüşüm merkezi, konteyner.',
      uk: 'Батарейки, електроніка, фарби, старий одяг: бокси в магазинах, Wertstoffhof, контейнери.',
    },
  },
];

export const binInfo = (key: WasteBin) => BINS.find((b) => b.key === key) as BinInfo;

export interface WasteItem {
  id: string;
  bin: WasteBin;
  /** Classic mistake (people often put it elsewhere). */
  tricky: boolean;
  /** Glass container colour (glass items only). */
  glass?: GlassColour;
  /** Name in all six languages; `de` with the article. */
  name: Tx;
  /** Why it goes there. */
  why: Tx;
}

type Row = [id: string, bin: WasteBin, tricky: 0 | 1, glass: GlassColour | '', de: string, az: string, en: string, ru: string, tr: string, uk: string, wAz: string, wDe: string, wEn: string, wRu: string, wTr: string, wUk: string];

// prettier-ignore
const ROWS: Row[] = [
  // ── Gelber Sack / Gelbe Tonne ──
  ['joghurtbecher', 'gelb', 0, '', 'der Joghurtbecher', 'qatıq stəkanı', 'yoghurt pot', 'стаканчик из-под йогурта', 'yoğurt kabı', 'стаканчик з-під йогурту',
    'Plastik qablaşdırma. Alüminium qapağı ayırın — ikisi də ayrıca sarı kisəyə.', 'Kunststoffverpackung. Aludeckel abziehen – beides getrennt in den Gelben Sack.', 'Plastic packaging. Pull off the aluminium lid — both go separately into the yellow bag.', 'Пластиковая упаковка. Снимите алюминиевую крышку — обе части отдельно в жёлтый мешок.', 'Plastik ambalaj. Alüminyum kapağı ayırın — ikisi ayrı ayrı sarı torbaya.', 'Пластикова упаковка. Зніміть алюмінієву кришку — обидві частини окремо в жовтий мішок.'],
  ['getraenkekarton', 'gelb', 1, '', 'der Getränkekarton (Tetra Pak)', 'içki kartonu (Tetra Pak)', 'drinks carton (Tetra Pak)', 'тетрапак', 'içecek kartonu (Tetra Pak)', 'тетрапак',
    'Karton görünür, amma plastik və alüminium təbəqəlidir — kompozit qablaşdırma, sarı kisəyə.', 'Sieht nach Papier aus, ist aber Verbund mit Kunststoff und Alu – Gelber Sack.', 'Looks like paper but is a composite with plastic and aluminium — yellow bag.', 'Похож на бумагу, но это комбинированный материал с пластиком и алюминием — жёлтый мешок.', 'Kâğıt gibi görünür ama plastik ve alüminyumlu kompozittir — sarı torba.', 'Схожий на папір, але це комбінований матеріал із пластиком і алюмінієм — жовтий мішок.'],
  ['konservendose', 'gelb', 0, '', 'die Konservendose', 'konserv bankası', 'tin can', 'консервная банка', 'konserve kutusu', 'консервна бляшанка',
    'Metal qablaşdırma. Boşaldın, yumağa ehtiyac yoxdur.', 'Metallverpackung. Restentleert reicht, ausspülen ist nicht nötig.', 'Metal packaging. Empty it; rinsing is not necessary.', 'Металлическая упаковка. Опорожните, мыть не нужно.', 'Metal ambalaj. Boşaltın, yıkamaya gerek yok.', 'Металева упаковка. Спорожніть, мити не потрібно.'],
  ['alufolie', 'gelb', 1, '', 'die Alufolie (Verpackung)', 'alüminium folqa (qablaşdırma)', 'aluminium foil (packaging)', 'алюминиевая фольга (упаковка)', 'alüminyum folyo (ambalaj)', 'алюмінієва фольга (упаковка)',
    'Qablaşdırma folqası sarı kisəyə; yığıb kiçik top etməyin. Çox çirklidirsə — qalıq tullantı.', 'Verpackungsfolie gehört in den Gelben Sack; nicht zur Kugel knüllen. Stark verschmutzt: Restmüll.', 'Packaging foil goes into the yellow bag; do not scrunch it into a tiny ball. Heavily soiled: general waste.', 'Упаковочная фольга — в жёлтый мешок; не сминайте в комок. Сильно грязная — в остаточный мусор.', 'Ambalaj folyosu sarı torbaya; top yapmayın. Çok kirliyse evsel atık.', 'Пакувальна фольга — у жовтий мішок; не зминайте в кульку. Дуже брудна — у залишкове сміття.'],
  ['glasdeckel', 'gelb', 1, '', 'der Metalldeckel vom Glas', 'banka şüşəsinin metal qapağı', 'metal lid of a jar', 'металлическая крышка от банки', 'kavanozun metal kapağı', 'металева кришка від банки',
    'Qapaq metal qablaşdırmadır — sarı kisəyə; şüşənin özü şüşə konteynerinə.', 'Der Deckel ist Metallverpackung – Gelber Sack; das Glas selbst zum Altglas.', 'The lid is metal packaging — yellow bag; the jar itself goes to the glass bank.', 'Крышка — металлическая упаковка, в жёлтый мешок; сама банка — в контейнер для стекла.', 'Kapak metal ambalajdır — sarı torba; kavanozun kendisi cam kumbarasına.', 'Кришка — металева упаковка, у жовтий мішок; сама банка — у контейнер для скла.'],
  ['styropor', 'gelb', 1, '', 'die Styroporverpackung', 'köpük (styropor) qablaşdırma', 'polystyrene packaging', 'упаковка из пенопласта', 'strafor ambalaj', 'упаковка з пінопласту',
    'Qablaşdırma köpüyü plastikdir — sarı kisəyə. Tikintidən qalan köpük isə Wertstoffhof-a.', 'Verpackungs-Styropor ist Kunststoff – Gelber Sack. Dämmplatten vom Bau gehören zum Wertstoffhof.', 'Packaging polystyrene is plastic — yellow bag. Building insulation boards go to the recycling centre.', 'Упаковочный пенопласт — пластик, в жёлтый мешок. Строительный утеплитель — в Wertstoffhof.', 'Ambalaj straforu plastiktir — sarı torba. İnşaat yalıtım levhaları geri dönüşüm merkezine.', 'Пакувальний пінопласт — пластик, у жовтий мішок. Будівельний утеплювач — у Wertstoffhof.'],
  ['kaffeebecher', 'gelb', 1, '', 'der Coffee-to-go-Becher', 'birdəfəlik qəhvə stəkanı', 'coffee-to-go cup', 'стаканчик для кофе навынос', 'karton kahve bardağı', 'стаканчик для кави навинос',
    'Plastik örtüklü kağızdır — kompozit qablaşdırma, sarı kisəyə (qapağı ilə birlikdə). Bəzi icmalarda qalıq tullantı.', 'Papier mit Kunststoffbeschichtung – Verbundverpackung, Gelber Sack (Deckel auch). In manchen Kommunen Restmüll.', 'Paper with a plastic coating — composite packaging, yellow bag (lid too). Some municipalities say general waste.', 'Бумага с пластиковым покрытием — комбинированная упаковка, в жёлтый мешок (и крышка). В некоторых общинах — остаточный мусор.', 'Plastik kaplı kâğıt — kompozit ambalaj, sarı torba (kapak da). Bazı belediyelerde evsel atık.', 'Папір із пластиковим покриттям — комбінована упаковка, у жовтий мішок (і кришка). У деяких громадах — залишкове сміття.'],
  ['chipstuete', 'gelb', 0, '', 'die Chipstüte', 'çips paketi', 'crisps bag', 'пакет из-под чипсов', 'cips paketi', 'пакет з-під чипсів',
    'Plastik/alüminium qablaşdırma — sarı kisəyə.', 'Verpackung aus Kunststoff und Alu – Gelber Sack.', 'Plastic and aluminium packaging — yellow bag.', 'Упаковка из пластика и алюминия — жёлтый мешок.', 'Plastik ve alüminyum ambalaj — sarı torba.', 'Упаковка з пластику й алюмінію — жовтий мішок.'],
  ['shampooflasche', 'gelb', 0, '', 'die Shampooflasche (leer)', 'şampun butulkası (boş)', 'shampoo bottle (empty)', 'бутылка из-под шампуня (пустая)', 'şampuan şişesi (boş)', 'пляшка з-під шампуню (порожня)',
    'Boş plastik qablaşdırma — sarı kisəyə.', 'Leere Kunststoffverpackung – Gelber Sack.', 'Empty plastic packaging — yellow bag.', 'Пустая пластиковая упаковка — жёлтый мешок.', 'Boş plastik ambalaj — sarı torba.', 'Порожня пластикова упаковка — жовтий мішок.'],
  ['kronkorken', 'gelb', 0, '', 'der Kronkorken', 'butulka qapağı (metal)', 'bottle cap (crown cork)', 'кронен-пробка', 'gazoz kapağı', 'кришка від пляшки (кронен-корок)',
    'Metal qapaqlar sarı kisəyə gedir.', 'Verschlüsse aus Metall gehören in den Gelben Sack.', 'Metal closures go into the yellow bag.', 'Металлические крышки — в жёлтый мешок.', 'Metal kapaklar sarı torbaya.', 'Металеві кришки — у жовтий мішок.'],
  ['plastikfolie', 'gelb', 0, '', 'die Plastikfolie (z. B. von der Gurke)', 'plastik örtük (məs. xiyardan)', 'plastic film (e.g. from a cucumber)', 'пластиковая плёнка (например, с огурца)', 'plastik streç (ör. salatalıktan)', 'пластикова плівка (напр. з огірка)',
    'Plastik qablaşdırma folqası — sarı kisəyə.', 'Verpackungsfolie aus Kunststoff – Gelber Sack.', 'Plastic packaging film — yellow bag.', 'Пластиковая упаковочная плёнка — жёлтый мешок.', 'Plastik ambalaj filmi — sarı torba.', 'Пластикова пакувальна плівка — жовтий мішок.'],
  ['spraydose', 'gelb', 1, '', 'die Spraydose (vollständig leer)', 'sprey balonu (tam boş)', 'aerosol can (completely empty)', 'аэрозольный баллон (полностью пустой)', 'sprey kutusu (tamamen boş)', 'аерозольний балон (повністю порожній)',
    'Tam boş metal qablaşdırma — sarı kisəyə. İçində qalıq varsa — zərərli tullantı (Schadstoffmobil).', 'Restlos leer ist es Metallverpackung – Gelber Sack. Mit Resten: Schadstoffsammlung.', 'Completely empty it is metal packaging — yellow bag. With contents left: hazardous waste collection.', 'Полностью пустой — металлическая упаковка, в жёлтый мешок. С остатками — сбор вредных отходов.', 'Tamamen boşsa metal ambalaj — sarı torba. İçinde kalıntı varsa: zararlı atık toplama.', 'Повністю порожній — металева упаковка, у жовтий мішок. Із залишками — збір шкідливих відходів.'],
  ['zahnpastatube', 'gelb', 0, '', 'die Zahnpastatube (leer)', 'diş pastası tübü (boş)', 'toothpaste tube (empty)', 'тюбик из-под зубной пасты (пустой)', 'diş macunu tüpü (boş)', 'тюбик з-під зубної пасти (порожній)',
    'Plastik/metal qablaşdırma — sarı kisəyə.', 'Verpackung aus Kunststoff oder Metall – Gelber Sack.', 'Plastic or metal packaging — yellow bag.', 'Упаковка из пластика или металла — жёлтый мешок.', 'Plastik veya metal ambalaj — sarı torba.', 'Упаковка з пластику або металу — жовтий мішок.'],
  // ── Papier ──
  ['zeitung', 'papier', 0, '', 'die Zeitung', 'qəzet', 'newspaper', 'газета', 'gazete', 'газета',
    'Təmiz kağız — göy qaba.', 'Sauberes Papier – blaue Tonne.', 'Clean paper — blue bin.', 'Чистая бумага — синий бак.', 'Temiz kâğıt — mavi kutu.', 'Чистий папір — синій бак.'],
  ['versandkarton', 'papier', 0, '', 'der Versandkarton', 'göndəriş qutusu (karton)', 'shipping box', 'картонная коробка от посылки', 'kargo kolisi', 'картонна коробка від посилки',
    'Karton göy qaba; yapışqan lenti mümkünsə çıxarın və qutunu düzləşdirin.', 'Pappe in die blaue Tonne; Klebeband möglichst ab, Karton flach falten.', 'Cardboard goes into the blue bin; remove tape if you can and fold it flat.', 'Картон — в синий бак; по возможности снимите скотч и сложите коробку.', 'Karton mavi kutuya; mümkünse bandı çıkarın ve düzleştirin.', 'Картон — у синій бак; по змозі зніміть скотч і складіть коробку.'],
  ['eierkarton', 'papier', 1, '', 'der Eierkarton (Pappe)', 'yumurta qabı (karton)', 'egg box (cardboard)', 'картонная упаковка для яиц', 'yumurta kolisi (karton)', 'картонна упаковка для яєць',
    'Preslənmiş kağızdır — göy qaba (bioya yox). Plastik yumurta qabı isə sarı kisəyə.', 'Aus gepresstem Altpapier – blaue Tonne (nicht Bio). Eierschachteln aus Kunststoff: Gelber Sack.', 'Made of moulded paper — blue bin (not organic). Plastic egg boxes: yellow bag.', 'Из прессованной бумаги — синий бак (не био). Пластиковые — в жёлтый мешок.', 'Preslenmiş kâğıttan — mavi kutu (organik değil). Plastik olanlar sarı torbaya.', 'З пресованого паперу — синій бак (не біо). Пластикові — у жовтий мішок.'],
  ['pizzakarton-sauber', 'papier', 1, '', 'der Pizzakarton (sauber, leer)', 'pitsa qutusu (təmiz, boş)', 'pizza box (clean, empty)', 'коробка от пиццы (чистая, пустая)', 'pizza kutusu (temiz, boş)', 'коробка від піци (чиста, порожня)',
    'Bir-iki kiçik yağ ləkəsi ilə — kağıza. Pendir və sous qalıqları çoxdursa — qalıq tullantı. Qayda icmaya görə dəyişə bilər.', 'Mit höchstens ein, zwei Fettflecken ins Altpapier; mit Käse- und Soßenresten in den Restmüll. Je nach Kommune.', 'With at most a grease spot or two it goes to paper; with cheese and sauce residue to general waste. Depends on the municipality.', 'С одним-двумя жирными пятнами — в бумагу; с остатками сыра и соуса — в остаточный мусор. Зависит от общины.', 'Bir iki yağ lekesiyle kâğıda; peynir ve sos kalıntısı varsa evsel atığa. Belediyeye göre değişir.', 'З однією-двома жирними плямами — у папір; із залишками сиру й соусу — у залишкове сміття. Залежить від громади.'],
  ['papiertuete', 'papier', 0, '', 'die Papiertüte', 'kağız paket', 'paper bag', 'бумажный пакет', 'kâğıt poşet', 'паперовий пакет',
    'Təmiz kağız — göy qaba.', 'Sauberes Papier – blaue Tonne.', 'Clean paper — blue bin.', 'Чистая бумага — синий бак.', 'Temiz kâğıt — mavi kutu.', 'Чистий папір — синій бак.'],
  ['briefumschlag', 'papier', 1, '', 'der Briefumschlag mit Sichtfenster', 'pəncərəli zərf', 'envelope with a window', 'конверт с окошком', 'pencereli zarf', 'конверт із віконцем',
    'Kiçik plastik pəncərə ilə birlikdə kağıza atıla bilər — kağız fabriki onu ayırır.', 'Darf samt Sichtfenster ins Altpapier – die Papierfabrik trennt das Fenster ab.', 'Can go into paper with its window — the paper mill separates it.', 'Можно выбросить в бумагу вместе с окошком — фабрика его отделит.', 'Penceresiyle birlikte kâğıda atılabilir — kâğıt fabrikası ayırır.', 'Можна викинути в папір разом із віконцем — фабрика його відокремить.'],
  ['schulheft', 'papier', 0, '', 'das alte Schulheft', 'köhnə dəftər', 'old exercise book', 'старая тетрадь', 'eski defter', 'старий зошит',
    'Kağız — göy qaba (plastik üzlüyü çıxarın).', 'Papier – blaue Tonne (Kunststoffumschlag abnehmen).', 'Paper — blue bin (remove any plastic cover).', 'Бумага — синий бак (снимите пластиковую обложку).', 'Kâğıt — mavi kutu (plastik kabı çıkarın).', 'Папір — синій бак (зніміть пластикову обкладинку).'],
  // ── Bio ──
  ['bananenschale', 'bio', 0, '', 'die Bananenschale', 'banan qabığı', 'banana peel', 'банановая кожура', 'muz kabuğu', 'бананова шкірка',
    'Meyvə qalığı — bio qaba.', 'Obstreste – Biotonne.', 'Fruit scraps — organic bin.', 'Остатки фруктов — био.', 'Meyve artığı — organik kutu.', 'Залишки фруктів — біо.'],
  ['kaffeesatz', 'bio', 1, '', 'der Kaffeesatz mit Papierfilter', 'kağız filtrlə qəhvə çöküntüsü', 'coffee grounds with paper filter', 'кофейная гуща с бумажным фильтром', 'kâğıt filtreli kahve telvesi', 'кавова гуща з паперовим фільтром',
    'Filtr kağızı ilə birlikdə bio qaba. Kapsullar isə yox: plastik/alüminium — sarı kisə.', 'Samt Papierfilter in die Biotonne. Kapseln nicht: Kunststoff/Alu – Gelber Sack.', 'Into the organic bin together with the paper filter. Not capsules: plastic/aluminium — yellow bag.', 'Вместе с бумажным фильтром — в био. Капсулы — нет: пластик/алюминий — жёлтый мешок.', 'Kâğıt filtresiyle birlikte organik kutuya. Kapsüller değil: plastik/alüminyum — sarı torba.', 'Разом із паперовим фільтром — у біо. Капсули — ні: пластик/алюміній — жовтий мішок.'],
  ['teebeutel', 'bio', 0, '', 'der Teebeutel', 'çay paketi', 'tea bag', 'чайный пакетик', 'poşet çay', 'чайний пакетик',
    'Bio qaba; metal sıxac və plastik etiket varsa, çıxarın.', 'Biotonne; Metallklammer und Etikett möglichst entfernen.', 'Organic bin; remove the metal staple and tag if there is one.', 'В био; металлическую скобку и ярлык лучше снять.', 'Organik kutu; metal zımba ve etiketi çıkarın.', 'У біо; металеву скобу й ярлик краще зняти.'],
  ['eierschalen', 'bio', 0, '', 'die Eierschalen', 'yumurta qabığı', 'eggshells', 'яичная скорлупа', 'yumurta kabuğu', 'яєчна шкаралупа',
    'Mətbəx tullantısı — bio qaba.', 'Küchenabfall – Biotonne.', 'Kitchen waste — organic bin.', 'Кухонные отходы — био.', 'Mutfak atığı — organik kutu.', 'Кухонні відходи — біо.'],
  ['essensreste', 'bio', 1, '', 'die Essensreste mit Fleisch', 'ətli yemək qalıqları', 'food leftovers with meat', 'остатки еды с мясом', 'etli yemek artıkları', 'залишки їжі з м’ясом',
    'Əksər icmalarda bişmiş yemək, ət və balıq da bio qaba gedir (qəzetə bükün). Bəzi yerlərdə qalıq tullantı.', 'In den meisten Kommunen dürfen auch gekochte Reste, Fleisch und Fisch in die Biotonne (in Zeitungspapier). Teils Restmüll.', 'In most municipalities cooked leftovers, meat and fish are allowed in the organic bin (wrapped in newspaper). Some say general waste.', 'В большинстве общин варёные остатки, мясо и рыбу можно в био (завернуть в газету). Кое-где — остаточный мусор.', 'Çoğu belediyede pişmiş artıklar, et ve balık da organik kutuya (gazeteye sarın). Bazı yerlerde evsel atık.', 'У більшості громад варені залишки, м’ясо й рибу можна в біо (загорнути в газету). Подекуди — залишкове сміття.'],
  ['apfelrest', 'bio', 0, '', 'das Kerngehäuse vom Apfel', 'alma özəyi', 'apple core', 'огрызок яблока', 'elma koçanı', 'недоїдок яблука',
    'Meyvə qalığı — bio qaba.', 'Obstreste – Biotonne.', 'Fruit scraps — organic bin.', 'Остатки фруктов — био.', 'Meyve artığı — organik kutu.', 'Залишки фруктів — біо.'],
  ['schnittblumen', 'bio', 0, '', 'die verwelkten Schnittblumen', 'solmuş gül-çiçək', 'wilted cut flowers', 'увядшие срезанные цветы', 'solmuş kesme çiçekler', 'зів’ялі зрізані квіти',
    'Bitki tullantısı — bio qaba (lent və folqasız).', 'Pflanzenabfall – Biotonne (ohne Band und Folie).', 'Plant waste — organic bin (without ribbon and wrapping).', 'Растительные отходы — био (без ленты и плёнки).', 'Bitki atığı — organik kutu (kurdele ve ambalajsız).', 'Рослинні відходи — біо (без стрічки й плівки).'],
  ['kartoffelschalen', 'bio', 0, '', 'die Kartoffelschalen', 'kartof qabığı', 'potato peelings', 'картофельные очистки', 'patates kabuğu', 'картопляне лушпиння',
    'Tərəvəz qalığı — bio qaba.', 'Gemüsereste – Biotonne.', 'Vegetable scraps — organic bin.', 'Овощные очистки — био.', 'Sebze artığı — organik kutu.', 'Овочеві очистки — біо.'],
  // ── Restmüll ──
  ['kassenbon', 'rest', 1, '', 'der Kassenbon (Thermopapier)', 'kassa çeki (termokağız)', 'till receipt (thermal paper)', 'кассовый чек (термобумага)', 'kasa fişi (termal kâğıt)', 'касовий чек (термопапір)',
    'Termokağızda kimyəvi maddələr var — Umweltbundesamt qalıq tullantını tövsiyə edir, kağızı yox.', 'Thermopapier enthält Farbentwickler – das Umweltbundesamt empfiehlt den Restmüll, nicht das Altpapier.', 'Thermal paper contains colour developers — the Federal Environment Agency recommends general waste, not paper.', 'Термобумага содержит химикаты — Федеральное ведомство по охране среды советует остаточный мусор, не бумагу.', 'Termal kâğıt kimyasal içerir — Federal Çevre Ajansı kâğıt yerine evsel atığı öneriyor.', 'Термопапір містить хімікати — Федеральне відомство з довкілля радить залишкове сміття, не папір.'],
  ['pizzakarton-fettig', 'rest', 1, '', 'der Pizzakarton (stark fettig, mit Käseresten)', 'pitsa qutusu (çox yağlı, pendir qalıqlı)', 'pizza box (very greasy, cheese stuck on)', 'коробка от пиццы (очень жирная, с сыром)', 'pizza kutusu (çok yağlı, peynirli)', 'коробка від піци (дуже жирна, із сиром)',
    'Yağ və qida qalıqları kağızın təkrar emalını pozur — qalıq tullantı. Təmiz hissəni kəsib kağıza ata bilərsiniz.', 'Fett und Essensreste stören das Papierrecycling – Restmüll. Saubere Teile abreißen und ins Altpapier.', 'Grease and food residue spoil paper recycling — general waste. Tear off clean parts for the paper bin.', 'Жир и остатки еды мешают переработке бумаги — остаточный мусор. Чистые части можно оторвать в бумагу.', 'Yağ ve yemek kalıntısı kâğıt geri dönüşümünü bozar — evsel atık. Temiz kısımları koparıp kâğıda atın.', 'Жир і залишки їжі заважають переробці паперу — залишкове сміття. Чисті частини можна відірвати в папір.'],
  ['trinkglas', 'rest', 1, '', 'das kaputte Trinkglas', 'sınıq içki stəkanı', 'broken drinking glass', 'разбитый стакан', 'kırık su bardağı', 'розбита склянка',
    'Stəkan şüşəsi başqa temperaturda əriyir — şüşə konteynerinə yox, qalıq tullantıya.', 'Trinkgläser schmelzen anders als Verpackungsglas – nicht ins Altglas, sondern Restmüll.', 'Drinking glasses melt differently from packaging glass — not the glass bank but general waste.', 'Стаканы плавятся иначе, чем тарное стекло — не в контейнер для стекла, а в остаточный мусор.', 'Bardak camı ambalaj camından farklı erir — cam kumbarasına değil, evsel atığa.', 'Склянки плавляться інакше, ніж тарне скло — не в контейнер для скла, а в залишкове сміття.'],
  ['spiegel', 'rest', 1, '', 'der kleine Spiegel / die Fensterscheibe', 'kiçik güzgü / pəncərə şüşəsi', 'small mirror / window pane', 'небольшое зеркало / оконное стекло', 'küçük ayna / pencere camı', 'невелике дзеркало / віконне скло',
    'Qablaşdırma şüşəsi deyil — kiçik parçalar qalıq tullantıya, böyükləri Wertstoffhof-a.', 'Kein Verpackungsglas – kleine Stücke Restmüll, große Scheiben zum Wertstoffhof.', 'Not packaging glass — small pieces general waste, large panes to the recycling centre.', 'Не тарное стекло — мелкие куски в остаточный мусор, большие — в Wertstoffhof.', 'Ambalaj camı değil — küçük parçalar evsel atığa, büyükler geri dönüşüm merkezine.', 'Не тарне скло — дрібні шматки в залишкове сміття, великі — у Wertstoffhof.'],
  ['porzellan', 'rest', 1, '', 'der kaputte Porzellanteller', 'sınıq çini boşqab', 'broken porcelain plate', 'разбитая фарфоровая тарелка', 'kırık porselen tabak', 'розбита порцелянова тарілка',
    'Keramika və çini şüşə deyil — qalıq tullantı. Şüşə konteynerində ciddi problem yaradır.', 'Keramik und Porzellan sind kein Glas – Restmüll. Im Altglas stören schon kleine Scherben.', 'Ceramics and porcelain are not glass — general waste. Even small shards ruin glass recycling.', 'Керамика и фарфор — не стекло, в остаточный мусор. Даже мелкие осколки портят переработку стекла.', 'Seramik ve porselen cam değildir — evsel atık. Küçük parçalar bile cam geri dönüşümünü bozar.', 'Кераміка й порцеляна — не скло, у залишкове сміття. Навіть дрібні уламки псують переробку скла.'],
  ['taschentuch', 'rest', 1, '', 'das benutzte Taschentuch', 'istifadə olunmuş salfet', 'used tissue', 'использованный бумажный платок', 'kullanılmış mendil', 'використана паперова хустинка',
    'Kağız salfet yaş halda dağılmır və gigiyenik səbəbdən kağıza getmir — qalıq tullantı.', 'Taschentücher sind nassfest und hygienisch bedenklich – nicht ins Altpapier, sondern Restmüll.', 'Tissues are wet-strength and unhygienic — not paper but general waste.', 'Платки влагостойкие и негигиеничны — не в бумагу, а в остаточный мусор.', 'Mendiller ıslakta dağılmaz ve hijyenik değildir — kâğıda değil evsel atığa.', 'Хустинки вологостійкі та негігієнічні — не в папір, а в залишкове сміття.'],
  ['windel', 'rest', 0, '', 'die Windel', 'uşaq bezi', 'nappy / diaper', 'подгузник', 'çocuk bezi', 'підгузок',
    'Gigiyena məhsulu — qalıq tullantı.', 'Hygieneartikel – Restmüll.', 'Hygiene product — general waste.', 'Средство гигиены — остаточный мусор.', 'Hijyen ürünü — evsel atık.', 'Засіб гігієни — залишкове сміття.'],
  ['katzenstreu', 'rest', 1, '', 'das benutzte Katzenstreu', 'istifadə olunmuş pişik qumu', 'used cat litter', 'использованный кошачий наполнитель', 'kullanılmış kedi kumu', 'використаний котячий наповнювач',
    '"Bio" yazsa da, nəcis səbəbindən qalıq tullantıya; tualetə atmayın.', 'Auch „Bio“-Streu gehört wegen der Ausscheidungen in den Restmüll – nie in die Toilette.', 'Even "bio" litter goes to general waste because of the excrement — never down the toilet.', 'Даже «био»-наполнитель из-за экскрементов — в остаточный мусор, никогда в унитаз.', '"Bio" kum bile dışkı nedeniyle evsel atığa — asla tuvalete değil.', 'Навіть «біо»-наповнювач через екскременти — у залишкове сміття, ніколи в унітаз.'],
  ['staubsaugerbeutel', 'rest', 0, '', 'der volle Staubsaugerbeutel', 'dolu tozsoran torbası', 'full vacuum cleaner bag', 'полный мешок пылесоса', 'dolu süpürge torbası', 'повний мішок пилососа',
    'Qarışıq toz — qalıq tullantı.', 'Gemischter Staub – Restmüll.', 'Mixed dust — general waste.', 'Смешанная пыль — остаточный мусор.', 'Karışık toz — evsel atık.', 'Змішаний пил — залишкове сміття.'],
  ['gluehbirne', 'rest', 1, '', 'die alte Glühbirne', 'köhnə közərmə lampası', 'old incandescent light bulb', 'старая лампа накаливания', 'eski akkor ampul', 'стара лампа розжарювання',
    'Adi közərmə lampası qalıq tullantıya. Enerjiqənaətedən və LED lampalar isə toplama məntəqəsinə!', 'Klassische Glühbirnen in den Restmüll. Energiespar- und LED-Lampen dagegen zur Sammelstelle!', 'Classic incandescent bulbs go to general waste. Energy-saving and LED lamps go to a collection point!', 'Обычная лампа накаливания — в остаточный мусор. Энергосберегающие и LED — в пункт сбора!', 'Klasik akkor ampul evsel atığa. Tasarruflu ve LED lambalar toplama noktasına!', 'Звичайна лампа розжарювання — у залишкове сміття. Енергоощадні та LED — у пункт збору!'],
  ['zigarette', 'rest', 0, '', 'die Zigarettenkippe', 'siqaret kötüyü', 'cigarette butt', 'окурок', 'sigara izmariti', 'недопалок',
    'Söndürülmüş halda qalıq tullantıya — küçəyə atmaq cərimə ilə nəticələnə bilər.', 'Ausgedrückt in den Restmüll – auf die Straße werfen kann ein Bußgeld kosten.', 'Put out, into general waste — dropping it on the street can cost a fine.', 'Потушенным — в остаточный мусор; бросать на улицу — штраф.', 'Söndürülmüş olarak evsel atığa — sokağa atmanın cezası olabilir.', 'Загашеним — у залишкове сміття; кидати на вулицю — штраф.'],
  ['medikamente', 'rest', 1, '', 'die abgelaufenen Tabletten', 'vaxtı keçmiş dərmanlar', 'expired tablets', 'просроченные таблетки', 'süresi geçmiş ilaçlar', 'прострочені таблетки',
    'Əksər icmalarda qalıq tullantıya (yandırılır); bəzi aptek və Wertstoffhof-lar da qəbul edir. Heç vaxt tualetə və ya lavaboya!', 'In den meisten Kommunen in den Restmüll (wird verbrannt); manche Apotheken und Wertstoffhöfe nehmen sie an. Nie in Toilette oder Spüle!', 'In most municipalities into general waste (it is incinerated); some pharmacies and recycling centres take them. Never down the toilet or sink!', 'В большинстве общин — в остаточный мусор (сжигается); некоторые аптеки и Wertstoffhof принимают. Никогда в унитаз или раковину!', 'Çoğu belediyede evsel atığa (yakılır); bazı eczane ve merkezler kabul eder. Asla tuvalete ya da lavaboya değil!', 'У більшості громад — у залишкове сміття (спалюється); деякі аптеки й Wertstoffhof приймають. Ніколи в унітаз чи раковину!'],
  ['plastikspielzeug', 'rest', 1, '', 'das kaputte Plastikspielzeug', 'sınıq plastik oyuncaq', 'broken plastic toy', 'сломанная пластиковая игрушка', 'kırık plastik oyuncak', 'зламана пластикова іграшка',
    'Plastikdir, amma qablaşdırma deyil — sarı kisəyə yox, qalıq tullantıya (böyükdürsə Wertstoffhof). Batareyalıdırsa — elektronika.', 'Kunststoff, aber keine Verpackung – nicht Gelber Sack, sondern Restmüll (groß: Wertstoffhof). Mit Batterie: Elektroschrott.', 'Plastic, but not packaging — not the yellow bag but general waste (large: recycling centre). With a battery: e-waste.', 'Пластик, но не упаковка — не в жёлтый мешок, а в остаточный мусор (крупное — Wertstoffhof). С батарейкой — электролом.', 'Plastik ama ambalaj değil — sarı torbaya değil evsel atığa (büyükse merkez). Pilliyse elektronik atık.', 'Пластик, але не упаковка — не в жовтий мішок, а в залишкове сміття (велике — Wertstoffhof). З батарейкою — електролом.'],
  ['zahnbuerste', 'rest', 1, '', 'die alte Zahnbürste', 'köhnə diş fırçası', 'old toothbrush', 'старая зубная щётка', 'eski diş fırçası', 'стара зубна щітка',
    'Plastik məmulat, qablaşdırma deyil — qalıq tullantı. Elektrik fırça — elektronika.', 'Kunststoffprodukt, keine Verpackung – Restmüll. Elektrische Zahnbürste: Elektroschrott.', 'A plastic product, not packaging — general waste. Electric toothbrush: e-waste.', 'Пластиковое изделие, не упаковка — остаточный мусор. Электрическая — электролом.', 'Plastik ürün, ambalaj değil — evsel atık. Elektrikli fırça: elektronik atık.', 'Пластиковий виріб, не упаковка — залишкове сміття. Електрична — електролом.'],
  ['backpapier', 'rest', 1, '', 'das benutzte Backpapier', 'istifadə olunmuş çörəkbişirmə kağızı', 'used baking paper', 'использованная пекарская бумага', 'kullanılmış pişirme kâğıdı', 'використаний пергамент для випікання',
    'Silikon örtüklüdür — kağıza da, bioya da yox, qalıq tullantıya.', 'Silikonbeschichtet – weder Altpapier noch Bio, sondern Restmüll.', 'Silicone-coated — neither paper nor organic, but general waste.', 'С силиконовым покрытием — ни в бумагу, ни в био, а в остаточный мусор.', 'Silikon kaplı — ne kâğıt ne organik, evsel atık.', 'Із силіконовим покриттям — ні в папір, ні в біо, а в залишкове сміття.'],
  ['kugelschreiber', 'rest', 0, '', 'der leere Kugelschreiber', 'boş diyircəkli qələm', 'empty ballpoint pen', 'пустая шариковая ручка', 'biten tükenmez kalem', 'порожня кулькова ручка',
    'Qablaşdırma deyil — qalıq tullantı.', 'Keine Verpackung – Restmüll.', 'Not packaging — general waste.', 'Не упаковка — остаточный мусор.', 'Ambalaj değil — evsel atık.', 'Не упаковка — залишкове сміття.'],
  // ── Altglas ──
  ['weinflasche', 'glas', 0, 'gruen', 'die grüne Weinflasche', 'yaşıl şərab butulkası', 'green wine bottle', 'зелёная винная бутылка', 'yeşil şarap şişesi', 'зелена винна пляшка',
    'Pfand yoxdur — şüşə konteynerinin YAŞIL hissəsinə. Qapağı sarı kisəyə.', 'Ohne Pfand – Altglas GRÜN. Verschluss in den Gelben Sack.', 'No deposit — glass bank, GREEN. Cap into the yellow bag.', 'Без пфанда — контейнер для стекла, ЗЕЛЁНЫЙ. Крышку — в жёлтый мешок.', 'Depozitosuz — cam kumbarası, YEŞİL. Kapak sarı torbaya.', 'Без пфанду — контейнер для скла, ЗЕЛЕНИЙ. Кришку — у жовтий мішок.'],
  ['marmeladenglas', 'glas', 0, 'weiss', 'das leere Marmeladenglas', 'boş mürəbbə bankası', 'empty jam jar', 'пустая банка из-под варенья', 'boş reçel kavanozu', 'порожня банка з-під варення',
    'Rəngsiz şüşə — AĞ hissəyə. Metal qapaq sarı kisəyə; yumağa ehtiyac yoxdur, boş olsun.', 'Farbloses Glas – Altglas WEISS. Metalldeckel in den Gelben Sack; leer reicht, nicht spülen.', 'Clear glass — glass bank, WHITE. Metal lid into the yellow bag; empty is enough, no need to rinse.', 'Бесцветное стекло — БЕЛЫЙ контейнер. Металлическую крышку — в жёлтый мешок; мыть не нужно.', 'Renksiz cam — BEYAZ bölme. Metal kapak sarı torbaya; boş olması yeterli.', 'Безбарвне скло — БІЛИЙ контейнер. Металеву кришку — у жовтий мішок; мити не потрібно.'],
  ['hustensaftflasche', 'glas', 0, 'braun', 'die braune Hustensaftflasche (leer)', 'qəhvəyi öskürək şərbəti şüşəsi (boş)', 'brown cough syrup bottle (empty)', 'коричневая бутылочка от сиропа (пустая)', 'kahverengi şurup şişesi (boş)', 'коричнева пляшечка від сиропу (порожня)',
    'Qəhvəyi qablaşdırma şüşəsi — QƏHVƏYİ hissəyə.', 'Braunes Verpackungsglas – Altglas BRAUN.', 'Brown packaging glass — glass bank, BROWN.', 'Коричневое тарное стекло — КОРИЧНЕВЫЙ контейнер.', 'Kahverengi ambalaj camı — KAHVERENGİ bölme.', 'Коричневе тарне скло — КОРИЧНЕВИЙ контейнер.'],
  ['blaue-flasche', 'glas', 1, 'gruen', 'die blaue Glasflasche (ohne Pfand)', 'göy şüşə butulka (pfandsız)', 'blue glass bottle (no deposit)', 'синяя стеклянная бутылка (без пфанда)', 'mavi cam şişe (depozitosuz)', 'синя скляна пляшка (без пфанду)',
    'Göy, qırmızı və digər rəngli şüşələr YAŞIL hissəyə gedir — yaşıl şüşə rəng qarışığına ən dözümlüdür.', 'Blaues, rotes und anderes Buntglas gehört zu GRÜN – Grünglas verträgt Fremdfarben am besten.', 'Blue, red and other coloured glass goes to GREEN — green glass tolerates other colours best.', 'Синее, красное и другое цветное стекло — в ЗЕЛЁНЫЙ: зелёное стекло лучше всего переносит примеси цвета.', 'Mavi, kırmızı ve diğer renkli camlar YEŞİL bölmeye — yeşil cam diğer renklere en dayanıklısıdır.', 'Синє, червоне та інше кольорове скло — у ЗЕЛЕНИЙ: зелене скло найкраще переносить домішки кольору.'],
  ['olivenoelflasche', 'glas', 0, 'gruen', 'die leere Olivenölflasche (grün)', 'boş zeytun yağı şüşəsi (yaşıl)', 'empty olive oil bottle (green)', 'пустая бутылка из-под оливкового масла (зелёная)', 'boş zeytinyağı şişesi (yeşil)', 'порожня пляшка з-під оливкової олії (зелена)',
    'Qablaşdırma şüşəsi — YAŞIL hissəyə; damcı qalığı problem deyil.', 'Verpackungsglas – Altglas GRÜN; ein Rest Öl am Rand stört nicht.', 'Packaging glass — glass bank, GREEN; a little oil left is fine.', 'Тарное стекло — ЗЕЛЁНЫЙ контейнер; немного масла на стенках не мешает.', 'Ambalaj camı — YEŞİL bölme; biraz yağ kalıntısı sorun değil.', 'Тарне скло — ЗЕЛЕНИЙ контейнер; трохи олії на стінках не заважає.'],
  ['babyglas', 'glas', 0, 'weiss', 'das Babykostgläschen', 'uşaq qidası bankası', 'baby food jar', 'баночка детского питания', 'mama kavanozu', 'баночка дитячого харчування',
    'Rəngsiz şüşə — AĞ hissəyə, qapaq sarı kisəyə.', 'Farbloses Glas – Altglas WEISS, Deckel in den Gelben Sack.', 'Clear glass — glass bank, WHITE; lid into the yellow bag.', 'Бесцветное стекло — БЕЛЫЙ контейнер, крышка — в жёлтый мешок.', 'Renksiz cam — BEYAZ bölme, kapak sarı torbaya.', 'Безбарвне скло — БІЛИЙ контейнер, кришка — у жовтий мішок.'],
  // ── Pfand ──
  ['pet-einweg', 'pfand', 0, '', 'die Einweg-Plastikflasche mit Pfandlogo', 'Pfand nişanlı birdəfəlik plastik butulka', 'single-use plastic bottle with deposit logo', 'одноразовая пластиковая бутылка со знаком пфанда', 'depozito logolu tek kullanımlık pet şişe', 'одноразова пластикова пляшка зі знаком пфанду',
    '25 sent Pfand — mağazadakı avtomata qaytarın. Ezməyin: avtomat loqonu oxumalıdır.', '25 Cent Pfand – zurück zum Automaten im Laden. Nicht zerdrücken: Der Automat muss das Logo lesen.', '25 cents deposit — back to the machine in the shop. Do not crush it: the machine must read the logo.', 'Пфанд 25 центов — верните в автомат в магазине. Не сминайте: автомат должен считать логотип.', '25 sent depozito — marketteki makineye iade. Ezmeyin: makine logoyu okumalı.', 'Пфанд 25 центів — поверніть в автомат у магазині. Не мніть: автомат має зчитати логотип.'],
  ['getraenkedose', 'pfand', 0, '', 'die Getränkedose', 'içki bankası', 'drinks can', 'банка из-под напитка', 'içecek kutusu', 'бляшанка з-під напою',
    'Bütün içki bankalarında 25 sent Pfand var — mağazaya qaytarın.', 'Auf allen Getränkedosen sind 25 Cent Pfand – zurück in den Laden.', 'All drinks cans carry a 25-cent deposit — return them to the shop.', 'На всех банках из-под напитков пфанд 25 центов — верните в магазин.', 'Tüm içecek kutularında 25 sent depozito var — markete iade edin.', 'На всіх бляшанках із-під напоїв пфанд 25 центів — поверніть у магазин.'],
  ['bierflasche-mehrweg', 'pfand', 0, '', 'die Mehrweg-Bierflasche', 'çoxdəfəlik pivə şüşəsi', 'returnable beer bottle', 'многоразовая пивная бутылка', 'depozitolu bira şişesi', 'багаторазова пивна пляшка',
    'Çoxdəfəlik şüşə: adətən 8 sent Pfand — şüşə konteynerinə yox, mağazaya!', 'Mehrwegflasche: meist 8 Cent Pfand – nicht ins Altglas, sondern zurück in den Laden!', 'Returnable bottle: usually 8 cents deposit — not the glass bank, back to the shop!', 'Многоразовая бутылка: обычно 8 центов пфанда — не в контейнер для стекла, а в магазин!', 'Depozitolu şişe: genelde 8 sent — cam kumbarasına değil markete!', 'Багаторазова пляшка: зазвичай 8 центів пфанду — не в контейнер для скла, а в магазин!'],
  ['milchflasche-einweg', 'pfand', 1, '', 'die Einweg-Plastikflasche mit Milchgetränk', 'birdəfəlik plastik süd içkisi butulkası', 'single-use plastic bottle of a milk drink', 'одноразовая пластиковая бутылка с молочным напитком', 'tek kullanımlık plastik süt içeceği şişesi', 'одноразова пластикова пляшка з молочним напоєм',
    '2024-cü ildən plastik butulkada süd içkilərinə də 25 sent Pfand var. Süd kartonu isə Pfandsızdır — sarı kisə.', 'Seit 2024 gilt das Pfand von 25 Cent auch für Milchgetränke in Einweg-Plastikflaschen. Milchkartons bleiben pfandfrei – Gelber Sack.', 'Since 2024 the 25-cent deposit also applies to milk drinks in single-use plastic bottles. Milk cartons still have none — yellow bag.', 'С 2024 года пфанд 25 центов действует и для молочных напитков в одноразовых пластиковых бутылках. Пакеты молока — без пфанда, жёлтый мешок.', '2024’ten beri plastik şişedeki süt içeceklerinde de 25 sent depozito var. Süt kartonları depozitosuz — sarı torba.', 'З 2024 року пфанд 25 центів діє й для молочних напоїв в одноразових пластикових пляшках. Пакети молока — без пфанду, жовтий мішок.'],
  ['wasserflasche-glas', 'pfand', 0, '', 'die Mehrweg-Wasserflasche aus Glas', 'çoxdəfəlik şüşə su butulkası', 'returnable glass water bottle', 'многоразовая стеклянная бутылка для воды', 'depozitolu cam su şişesi', 'багаторазова скляна пляшка для води',
    'Adətən 15 sent Pfand — qutusu ilə birlikdə mağazaya qaytarın.', 'Meist 15 Cent Pfand – samt Kasten zurück in den Laden.', 'Usually 15 cents deposit — return it to the shop, crate included.', 'Обычно 15 центов пфанда — верните в магазин вместе с ящиком.', 'Genelde 15 sent depozito — kasasıyla birlikte markete iade.', 'Зазвичай 15 центів пфанду — поверніть у магазин разом з ящиком.'],
  // ── Wertstoffhof & Sammelstellen ──
  ['batterien', 'sonder', 1, '', 'die alten Batterien', 'köhnə batareyalar', 'used batteries', 'старые батарейки', 'eski piller', 'старі батарейки',
    'Heç vaxt məişət tullantısına! Batareya satan hər mağazada pulsuz toplama qutusu var (və ya Wertstoffhof). Kontaktları lentlə örtün.', 'Nie in den Hausmüll! Jeder Laden, der Batterien verkauft, nimmt sie kostenlos zurück (Sammelbox) – oder Wertstoffhof. Pole abkleben.', 'Never in household waste! Every shop selling batteries takes them back for free (collection box) — or the recycling centre. Tape the terminals.', 'Никогда в бытовой мусор! Любой магазин, продающий батарейки, бесплатно принимает их (бокс) — или Wertstoffhof. Заклейте контакты.', 'Asla ev çöpüne değil! Pil satan her mağaza ücretsiz geri alır (toplama kutusu) — ya da geri dönüşüm merkezi. Kutupları bantlayın.', 'Ніколи в побутове сміття! Кожен магазин, що продає батарейки, безкоштовно приймає їх (бокс) — або Wertstoffhof. Заклейте контакти.'],
  ['handy', 'sonder', 0, '', 'das alte Handy', 'köhnə mobil telefon', 'old mobile phone', 'старый мобильный телефон', 'eski cep telefonu', 'старий мобільний телефон',
    'Elektronika: Wertstoffhof və ya böyük elektronika/qida mağazalarında pulsuz qəbul. Əvvəlcə məlumatları silin.', 'Elektroschrott: Wertstoffhof oder kostenlose Rücknahme im Handel. Vorher Daten löschen.', 'E-waste: recycling centre or free take-back in shops. Delete your data first.', 'Электролом: Wertstoffhof или бесплатный приём в магазинах. Сначала удалите данные.', 'Elektronik atık: geri dönüşüm merkezi veya mağazalarda ücretsiz iade. Önce verileri silin.', 'Електролом: Wertstoffhof або безкоштовний прийом у магазинах. Спершу видаліть дані.'],
  ['led-lampe', 'sonder', 1, '', 'die Energiespar- oder LED-Lampe', 'enerjiqənaətedən və ya LED lampa', 'energy-saving or LED lamp', 'энергосберегающая или LED-лампа', 'tasarruflu veya LED lamba', 'енергоощадна або LED-лампа',
    'Elektronikadır (enerjiqənaətedəndə civə var) — toplama məntəqəsi və ya mağaza. Adi közərmə lampası isə qalıq tullantı.', 'Elektroschrott (Energiesparlampen enthalten Quecksilber) – Sammelstelle oder Handel. Nur die alte Glühbirne darf in den Restmüll.', 'E-waste (energy-saving lamps contain mercury) — collection point or shop. Only old incandescent bulbs go to general waste.', 'Электролом (в энергосберегающих есть ртуть) — пункт сбора или магазин. Только обычная лампа накаливания — в остаточный мусор.', 'Elektronik atık (tasarruflu lambalarda cıva var) — toplama noktası veya mağaza. Sadece eski akkor ampul evsel atığa.', 'Електролом (в енергоощадних є ртуть) — пункт збору або магазин. Лише звичайна лампа розжарювання — у залишкове сміття.'],
  ['farbreste', 'sonder', 0, '', 'die Lackreste in der Dose', 'qutuda lak/boya qalığı', 'leftover paint in the tin', 'остатки лака в банке', 'kutuda boya artığı', 'залишки лаку в банці',
    'Zərərli tullantı — Wertstoffhof və ya Schadstoffmobil. Tam qurumuş dispersiya boyası bəzi yerlərdə qalıq tullantı ola bilər.', 'Schadstoff – Wertstoffhof oder Schadstoffmobil. Völlig eingetrocknete Dispersionsfarbe darf vielerorts in den Restmüll.', 'Hazardous — recycling centre or mobile hazardous-waste collection. Fully dried emulsion paint may go to general waste in many places.', 'Вредные отходы — Wertstoffhof или Schadstoffmobil. Полностью засохшую водоэмульсионку во многих местах можно в остаточный мусор.', 'Zararlı atık — geri dönüşüm merkezi ya da Schadstoffmobil. Tamamen kurumuş su bazlı boya birçok yerde evsel atığa.', 'Шкідливі відходи — Wertstoffhof або Schadstoffmobil. Повністю висохлу водоемульсійку подекуди можна в залишкове сміття.'],
  ['altkleider', 'sonder', 1, '', 'die gut erhaltene alte Kleidung', 'yaxşı vəziyyətdə köhnə paltar', 'old clothes in good condition', 'старая одежда в хорошем состоянии', 'iyi durumda eski giysiler', 'старий одяг у доброму стані',
    'Qalıq tullantıya yox: köhnə paltar konteyneri (Altkleidercontainer), xeyriyyə və ya Wertstoffhof. Paketə qoyub bağlayın.', 'Nicht in den Restmüll: Altkleidercontainer, Kleiderkammer oder Wertstoffhof. In einen zugebundenen Beutel.', 'Not general waste: clothing container (Altkleidercontainer), charity or recycling centre. Put them in a tied bag.', 'Не в остаточный мусор: контейнер для одежды (Altkleidercontainer), благотворительность или Wertstoffhof. В завязанном пакете.', 'Evsel atığa değil: giysi konteyneri, hayır kurumu ya da geri dönüşüm merkezi. Bağlı bir poşette.', 'Не в залишкове сміття: контейнер для одягу (Altkleidercontainer), благодійність або Wertstoffhof. У зав’язаному пакеті.'],
  ['cd', 'sonder', 1, '', 'die alte CD / DVD', 'köhnə CD / DVD', 'old CD / DVD', 'старый CD / DVD', 'eski CD / DVD', 'старий CD / DVD',
    'Polikarbonatdır, qablaşdırma deyil — Wertstoffhof və ya xüsusi CD toplama qutuları; yoxdursa qalıq tullantı.', 'Polycarbonat, keine Verpackung – Wertstoffhof oder CD-Sammelbox; notfalls Restmüll.', 'Polycarbonate, not packaging — recycling centre or a CD collection box; otherwise general waste.', 'Поликарбонат, не упаковка — Wertstoffhof или бокс для CD; если нет — остаточный мусор.', 'Polikarbonat, ambalaj değil — geri dönüşüm merkezi veya CD kutusu; yoksa evsel atık.', 'Полікарбонат, не упаковка — Wertstoffhof або бокс для CD; якщо немає — залишкове сміття.'],
  ['frittierfett', 'sonder', 1, '', 'das alte Frittieröl (größere Menge)', 'köhnə qızartma yağı (çox miqdar)', 'used frying oil (larger amount)', 'старое фритюрное масло (большое количество)', 'kullanılmış kızartma yağı (büyük miktar)', 'стара олія для фритюру (велика кількість)',
    'Lavaboya tökməyin! Çox miqdar Wertstoffhof-a; az miqdar bağlı qabda qalıq tullantıya.', 'Nie in den Ausguss! Größere Mengen zum Wertstoffhof, kleine Mengen verschlossen in den Restmüll.', 'Never down the sink! Larger amounts to the recycling centre, small amounts sealed into general waste.', 'Никогда в раковину! Большое количество — в Wertstoffhof, немного — в закрытой таре в остаточный мусор.', 'Asla lavaboya değil! Büyük miktar geri dönüşüm merkezine, az miktar kapalı kapta evsel atığa.', 'Ніколи в раковину! Велику кількість — у Wertstoffhof, трохи — у закритій тарі в залишкове сміття.'],
  ['druckerpatrone', 'sonder', 0, '', 'die leere Druckerpatrone', 'boş printer kartrici', 'empty printer cartridge', 'пустой картридж для принтера', 'boş yazıcı kartuşu', 'порожній картридж для принтера',
    'Mağazalarda və Wertstoffhof-da toplama qutuları var.', 'Sammelboxen im Handel oder am Wertstoffhof.', 'Collection boxes in shops or at the recycling centre.', 'Боксы для сбора в магазинах или на Wertstoffhof.', 'Mağazalarda veya geri dönüşüm merkezinde toplama kutuları var.', 'Бокси для збору в магазинах або на Wertstoffhof.'],
  ['akku-powerbank', 'sonder', 1, '', 'die Powerbank (Lithium-Akku)', 'pauerbank (litium akkumulyator)', 'power bank (lithium battery)', 'пауэрбанк (литиевый аккумулятор)', 'powerbank (lityum pil)', 'павербанк (літієвий акумулятор)',
    'Litium akkumulyatoru zibil maşınında yanğına səbəb ola bilər — yalnız batareya toplama qutusuna və ya Wertstoffhof-a.', 'Lithium-Akkus können im Müllwagen Brände auslösen – nur zur Batteriesammlung oder zum Wertstoffhof.', 'Lithium batteries can start fires in bin lorries — battery collection or recycling centre only.', 'Литиевые аккумуляторы могут вызвать пожар в мусоровозе — только в пункт сбора батареек или Wertstoffhof.', 'Lityum piller çöp kamyonunda yangın çıkarabilir — yalnızca pil toplama veya geri dönüşüm merkezi.', 'Літієві акумулятори можуть спричинити пожежу в сміттєвозі — лише в пункт збору батарейок або Wertstoffhof.'],
  ['milchkarton', 'gelb', 1, '', 'der Milchkarton', 'süd kartonu', 'milk carton', 'пакет из-под молока', 'süt kartonu', 'пакет з-під молока',
    'Kompozit qablaşdırma, Pfand yoxdur — sarı kisəyə (kağıza yox).', 'Verbundverpackung ohne Pfand – Gelber Sack (nicht Altpapier).', 'Composite packaging with no deposit — yellow bag (not paper).', 'Комбинированная упаковка без пфанда — жёлтый мешок (не бумага).', 'Depozitosuz kompozit ambalaj — sarı torba (kâğıt değil).', 'Комбінована упаковка без пфанду — жовтий мішок (не папір).'],
];

export const WASTE_ITEMS: WasteItem[] = ROWS.map(([id, bin, tricky, glass, de, az, en, ru, tr, uk, wAz, wDe, wEn, wRu, wTr, wUk]) => ({
  id,
  bin,
  tricky: tricky === 1,
  ...(glass ? { glass } : {}),
  name: { az, de, en, ru, tr, uk },
  why: { az: wAz, de: wDe, en: wEn, ru: wRu, tr: wTr, uk: wUk },
}));

export const wasteItem = (id: string) => WASTE_ITEMS.find((i) => i.id === id);
