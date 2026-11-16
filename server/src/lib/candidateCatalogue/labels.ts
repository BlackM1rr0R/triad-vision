/** Names of the canonical professions (lib/matching.ts PROFESSION_KEYS) in the six site languages, German first. */
export type L6 = { de: string; en: string; az: string; ru: string; tr: string; uk: string };

export const PROFESSION_LABELS: Record<string, L6> = {
  truck_driver: { de: 'Berufskraftfahrer/in (LKW)', en: 'Truck driver', az: 'Yük maşını sürücüsü', ru: 'Водитель грузовика', tr: 'Tır şoförü', uk: 'Водій вантажівки' },
  bus_driver: { de: 'Busfahrer/in', en: 'Bus driver', az: 'Avtobus sürücüsü', ru: 'Водитель автобуса', tr: 'Otobüs şoförü', uk: 'Водій автобуса' },
  courier: { de: 'Kurier-/Zustellfahrer/in', en: 'Courier / delivery driver', az: 'Kuryer', ru: 'Курьер', tr: 'Kurye', uk: "Кур'єр" },
  nurse: { de: 'Pflegefachkraft', en: 'Nurse', az: 'Tibb bacısı / qardaşı', ru: 'Медсестра / медбрат', tr: 'Hemşire', uk: 'Медсестра / медбрат' },
  cook: { de: 'Koch/Köchin', en: 'Cook / chef', az: 'Aşpaz', ru: 'Повар', tr: 'Aşçı', uk: 'Кухар' },
  waiter: { de: 'Servicekraft / Kellner/in', en: 'Waiter / waitress', az: 'Ofisiant', ru: 'Официант', tr: 'Garson', uk: 'Офіціант' },
  hotel: { de: 'Hotelfachkraft', en: 'Hotel staff', az: 'Otel işçisi', ru: 'Работник отеля', tr: 'Otel personeli', uk: 'Працівник готелю' },
  baker: { de: 'Bäcker/in', en: 'Baker', az: 'Çörəkçi', ru: 'Пекарь', tr: 'Fırıncı', uk: 'Пекар' },
  butcher: { de: 'Fleischer/in', en: 'Butcher', az: 'Qəssab', ru: 'Мясник', tr: 'Kasap', uk: "М'ясник" },
  welder: { de: 'Schweißer/in', en: 'Welder', az: 'Qaynaqçı', ru: 'Сварщик', tr: 'Kaynakçı', uk: 'Зварювальник' },
  construction_worker: { de: 'Bauarbeiter/in', en: 'Construction worker', az: 'Tikinti işçisi', ru: 'Строитель', tr: 'İnşaat işçisi', uk: 'Будівельник' },
  electrician: { de: 'Elektriker/in', en: 'Electrician', az: 'Elektrik', ru: 'Электрик', tr: 'Elektrikçi', uk: 'Електрик' },
  plumber: { de: 'Anlagenmechaniker/in SHK', en: 'Plumber / HVAC fitter', az: 'Santexnik', ru: 'Сантехник', tr: 'Tesisatçı', uk: 'Сантехнік' },
  mechanic: { de: 'Kfz-Mechatroniker/in', en: 'Mechanic', az: 'Avtomexanik', ru: 'Автомеханик', tr: 'Oto tamircisi', uk: 'Автомеханік' },
  carpenter: { de: 'Tischler/in / Zimmerer/in', en: 'Carpenter', az: 'Dülgər', ru: 'Плотник / столяр', tr: 'Marangoz', uk: 'Тесля / столяр' },
  painter: { de: 'Maler/in und Lackierer/in', en: 'Painter', az: 'Rəngsaz', ru: 'Маляр', tr: 'Boyacı', uk: 'Маляр' },
  warehouse: { de: 'Lagerlogistik', en: 'Warehouse worker', az: 'Anbar işçisi', ru: 'Работник склада', tr: 'Depo çalışanı', uk: 'Працівник складу' },
  it: { de: 'IT-Fachkraft', en: 'IT specialist', az: 'İT mütəxəssisi', ru: 'IT-специалист', tr: 'BT uzmanı', uk: 'IT-фахівець' },
  agriculture: { de: 'Landwirtschaft', en: 'Agriculture', az: 'Kənd təsərrüfatı', ru: 'Сельское хозяйство', tr: 'Tarım', uk: 'Сільське господарство' },
  cleaner: { de: 'Reinigungskraft', en: 'Cleaner', az: 'Təmizlikçi', ru: 'Уборщик', tr: 'Temizlik görevlisi', uk: 'Прибиральник' },
};

export const professionLabel = (key: string, lng: keyof L6 = 'de') => PROFESSION_LABELS[key]?.[lng] ?? PROFESSION_LABELS[key]?.de ?? key;
