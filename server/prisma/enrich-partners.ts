/**
 * Adds sector, map location, description and "featured" flag to the existing partner rows.
 * Idempotent: matches rows by name and overwrites only these fields (website only when it is empty).
 *
 *   cd server && npx tsx prisma/enrich-partners.ts
 *
 * Descriptions use public, well-known facts about each company plus the kind of roles Triad Vision
 * recruits for there. They deliberately contain no per-partner placement numbers.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type L = { az: string; de: string; en: string; ru: string };
type Sector = 'logistics' | 'courier' | 'industry' | 'construction' | 'hospitality' | 'healthcare' | 'agriculture' | 'other';

const partners: { name: string; sector: Sector; city: string | null; featured: boolean; website?: string; description: L }[] = [
  {
    name: 'DB Schenker',
    sector: 'logistics',
    city: 'Essen',
    featured: true,
    website: 'https://www.dbschenker.com',
    description: {
      az: 'DB Schenker — mərkəzi Essendə yerləşən, quru, hava və dəniz daşımaları üzrə dünyanın ən böyük logistika şirkətlərindən biridir. Triad Vision şirkət üçün anbar işçiləri və CE kateqoriyalı sürücülərin seçimində dəstək göstərir.',
      de: 'DB Schenker ist einer der weltweit größten Logistikdienstleister für Land-, Luft- und Seefracht mit Sitz in Essen. Triad Vision unterstützt bei der Gewinnung von Lagerpersonal und Berufskraftfahrern (CE).',
      en: 'DB Schenker is one of the world’s largest providers of land, air and ocean logistics, headquartered in Essen. Triad Vision supports the recruitment of warehouse staff and professional CE drivers.',
      ru: 'DB Schenker — один из крупнейших в мире логистических операторов наземных, авиа- и морских перевозок со штаб-квартирой в Эссене. Triad Vision помогает в подборе складского персонала и водителей категории CE.',
    },
  },
  {
    name: 'DHL',
    sector: 'courier',
    city: 'Bonn',
    featured: true,
    website: 'https://www.dhl.de',
    description: {
      az: 'DHL — Bonnda yerləşən DHL Group-un poçt, bağlama və ekspress çatdırılma brendidir. Triad Vision kuryer sürücüləri və bağlama çeşidləmə mərkəzləri üçün işçilərin seçimində dəstək verir.',
      de: 'DHL ist die Paket-, Post- und Expressmarke der DHL Group mit Sitz in Bonn. Triad Vision unterstützt bei der Besetzung von Zustellfahrern und Personal für Paketzentren.',
      en: 'DHL is the parcel, mail and express brand of DHL Group, headquartered in Bonn. Triad Vision supports the recruitment of delivery drivers and staff for parcel sorting centres.',
      ru: 'DHL — бренд почтовой, посылочной и экспресс-доставки DHL Group со штаб-квартирой в Бонне. Triad Vision помогает в подборе водителей-курьеров и персонала сортировочных центров.',
    },
  },
  {
    name: 'DACHSER',
    sector: 'logistics',
    city: 'Kempten',
    featured: true,
    website: 'https://www.dachser.de',
    description: {
      az: 'DACHSER — Kemptendə (Allgäu) yerləşən, yığma yük və müqavilə logistikası üzrə ailə şirkətidir. Triad Vision anbar və yükləmə işçiləri, eləcə də CE sürücülərinin seçimində dəstək göstərir.',
      de: 'DACHSER ist ein familiengeführter Logistikdienstleister für Stückgut und Kontraktlogistik mit Sitz in Kempten (Allgäu). Triad Vision unterstützt bei der Besetzung von Lager- und Umschlagpersonal sowie CE-Fahrern.',
      en: 'DACHSER is a family-owned logistics provider for groupage and contract logistics, headquartered in Kempten (Allgäu). Triad Vision supports the recruitment of warehouse and cross-dock staff as well as CE drivers.',
      ru: 'DACHSER — семейная логистическая компания, специализирующаяся на сборных грузах и контрактной логистике, со штаб-квартирой в Кемптене (Альгой). Triad Vision помогает в подборе складского персонала и водителей категории CE.',
    },
  },
  {
    name: 'Raben',
    sector: 'logistics',
    city: 'Mannheim',
    featured: false,
    website: 'https://www.raben-group.com',
    description: {
      az: 'Raben Group — Avropada yığma yük, anbar və müqavilə logistikası göstərən beynəlxalq logistika qrupudur; Almaniya fəaliyyəti Mannheimdən idarə olunur. Triad Vision sürücülər və anbar işçilərinin seçimində dəstək verir.',
      de: 'Die Raben Group ist ein europäischer Logistikdienstleister für Stückgut, Lager- und Kontraktlogistik; das Deutschlandgeschäft wird von Mannheim aus geführt. Triad Vision unterstützt bei der Gewinnung von Fahrern und Lagerpersonal.',
      en: 'Raben Group is a European provider of groupage, warehousing and contract logistics; its German business is run from Mannheim. Triad Vision supports the recruitment of drivers and warehouse staff.',
      ru: 'Raben Group — европейская логистическая группа (сборные грузы, складская и контрактная логистика); немецкое направление управляется из Мангейма. Triad Vision помогает в подборе водителей и складского персонала.',
    },
  },
  {
    name: 'Hermes',
    sector: 'courier',
    city: 'Hamburg',
    featured: false,
    website: 'https://www.myhermes.de',
    description: {
      az: 'Hermes — Hamburqda yerləşən, Almaniyanın ən böyük özəl bağlama çatdırılma şirkətlərindən biridir. Triad Vision kuryer sürücüləri və bağlama mərkəzləri üçün işçilərin seçimində dəstək verir.',
      de: 'Hermes ist einer der größten privaten Paketdienstleister Deutschlands mit Sitz in Hamburg. Triad Vision unterstützt bei der Besetzung von Zustellfahrern und Personal für Paketzentren.',
      en: 'Hermes is one of Germany’s largest private parcel carriers, headquartered in Hamburg. Triad Vision supports the recruitment of delivery drivers and parcel-centre staff.',
      ru: 'Hermes — одна из крупнейших частных служб доставки посылок в Германии со штаб-квартирой в Гамбурге. Triad Vision помогает в подборе водителей-курьеров и персонала посылочных центров.',
    },
  },
  {
    name: 'DSV',
    sector: 'logistics',
    city: 'Langenhagen',
    featured: false,
    website: 'https://www.dsv.com',
    description: {
      az: 'DSV — Danimarka mənşəli qlobal nəqliyyat və logistika şirkətidir; Almaniyada əsas mərkəzlərindən biri Langenhagendədir (Hannover yaxınlığı). Triad Vision sürücülər və anbar işçilərinin seçimində dəstək göstərir.',
      de: 'DSV ist ein global tätiger Transport- und Logistikkonzern dänischen Ursprungs; ein zentraler deutscher Standort ist Langenhagen bei Hannover. Triad Vision unterstützt bei der Gewinnung von Fahrern und Lagerpersonal.',
      en: 'DSV is a global transport and logistics group of Danish origin; one of its main German sites is in Langenhagen near Hanover. Triad Vision supports the recruitment of drivers and warehouse staff.',
      ru: 'DSV — глобальная транспортно-логистическая группа датского происхождения; один из ключевых немецких офисов находится в Лангенхагене под Ганновером. Triad Vision помогает в подборе водителей и складского персонала.',
    },
  },
  {
    name: 'Kühne+Nagel',
    sector: 'logistics',
    city: 'Hamburg',
    featured: true,
    website: 'https://www.kuehne-nagel.com',
    description: {
      az: 'Kühne+Nagel — dünyanın aparıcı dəniz, hava və quru logistikası şirkətlərindən biridir; Almaniya mərkəzi Hamburqdadır. Triad Vision anbar və müqavilə logistikası işçiləri, eləcə də sürücülərin seçimində dəstək verir.',
      de: 'Kühne+Nagel zählt zu den weltweit führenden Logistikunternehmen für See-, Luft- und Landverkehre; die deutsche Zentrale befindet sich in Hamburg. Triad Vision unterstützt bei der Besetzung von Lager- und Kontraktlogistik-Personal sowie Fahrern.',
      en: 'Kühne+Nagel is one of the world’s leading sea, air and overland logistics companies; its German head office is in Hamburg. Triad Vision supports the recruitment of warehouse and contract-logistics staff as well as drivers.',
      ru: 'Kühne+Nagel — одна из ведущих мировых компаний морской, авиа- и наземной логистики; немецкий головной офис находится в Гамбурге. Triad Vision помогает в подборе складского персонала, сотрудников контрактной логистики и водителей.',
    },
  },
  {
    name: 'Nagel-Group',
    sector: 'logistics',
    city: 'Versmold',
    featured: false,
    website: 'https://www.nagel-group.com',
    description: {
      az: 'Nagel-Group — mərkəzi Versmoldda yerləşən, qida məhsulları logistikası (soyuducu daşımalar daxil) üzrə ixtisaslaşmış şirkətdir. Triad Vision soyuducu yük maşınları üçün CE sürücüləri və anbar işçilərinin seçimində dəstək verir.',
      de: 'Die Nagel-Group ist ein auf Lebensmittellogistik spezialisiertes Unternehmen – inklusive temperaturgeführter Transporte – mit Sitz in Versmold. Triad Vision unterstützt bei der Gewinnung von CE-Fahrern für Kühltransporte und Lagerpersonal.',
      en: 'Nagel-Group is a food-logistics specialist, including temperature-controlled transport, headquartered in Versmold. Triad Vision supports the recruitment of CE drivers for refrigerated transport and warehouse staff.',
      ru: 'Nagel-Group — компания, специализирующаяся на логистике продуктов питания, включая перевозки с температурным режимом, со штаб-квартирой в Ферсмольде. Triad Vision помогает в подборе водителей CE для рефрижераторных перевозок и складского персонала.',
    },
  },
  {
    name: 'GEFCO',
    sector: 'logistics',
    city: 'Mörfelden-Walldorf',
    featured: false,
    description: {
      az: 'GEFCO — avtomobil və sənaye təchizat zəncirləri üzrə ixtisaslaşmış beynəlxalq logistika qrupudur, hazırda CEVA Logistics-in tərkibindədir; Almaniya fəaliyyəti Mörfelden-Valldorfda (Frankfurt yaxınlığı) yerləşir. Triad Vision sürücülər və logistika işçilərinin seçimində dəstək verir.',
      de: 'GEFCO ist ein internationaler Logistikdienstleister für Automobil- und Industrielieferketten und gehört heute zu CEVA Logistics; der deutsche Standort liegt in Mörfelden-Walldorf bei Frankfurt. Triad Vision unterstützt bei der Gewinnung von Fahrern und Logistikpersonal.',
      en: 'GEFCO is an international logistics provider for automotive and industrial supply chains, today part of CEVA Logistics; its German operations are based in Mörfelden-Walldorf near Frankfurt. Triad Vision supports the recruitment of drivers and logistics staff.',
      ru: 'GEFCO — международный логистический оператор автомобильных и промышленных цепочек поставок, сегодня входит в CEVA Logistics; немецкое подразделение находится в Мёрфельден-Вальдорфе под Франкфуртом. Triad Vision помогает в подборе водителей и логистического персонала.',
    },
  },
  {
    name: 'MAN',
    sector: 'industry',
    city: 'München',
    featured: false,
    website: 'https://www.man.eu',
    description: {
      az: 'MAN — Münhendə yerləşən, yük maşınları, avtobuslar və nəqliyyat həlləri istehsal edən sənaye şirkətidir. Triad Vision istehsalat və texniki ixtisaslar üzrə işçilərin seçimində dəstək verir.',
      de: 'MAN ist ein Industrieunternehmen mit Sitz in München, das Lkw, Busse und Transportlösungen herstellt. Triad Vision unterstützt bei der Besetzung von Stellen in Produktion und Technik.',
      en: 'MAN is a Munich-based manufacturer of trucks, buses and transport solutions. Triad Vision supports the recruitment of production and technical staff.',
      ru: 'MAN — промышленная компания из Мюнхена, производящая грузовики, автобусы и транспортные решения. Triad Vision помогает в подборе производственного и технического персонала.',
    },
  },
  {
    name: 'Kaya Transport',
    sector: 'logistics',
    city: null,
    featured: false,
    description: {
      az: 'Kaya Transport — nəqliyyat şirkəti və Triad Vision-un tərəfdaşıdır.',
      de: 'Kaya Transport ist ein Transportunternehmen und Partner von Triad Vision.',
      en: 'Kaya Transport is a transport company and a partner of Triad Vision.',
      ru: 'Kaya Transport — транспортная компания и партнёр Triad Vision.',
    },
  },
  {
    name: 'Arin Transport',
    sector: 'logistics',
    city: null,
    featured: false,
    description: {
      az: 'Arin Transport — nəqliyyat şirkəti və Triad Vision-un tərəfdaşıdır.',
      de: 'Arin Transport ist ein Transportunternehmen und Partner von Triad Vision.',
      en: 'Arin Transport is a transport company and a partner of Triad Vision.',
      ru: 'Arin Transport — транспортная компания и партнёр Triad Vision.',
    },
  },
];

async function main() {
  let updated = 0;
  const missing: string[] = [];
  for (const p of partners) {
    const rows = await prisma.partner.findMany({ where: { name: p.name } });
    if (rows.length === 0) {
      missing.push(p.name);
      continue;
    }
    for (const row of rows) {
      await prisma.partner.update({
        where: { id: row.id },
        data: {
          sector: p.sector,
          city: p.city,
          description: p.description,
          featured: p.featured,
          ...(p.website && !row.website ? { website: p.website } : {}),
        },
      });
      updated++;
    }
  }
  console.log(`Partners updated: ${updated}`);
  if (missing.length) console.log(`Not found (skipped): ${missing.join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
