import type { ProfessionGuide } from './index.js';

/**
 * Construction trades (Maurer, Zimmerer, Tischler, Anlagenmechaniker SHK, welders, Beton- und Stahlbetonbauer,
 * Maler und Lackierer, Fliesenleger). Facts checked 2026-11-16:
 *   - HwO Anlage A (gesetze-im-internet.de/hwo/anlage_a.html): Maurer und Betonbauer (1), Zimmerer (3), Maler und
 *     Lackierer (10), Metallbauer (13), Installateur und Heizungsbauer (24), Tischler (27), Fliesen-, Platten- und
 *     Mosaikleger (42, re-added 2020). Employment is not regulated; self-employment needs a Meister or equivalent.
 *   - Bauhauptgewerbe collective wages from 1 April 2026 (IG BAU / Handwerksblatt): Lohngruppe 3 (Facharbeiter)
 *     23.97 €/h incl. Bauzuschlag, east and west now equal; no sector minimum wage in the Bauhauptgewerbe since 2022.
 *   - Painters' minimum wage for journeymen 16.13 €/h from 1 July 2026 (DGB list of sector minimum wages).
 *   - Entgeltatlas (BA): Maurer/in median about 3,900 € gross per month (full time).
 *   - BA Engpassanalyse 2025 (data in client/src/lib/shortage/data.ts): SHK 2.5 and Metallbau 2.0 = shortage;
 *     Maurer 1.7, Zimmerei 1.8, Beton 1.5, welding (skilled level) 1.8 = "under observation".
 *   - § 19c (2) AufenthG with § 6 BeschV: 45 % of the pension contribution ceiling = 45,630 € in 2026.
 *   - § 1b AÜG: no temporary agency work in the Bauhauptgewerbe.
 */
export const bauGuide: ProfessionGuide = {
  key: 'anerkennung-bau',
  pages: {
    ru: {
      slug: 'stroitelnye-professii-v-germanii-priznanie',
      title: 'Строительные профессии в Германии 2026: признание',
      description:
        'Каменщик, плотник, сантехник SHK, сварщик, маляр, плиточник в Германии: признание в HWK, зарплаты по тарифу 2026, дефицит, язык, безопасность, виза.',
      body: `Стройка в Германии — один из самых понятных путей для рабочих из Азербайджана: жилья не хватает, старые дома утепляют и переводят на тепловые насосы, а опытных мастеров на объектах мало. Но немецкая стройка устроена иначе, чем в СНГ: у каждой специальности своя профессия с дуальным обучением, свои тарифы и строгие правила безопасности. Разбираем, как признают дипломы строителей, сколько платят в 2026 году, где самый большой дефицит и какая виза подходит.

> Ведомство для своей профессии можно найти в нашем [инструменте по признанию](/anerkennung). Общие правила — в гиде [признание диплома в Германии](guide:anerkennung).

## Какие строительные профессии есть в Германии

Каждой специальности соответствует немецкая профессия-эталон (*Referenzberuf*). От неё зависят ведомство и шансы на признание:

| Ваша специальность | Немецкий эталон | Обучение | Кто признаёт |
|---|---|---|---|
| Каменщик | Maurer/in | 3 года | Handwerkskammer (HWK) |
| Бетонщик, арматурщик | Beton- und Stahlbetonbauer/in | 3 года | обычно HWK |
| Плотник, кровельные конструкции | Zimmerer/Zimmerin | 3 года | HWK |
| Столяр | Tischler/in | 3 года | HWK |
| Сантехник, отопление, вентиляция | Anlagenmechaniker/in für Sanitär-, Heizungs- und Klimatechnik (SHK) | 3,5 года | HWK |
| Маляр, штукатур-отделочник | Maler/in und Lackierer/in | 3 года | HWK |
| Плиточник | Fliesen-, Platten- und Mosaikleger/in | 3 года | HWK |
| Сварщик | Metallbauer/in (ремесло) или Konstruktionsmechaniker/in (промышленность) | 3,5 года | HWK или IHK FOSA |

Каменщики, бетонщики, плотники и плиточники в Германии учатся по ступенчатой системе строительного обучения: сначала два года до рабочего-строителя, затем ещё год до полной профессии. Если работодатель относится к строительной промышленности, а не к ремеслу, ведомством может оказаться **IHK FOSA** — это покажет Anerkennungs-Finder.

## Нужно ли признание

Работа по найму в этих профессиях **не регулируется**: закон не требует признания, чтобы работать у работодателя. Все перечисленные ремёсла входят в приложение A к закону о ремёслах (HwO), но это важно только для **собственной фирмы** — для неё обычно нужен мастер (*Meister*) или равноценная квалификация.

Для визы ситуация другая: по **§ 18a AufenthG** нужна квалификация, признанная равноценной немецкой. Поэтому большинство строителей из-за пределов ЕС проходят процедуру признания. Сварщик — особый случай: «сварщик» в Германии не отдельная профессия обучения, поэтому признание идёт через Metallbauer или Konstruktionsmechaniker. Работодатели дополнительно смотрят на сертификаты сварщика по **DIN EN ISO 9606** — они помогают при найме, но не заменяют признание.

## Документы, сбор и сроки

Палата обычно запрашивает диплом колледжа или профлицея с приложением (предметы, часы теории и практики), справки работодателей с описанием работ, удостоверения и допуски, резюме и паспорт, переводы от **присяжного переводчика** и заверенные копии. Сбор, как правило, **100–600 €**, решение — в течение **3 месяцев** после полного пакета, в ускоренной процедуре § 81a — 2 месяца. Если документов не хватает, палата может предложить **анализ квалификации** — практическое задание, например кладку участка стены или монтаж узла отопления.

Результат бывает трёх видов: полная равноценность, частичная (с перечнем различий — их закрывают обучением на немецком предприятии) или отказ.

## Зарплаты на стройке в 2026 году

- **Основное строительство (Bauhauptgewerbe)** — каменщики, бетонщики, плотники, плиточники: с 1 апреля 2026 года тариф для квалифицированного рабочего (*Lohngruppe 3*) — **23,97 € в час** с учётом строительной надбавки, на востоке и западе теперь одинаково. При полной занятости это примерно **4 150 € брутто в месяц** — у работодателей, связанных тарифом. Отраслевого минимума в основном строительстве с 2022 года нет: ниже общего МРОТ (13,90 €) платить нельзя, но тариф действует не везде.
- **Маляры и лакировщики**: отраслевой минимум для подмастерья (*Geselle*) — **16,13 € в час** с 1 июля 2026 года.
- **SHK, столяры, металлисты**: региональные тарифы ремесла; в Северном Рейне — Вестфалии тариф SHK вырос на 2,95 % с марта 2026.
- **Ориентир по статистике**: медиана для каменщиков в Entgeltatlas агентства по труду — около **3 900 €** брутто в месяц.

Посчитать нетто можно в нашем [зарплатном калькуляторе](/salary-calculator). Важно: в основном строительстве **заёмный труд запрещён** (§ 1b AÜG) — вас должна нанять сама строительная фирма.

## Где самый большой дефицит

По анализу дефицита агентства по труду за 2025 год профессии **сантехники, отопления и климата (SHK)** и **металлостроения** официально дефицитные; каменщики, плотники, бетонщики и сварщики на уровне квалифицированного рабочего находятся «под наблюдением». Ещё острее дефицит в подземном и дорожном строительстве и у кровельщиков. Подробно по землям — в нашем [барометре дефицита](/shortage-barometer).

## Язык и безопасность на объекте

Для признания и визы § 18a немецкий по закону не нужен, для § 16d — обычно **A2**. На объекте же вы должны понимать инструктаж, предупреждения и указания бригадира, поэтому работодатели ждут **A2–B1**. Работодатель обязан проводить инструктаж по охране труда (*Unterweisung*) на понятном вам языке и бесплатно выдавать средства защиты: каску, защитную обувь, очки, страховку для работы на высоте. От несчастных случаев вы застрахованы в отраслевой кассе **BG BAU**, а отпускные в строительстве идут через кассу **SOKA-BAU**. Немецкие слова и знаки безопасности можно потренировать в нашей [интерактивной сцене «Стройплощадка»](/work-scenes/construction-site).

## Визовые пути для строителей

- **§ 18a — после признания.** Трудовой договор + признание; агентство по труду проверяет, что условия не хуже местных. Сбор за визу — 75 €, работодатель может запустить ускоренную процедуру § 81a (411 €). Подробнее — [рабочая виза в Германию](guide:work-visa).
- **§ 16d — признание в Германии.** При частичном признании — адаптационная квалификация; в **партнёрстве по признанию** вы сразу работаете у работодателя и проходите процедуру уже в Германии (нужны квалификация не менее 2 лет, A2 и договорённость с работодателем).
- **§ 19c (2) — путь через опыт.** Без немецкого признания: квалификация, признанная в Азербайджане (обучение не менее 2 лет), не менее 2 лет опыта за последние 5 лет и зарплата от **45 630 € в год** (2026) — или работодатель с коллективным договором. Тариф основного строительства этот порог обычно превышает.
- **Без диплома** — [Ausbildung в Германии](guide:ausbildung); электрики — смотрите отдельный гид [признание диплома электрика](guide:anerkennung-elektroniker).

## Как помогает Triad Vision

Мы подбираем правильную немецкую профессию-эталон и палату, проверяем и собираем документы, готовим заявление на признание (переводы вы оформляете сами), ищем строительную фирму и выстраиваем визовую стратегию. Заявление в посольство вы подаёте сами. [Запишитесь на консультацию](/booking).

## Официальные источники

- [Anerkennung in Deutschland — Anerkennungs-Finder](https://www.anerkennung-in-deutschland.de)
- [Закон о ремёслах, приложение A](https://www.gesetze-im-internet.de/hwo/anlage_a.html)
- [Entgeltatlas агентства по труду](https://web.arbeitsagentur.de/entgeltatlas/)
- [BG BAU](https://www.bgbau.de)`,
      faq: [
        { q: 'Нужно ли признание, чтобы работать каменщиком в Германии?', a: 'Для работы по найму закон признание не требует, но для визы по § 18a нужна признанная квалификация. Без признания возможен путь через опыт по § 19c (2) при зарплате от 45 630 € в год (2026) или у работодателя с коллективным договором.' },
        { q: 'Сколько зарабатывает строитель в Германии в 2026 году?', a: 'По тарифу основного строительства квалифицированный рабочий получает с апреля 2026 года 23,97 € в час, примерно 4 150 € брутто в месяц. Маляры-подмастерья — не меньше 16,13 € в час. Медиана для каменщиков в Entgeltatlas — около 3 900 €.' },
        { q: 'Кто признаёт дипломы строителей?', a: 'Для ремесленных профессий — ремесленная палата (HWK) по месту будущей работы, для промышленных (например, Konstruktionsmechaniker) — IHK FOSA в Нюрнберге. Точное ведомство показывает Anerkennungs-Finder.' },
        { q: 'Как признают сварщика?', a: 'Отдельной профессии «сварщик» в немецком обучении нет, поэтому эталоном служит Metallbauer/in или Konstruktionsmechaniker/in. Сертификаты по DIN EN ISO 9606 помогают при найме, но признание не заменяют.' },
        { q: 'Можно ли работать на стройке через агентство заёмного труда?', a: 'Нет. В основном строительстве заёмный труд запрещён (§ 1b AÜG): вас должна напрямую нанять строительная фирма.' },
      ],
    },
    az: {
      slug: 'almaniyada-tikinti-ixtisaslarinin-taninmasi',
      title: 'Almaniyada tikinti peşələri 2026: diplomun tanınması',
      description:
        'Almaniyada bənna, dülgər, santexnik (SHK), qaynaqçı, malyar və kafelçi: HWK-da tanınma, 2026 tarif maaşları, işçi qıtlığı, dil, təhlükəsizlik və viza.',
      body: `Tikinti azərbaycanlı işçilər üçün Almaniyaya ən aydın yollardan biridir: mənzil çatışmır, köhnə binalar istiləşdirilir və istilik nasoslarına keçirilir, obyektlərdə isə təcrübəli usta azdır. Lakin alman tikintisi MDB-dəkindən fərqli qurulub: hər ixtisasın dual təhsilli öz peşəsi, öz tarifləri və sərt təhlükəsizlik qaydaları var. Bu bələdçidə tikinti diplomlarının necə tanındığını, 2026-da nə qədər maaş verildiyini, ən böyük qıtlığın harada olduğunu və hansı vizanın uyğun gəldiyini izah edirik.

> Peşəniz üçün səlahiyyətli qurumu [tanınma alətimizdə](/anerkennung) tapa bilərsiniz. Ümumi qaydalar — [Almaniyada diplomun tanınması](guide:anerkennung) bələdçisində.

## Almaniyada hansı tikinti peşələri var

Hər ixtisasa bir alman nümunə peşəsi (*Referenzberuf*) uyğun gəlir. Qurum və tanınma şansı ondan asılıdır:

| Sizin ixtisasınız | Alman nümunəsi | Təhsil | Kim tanıyır |
|---|---|---|---|
| Bənna | Maurer/in | 3 il | Handwerkskammer (HWK) |
| Betonçu, armaturçu | Beton- und Stahlbetonbauer/in | 3 il | adətən HWK |
| Dülgər, dam konstruksiyaları | Zimmerer/Zimmerin | 3 il | HWK |
| Xarrat (mebel, qapı, pəncərə) | Tischler/in | 3 il | HWK |
| Santexnik, istilik, ventilyasiya | Anlagenmechaniker/in für Sanitär-, Heizungs- und Klimatechnik (SHK) | 3,5 il | HWK |
| Malyar, bəzək ustası | Maler/in und Lackierer/in | 3 il | HWK |
| Kafelçi | Fliesen-, Platten- und Mosaikleger/in | 3 il | HWK |
| Qaynaqçı | Metallbauer/in (sənətkarlıq) və ya Konstruktionsmechaniker/in (sənaye) | 3,5 il | HWK və ya IHK FOSA |

Almaniyada bənna, betonçu, dülgər və kafelçilər pilləli tikinti təhsili ilə oxuyur: əvvəlcə iki il tikinti işçisi səviyyəsinə qədər, sonra tam peşəyə qədər daha bir il. İşəgötürən sənətkarlıq deyil, tikinti sənayesi müəssisəsidirsə, qurum **IHK FOSA** ola bilər — bunu Anerkennungs-Finder göstərir.

## Tanınma lazımdırmı

Bu peşələrdə muzdlu iş **tənzimlənmir**: işəgötürənin yanında işləmək üçün qanun tanınma tələb etmir. Sadalanan bütün sənətlər sənətkarlıq qanununun (HwO) A əlavəsinə daxildir, amma bu yalnız **öz firmanız** üçün vacibdir — onun üçün adətən usta (*Meister*) və ya bərabər ixtisas lazımdır.

Viza üçün vəziyyət başqadır: **§ 18a AufenthG** üzrə alman ixtisasına bərabər tanınmış ixtisas lazımdır. Ona görə də Avropa İttifaqından kənardan gələn tikinti işçilərinin çoxu tanınma prosedurundan keçir. Qaynaqçı xüsusi haldır: Almaniyada “qaynaqçı” ayrıca təhsil peşəsi deyil, ona görə tanınma Metallbauer və ya Konstruktionsmechaniker vasitəsilə aparılır. İşəgötürənlər əlavə olaraq **DIN EN ISO 9606** üzrə qaynaqçı sertifikatlarına baxır — işə qəbulda kömək edir, amma tanınmanı əvəz etmir.

## Sənədlər, rüsum və müddət

Palata adətən kollec və ya peşə liseyi diplomunu əlavəsi ilə (fənlər, nəzəriyyə və praktika saatları), görülən işləri təsvir edən işəgötürən arayışlarını, vəsiqə və icazələri, CV və pasportu, **and içmiş tərcüməçinin** tərcümələrini və təsdiqli surətləri istəyir. Rüsum adətən **100–600 €**, qərar tam paketdən sonra **3 ay** ərzində, sürətləndirilmiş § 81a prosedurunda isə 2 ay ərzində verilir. Sənəd çatışmırsa, palata **ixtisas təhlili** (*Qualifikationsanalyse*) təklif edə bilər — məsələn, divar hissəsinin hörülməsi və ya istilik qovşağının quraşdırılması kimi praktik tapşırıq.

Nəticə üç cür olur: tam bərabərlik, qismən bərabərlik (fərqlər siyahısı ilə — onlar alman müəssisəsində təlimlə aradan qaldırılır) və ya imtina.

## 2026-da tikintidə maaşlar

- **Əsas tikinti (Bauhauptgewerbe)** — bənna, betonçu, dülgər, kafelçi: 1 aprel 2026-dan ixtisaslı işçi (*Lohngruppe 3*) üçün tarif tikinti əlavəsi ilə birlikdə **saatı 23,97 €**-dur, şərqdə və qərbdə artıq eynidir. Tam iş günündə bu, ayda təxminən **4 150 € brutto** edir — tarifə bağlı işəgötürənlərdə. Əsas tikintidə 2022-dən sahə minimumu yoxdur: ümumi minimum əmək haqqından (13,90 €) az ödəmək olmaz, amma tarif hər yerdə tətbiq olunmur.
- **Malyarlar**: kalfa (*Geselle*) üçün sahə minimumu 1 iyul 2026-dan **saatı 16,13 €**.
- **SHK, xarratlar, metal işçiləri**: sənətkarlığın regional tarifləri; Şimali Reyn-Vestfaliyada SHK tarifi 2026-nın martından 2,95 % artıb.
- **Statistik istiqamət**: Əmək Agentliyinin Entgeltatlas-ında bənnalar üçün median ayda təxminən **3 900 €** bruttodur.

Xalis maaşı [maaş kalkulyatorumuzda](/salary-calculator) hesablaya bilərsiniz. Vacib: əsas tikintidə **icarə işçi qüvvəsi qadağandır** (§ 1b AÜG) — sizi birbaşa tikinti firması işə götürməlidir.

## Ən böyük qıtlıq harada

Əmək Agentliyinin 2025-ci il qıtlıq təhlilinə görə **santexnika, istilik və iqlim (SHK)** və **metal konstruksiya** peşələri rəsmən qıtlıq peşələridir; ixtisaslı işçi səviyyəsində bənna, dülgər, betonçu və qaynaqçılar “müşahidə altındadır”. Yeraltı və yol tikintisində və dam ustalarında qıtlıq daha kəskindir. Ştatlar üzrə ətraflı — [qıtlıq barometrimizdə](/shortage-barometer).

## Obyektdə dil və təhlükəsizlik

Tanınma və § 18a vizası üçün qanunla alman dili tələb olunmur, § 16d üçün adətən **A2** lazımdır. Obyektdə isə təlimatı, xəbərdarlıqları və briqadirin göstərişlərini başa düşməlisiniz, ona görə işəgötürənlər **A2–B1** gözləyir. İşəgötürən əmək təhlükəsizliyi təlimatını (*Unterweisung*) başa düşdüyünüz dildə keçirməli və qoruyucu vasitələri — kaska, qoruyucu ayaqqabı, eynək, hündürlükdə iş üçün sığorta kəmərini — pulsuz verməlidir. Bədbəxt hadisələrdən sahə kassası **BG BAU**-da sığortalısınız, tikintidə məzuniyyət pulları isə **SOKA-BAU** kassası vasitəsilə ödənilir. Alman sözlərini və təhlükəsizlik nişanlarını [interaktiv “Tikinti meydançası” səhnəmizdə](/work-scenes/construction-site) məşq edə bilərsiniz.

## Tikinti işçiləri üçün viza yolları

- **§ 18a — tanınmadan sonra.** Əmək müqaviləsi + tanınma; Əmək Agentliyi şərtlərin yerli səviyyədən pis olmadığını yoxlayır. Viza rüsumu 75 €, işəgötürən sürətləndirilmiş § 81a prosedurunu (411 €) başlada bilər. Ətraflı — [Almaniyaya iş vizası](guide:work-visa).
- **§ 16d — tanınma Almaniyada.** Qismən tanınmada — uyğunlaşma təlimi; **tanınma tərəfdaşlığında** dərhal işəgötürənin yanında işləyir və proseduru Almaniyada keçirsiniz (ən azı 2 illik ixtisas, A2 və işəgötürənlə razılaşma lazımdır).
- **§ 19c (2) — təcrübə yolu.** Alman tanınması olmadan: Azərbaycanda dövlət tərəfindən tanınmış ixtisas (ən azı 2 illik təhsil), son 5 ildə ən azı 2 il təcrübə və ildə **45 630 €**-dan (2026) az olmayan maaş — və ya kollektiv müqaviləli işəgötürən. Əsas tikinti tarifi bu həddi adətən keçir.
- **Diplom yoxdursa** — [Almaniyada Ausbildung](guide:ausbildung); elektriklər üçün ayrıca bələdçi: [elektrik diplomunun tanınması](guide:anerkennung-elektroniker).

## Triad Vision necə kömək edir

Düzgün alman nümunə peşəsini və palatanı seçirik, sənədləri yoxlayıb toplayırıq, tanınma ərizəsini hazırlayırıq (tərcümələri özünüz edirsiniz), tikinti firması axtarırıq və viza strategiyasını qururuq. Səfirliyə müraciəti özünüz verirsiniz. [Konsultasiyaya yazılın](/booking).

## Rəsmi mənbələr

- [Anerkennung in Deutschland — Anerkennungs-Finder](https://www.anerkennung-in-deutschland.de)
- [Sənətkarlıq qanunu, A əlavəsi](https://www.gesetze-im-internet.de/hwo/anlage_a.html)
- [Əmək Agentliyinin Entgeltatlas-ı](https://web.arbeitsagentur.de/entgeltatlas/)
- [BG BAU](https://www.bgbau.de)`,
      faq: [
        { q: 'Almaniyada bənna işləmək üçün tanınma lazımdırmı?', a: 'Muzdlu iş üçün qanun tanınma tələb etmir, amma § 18a vizası üçün tanınmış ixtisas lazımdır. Tanınmasız ildə 45 630 € (2026) maaşla və ya kollektiv müqaviləli işəgötürənlə § 19c (2) üzrə təcrübə yolu mümkündür.' },
        { q: '2026-da Almaniyada tikinti işçisi nə qədər qazanır?', a: 'Əsas tikinti tarifinə görə ixtisaslı işçi 2026-nın aprelindən saatı 23,97 €, ayda təxminən 4 150 € brutto alır. Malyar kalfaları — saatı ən azı 16,13 €. Entgeltatlas-da bənnalar üçün median təxminən 3 900 €-dur.' },
        { q: 'Tikinti diplomlarını kim tanıyır?', a: 'Sənətkarlıq peşələri üçün gələcək iş yerindəki Sənətkarlıq Palatası (HWK), sənaye peşələri üçün (məsələn, Konstruktionsmechaniker) Nürnberqdəki IHK FOSA. Dəqiq qurumu Anerkennungs-Finder göstərir.' },
        { q: 'Qaynaqçı necə tanınır?', a: 'Alman təhsilində ayrıca “qaynaqçı” peşəsi yoxdur, ona görə nümunə Metallbauer/in və ya Konstruktionsmechaniker/in olur. DIN EN ISO 9606 sertifikatları işə qəbulda kömək edir, amma tanınmanı əvəz etmir.' },
        { q: 'Tikintidə icarə agentliyi vasitəsilə işləmək olarmı?', a: 'Xeyr. Əsas tikintidə icarə işçi qüvvəsi qadağandır (§ 1b AÜG): sizi birbaşa tikinti firması işə götürməlidir.' },
      ],
    },
    de: {
      slug: 'bauberufe-anerkennung-deutschland',
      title: 'Bauberufe aus dem Ausland 2026: Anerkennung & Visum',
      description:
        'Maurer, Zimmerer, Anlagenmechaniker SHK, Schweißer, Maler, Fliesenleger aus Aserbaidschan: Anerkennung bei der HWK, Tariflöhne 2026, Engpass, Visum.',
      body: `Der Bau ist für Fachkräfte aus Aserbaidschan einer der klarsten Wege nach Deutschland: Wohnungen fehlen, Altbauten werden gedämmt und auf Wärmepumpen umgestellt, und auf den Baustellen fehlen erfahrene Leute. Der deutsche Bau ist aber anders organisiert als in den GUS-Staaten: Jedes Gewerk hat einen eigenen dualen Ausbildungsberuf, eigene Tarife und strenge Arbeitsschutzregeln. Dieser Ratgeber zeigt, wie Abschlüsse im Bau anerkannt werden, was 2026 gezahlt wird, wo der Engpass am größten ist und welches Visum passt.

> Die zuständige Stelle für Ihren Beruf finden Sie mit unserem [Anerkennungs-Tool](/anerkennung). Die allgemeinen Regeln stehen im Ratgeber [Anerkennung in Deutschland](guide:anerkennung).

## Welche Bauberufe es in Deutschland gibt

Jeder Spezialisierung entspricht ein deutscher Referenzberuf. Von ihm hängen die zuständige Stelle und die Chancen auf Anerkennung ab:

| Ihre Tätigkeit | Deutscher Referenzberuf | Ausbildung | Zuständig |
|---|---|---|---|
| Maurer | Maurer/in | 3 Jahre | Handwerkskammer (HWK) |
| Betonbauer, Eisenflechter | Beton- und Stahlbetonbauer/in | 3 Jahre | meist HWK |
| Zimmermann, Dachkonstruktionen | Zimmerer/Zimmerin | 3 Jahre | HWK |
| Schreiner | Tischler/in | 3 Jahre | HWK |
| Sanitär, Heizung, Lüftung | Anlagenmechaniker/in für Sanitär-, Heizungs- und Klimatechnik (SHK) | 3,5 Jahre | HWK |
| Maler, Ausbau | Maler/in und Lackierer/in | 3 Jahre | HWK |
| Fliesenleger | Fliesen-, Platten- und Mosaikleger/in | 3 Jahre | HWK |
| Schweißer | Metallbauer/in (Handwerk) oder Konstruktionsmechaniker/in (Industrie) | 3,5 Jahre | HWK oder IHK FOSA |

Maurer, Beton- und Stahlbetonbauer, Zimmerer und Fliesenleger lernen in Deutschland in der Stufenausbildung Bau: zwei Jahre bis zum Hoch- oder Ausbaufacharbeiter, dann ein weiteres Jahr bis zum vollen Beruf. Gehört der Arbeitgeber zur Bauindustrie statt zum Handwerk, kann **IHK FOSA** zuständig sein — das zeigt der Anerkennungs-Finder.

## Brauche ich eine Anerkennung?

Die abhängige Beschäftigung in diesen Berufen ist **nicht reglementiert**: Für eine Anstellung verlangt das Gesetz keine Anerkennung. Alle genannten Gewerke stehen in Anlage A der Handwerksordnung (HwO) — das betrifft aber nur den **eigenen Betrieb**, für den in der Regel ein Meister oder eine gleichwertige Qualifikation nötig ist.

Für das Visum ist es anders: Nach **§ 18a AufenthG** braucht man eine als gleichwertig anerkannte Qualifikation. Deshalb durchlaufen die meisten Baufachkräfte aus Drittstaaten ein Anerkennungsverfahren. Schweißer sind ein Sonderfall: „Schweißer“ ist in Deutschland kein eigener Ausbildungsberuf, die Anerkennung läuft über Metallbauer oder Konstruktionsmechaniker. Arbeitgeber achten zusätzlich auf Schweißerprüfungen nach **DIN EN ISO 9606** — sie helfen bei der Einstellung, ersetzen aber keine Anerkennung.

## Unterlagen, Gebühr und Dauer

Die Kammer verlangt meist das Abschlusszeugnis des College oder der Berufsschule mit Fächer- und Stundenübersicht (Theorie und Praxis), Arbeitszeugnisse mit Tätigkeitsbeschreibung, Befähigungsnachweise, Lebenslauf und Pass, Übersetzungen von **öffentlich bestellten Übersetzern** und beglaubigte Kopien. Die Gebühr liegt meist bei **100–600 €**; entschieden wird innerhalb von **3 Monaten** nach vollständigen Unterlagen, im beschleunigten Fachkräfteverfahren nach § 81a binnen 2 Monaten. Fehlen Nachweise, kann die Kammer eine **Qualifikationsanalyse** anbieten — eine Arbeitsprobe, etwa ein Mauerwerksstück oder die Montage einer Heizungsgruppe.

Das Ergebnis: volle Gleichwertigkeit, teilweise Gleichwertigkeit (mit den wesentlichen Unterschieden, die durch eine Anpassungsqualifizierung im Betrieb ausgeglichen werden) oder Ablehnung.

## Löhne am Bau 2026

- **Bauhauptgewerbe** — Maurer, Betonbauer, Zimmerer, Fliesenleger: Seit dem 1. April 2026 beträgt der Tariflohn für Facharbeiter (*Lohngruppe 3*) **23,97 € pro Stunde** einschließlich Bauzuschlag, in Ost und West jetzt gleich. In Vollzeit sind das rund **4.150 € brutto im Monat** — bei tarifgebundenen Arbeitgebern. Einen Branchenmindestlohn gibt es im Bauhauptgewerbe seit 2022 nicht mehr: Unter dem gesetzlichen Mindestlohn (13,90 €) darf niemand zahlen, der Tarif gilt aber nicht überall.
- **Maler und Lackierer**: Branchenmindestlohn für Gesellen **16,13 € pro Stunde** ab 1. Juli 2026.
- **SHK, Tischler, Metallbau**: regionale Handwerkstarife; in Nordrhein-Westfalen stiegen die SHK-Löhne ab März 2026 um 2,95 %.
- **Statistischer Richtwert**: Der Median für Maurer im Entgeltatlas der Bundesagentur für Arbeit liegt bei rund **3.900 €** brutto im Monat.

Das Netto rechnet unser [Gehaltsrechner](/salary-calculator). Wichtig: Im Bauhauptgewerbe ist **Leiharbeit verboten** (§ 1b AÜG) — Sie müssen direkt bei der Baufirma angestellt sein.

## Wo der Engpass am größten ist

Nach der Engpassanalyse 2025 der Bundesagentur für Arbeit sind **Sanitär-, Heizungs- und Klimatechnik (SHK)** und **Metallbau** Engpassberufe; Maurer, Zimmerer, Beton- und Stahlbetonbauer und Schweißer stehen auf Fachkraftniveau „unter Beobachtung“. Noch knapper sind Tiefbau, Straßenbau und Dachdeckerei. Details nach Ländern zeigt unser [Engpass-Barometer](/shortage-barometer).

## Sprache und Arbeitsschutz auf der Baustelle

Für die Anerkennung und das Visum nach § 18a ist Deutsch gesetzlich nicht vorgeschrieben, für § 16d meist **A2**. Auf der Baustelle müssen Sie aber Unterweisung, Warnungen und Anweisungen des Poliers verstehen — Arbeitgeber erwarten deshalb **A2–B1**. Der Arbeitgeber muss die Unterweisung zum Arbeitsschutz in einer für Sie verständlichen Sprache durchführen und die persönliche Schutzausrüstung kostenlos stellen: Helm, Sicherheitsschuhe, Schutzbrille, Absturzsicherung. Gegen Arbeitsunfälle sind Sie über die **BG BAU** versichert, das Urlaubsgeld läuft am Bau über die **SOKA-BAU**. Deutsche Begriffe und Sicherheitszeichen üben Sie in unserer [interaktiven Szene „Baustelle“](/work-scenes/construction-site).

## Visumwege für Baufachkräfte

- **§ 18a — nach der Anerkennung.** Arbeitsvertrag + Anerkennung; die Bundesagentur für Arbeit prüft, dass die Bedingungen nicht schlechter sind als ortsüblich. Visumgebühr 75 €, der Arbeitgeber kann das beschleunigte Verfahren nach § 81a (411 €) beantragen. Mehr im Ratgeber [Arbeitsvisum für Deutschland](guide:work-visa).
- **§ 16d — Anerkennung in Deutschland.** Bei teilweiser Gleichwertigkeit eine Anpassungsqualifizierung; in der **Anerkennungspartnerschaft** arbeiten Sie sofort beim Arbeitgeber und holen die Anerkennung in Deutschland nach (Qualifikation mit mindestens 2 Jahren Ausbildung, A2 und Vereinbarung mit dem Arbeitgeber).
- **§ 19c Abs. 2 — Erfahrungsweg.** Ohne deutsche Anerkennung: in Aserbaidschan staatlich anerkannte Qualifikation (mindestens 2 Jahre Ausbildung), mindestens 2 Jahre Berufserfahrung in den letzten 5 Jahren und ein Gehalt ab **45.630 € im Jahr** (2026) — oder ein tarifgebundener Arbeitgeber. Der Bautarif liegt in der Regel darüber.
- **Ohne Abschluss** — [Ausbildung in Deutschland](guide:ausbildung); für Elektriker gibt es einen eigenen Ratgeber: [Anerkennung als Elektroniker](guide:anerkennung-elektroniker).

## Wie Triad Vision hilft

Wir finden den passenden Referenzberuf und die zuständige Kammer, prüfen und sammeln die Unterlagen, bereiten den Anerkennungsantrag vor (Übersetzungen besorgen Sie selbst), suchen die Baufirma und planen den Visumweg. Den Antrag bei der Botschaft stellen Sie selbst. [Beratungstermin buchen](/booking).

## Offizielle Quellen

- [Anerkennung in Deutschland — Anerkennungs-Finder](https://www.anerkennung-in-deutschland.de)
- [Handwerksordnung, Anlage A](https://www.gesetze-im-internet.de/hwo/anlage_a.html)
- [Entgeltatlas der Bundesagentur für Arbeit](https://web.arbeitsagentur.de/entgeltatlas/)
- [BG BAU](https://www.bgbau.de)`,
      faq: [
        { q: 'Brauche ich als Maurer eine Anerkennung, um in Deutschland zu arbeiten?', a: 'Für die Anstellung verlangt das Gesetz keine Anerkennung, für das Visum nach § 18a aber eine anerkannte Qualifikation. Ohne Anerkennung ist der Erfahrungsweg nach § 19c Abs. 2 möglich — mit einem Gehalt ab 45.630 € im Jahr (2026) oder bei einem tarifgebundenen Arbeitgeber.' },
        { q: 'Was verdient man am Bau 2026?', a: 'Nach dem Tarif des Bauhauptgewerbes erhalten Facharbeiter seit April 2026 23,97 € pro Stunde, rund 4.150 € brutto im Monat. Malergesellen bekommen mindestens 16,13 € pro Stunde. Der Median für Maurer im Entgeltatlas liegt bei rund 3.900 €.' },
        { q: 'Wer erkennt Bauabschlüsse an?', a: 'Für Handwerksberufe die Handwerkskammer (HWK) am künftigen Arbeitsort, für Industrieberufe (z. B. Konstruktionsmechaniker) die IHK FOSA in Nürnberg. Die genaue Stelle zeigt der Anerkennungs-Finder.' },
        { q: 'Wie werden Schweißer anerkannt?', a: 'Einen Ausbildungsberuf „Schweißer“ gibt es nicht; Referenzberuf ist Metallbauer/in oder Konstruktionsmechaniker/in. Schweißerprüfungen nach DIN EN ISO 9606 helfen bei der Einstellung, ersetzen aber keine Anerkennung.' },
        { q: 'Kann ich über eine Zeitarbeitsfirma auf dem Bau arbeiten?', a: 'Nein. Im Bauhauptgewerbe ist Leiharbeit verboten (§ 1b AÜG): Sie müssen direkt bei der Baufirma angestellt sein.' },
      ],
    },
    en: {
      slug: 'construction-trades-germany-recognition',
      title: 'Construction trades in Germany 2026: recognition',
      description:
        'Masons, carpenters, plumbers (SHK), welders, painters and tilers from Azerbaijan: recognition at the HWK, 2026 collective pay, shortages, safety and visa.',
      body: `Construction is one of the clearest routes to Germany for workers from Azerbaijan: housing is short, old buildings are being insulated and switched to heat pumps, and experienced tradespeople are missing on site. But German construction is organised differently from the CIS: every trade has its own dual training occupation, its own collective pay and strict safety rules. This guide explains how construction qualifications are recognised, what the pay is in 2026, where the shortage is greatest and which visa fits.

> Find the competent authority for your trade with our [recognition tool](/anerkennung). The general rules are in the guide [recognition of qualifications in Germany](guide:anerkennung).

## Which construction trades exist in Germany

Each specialisation corresponds to a German reference occupation (*Referenzberuf*). It decides the authority and your chances of recognition:

| Your trade | German reference occupation | Training | Who recognises |
|---|---|---|---|
| Bricklayer / mason | Maurer/in | 3 years | Chamber of Crafts (HWK) |
| Concrete worker, steel fixer | Beton- und Stahlbetonbauer/in | 3 years | usually HWK |
| Carpenter, roof structures | Zimmerer/Zimmerin | 3 years | HWK |
| Joiner | Tischler/in | 3 years | HWK |
| Plumbing, heating, ventilation | Anlagenmechaniker/in für Sanitär-, Heizungs- und Klimatechnik (SHK) | 3.5 years | HWK |
| Painter, finishing | Maler/in und Lackierer/in | 3 years | HWK |
| Tiler | Fliesen-, Platten- und Mosaikleger/in | 3 years | HWK |
| Welder | Metallbauer/in (crafts) or Konstruktionsmechaniker/in (industry) | 3.5 years | HWK or IHK FOSA |

Masons, concrete workers, carpenters and tilers train in Germany in a stepped construction programme: two years to construction worker level, then one more year to the full trade. If the employer belongs to the construction industry rather than the crafts sector, **IHK FOSA** may be competent — the Anerkennungs-Finder shows which.

## Do I need recognition?

Employment in these trades is **not regulated**: the law does not require recognition to work for an employer. All of them are listed in Annex A of the Crafts Code (HwO), but that only matters for **your own business**, which usually needs a master craftsman (*Meister*) or an equivalent qualification.

For the visa it is different: **§ 18a AufenthG** requires a qualification recognised as equivalent. That is why most construction workers from outside the EU go through recognition. Welders are a special case: “welder” is not a training occupation of its own in Germany, so recognition goes through Metallbauer or Konstruktionsmechaniker. Employers also look at welder certificates under **DIN EN ISO 9606** — they help you get hired but do not replace recognition.

## Documents, fee and duration

The chamber usually asks for your college or vocational school diploma with a transcript (subjects, theory and practice hours), employer references describing your work, licences and permits, CV and passport, translations by a **sworn translator** and certified copies. The fee is usually **€100–600**; the decision comes within **3 months** of a complete file, or within 2 months in the § 81a fast-track procedure. If documents are missing, the chamber can offer a **skills analysis** (*Qualifikationsanalyse*) — a work test such as building a section of wall or installing a heating unit.

The result is full equivalence, partial equivalence (listing the differences, which you close through training at a German company) or a refusal.

## Construction pay in 2026

- **Main construction trade (Bauhauptgewerbe)** — masons, concrete workers, carpenters, tilers: from 1 April 2026 the collective rate for a skilled worker (*Lohngruppe 3*) is **€23.97 per hour** including the construction supplement, now the same in east and west. Full time that is roughly **€4,150 gross a month** — with employers bound by the agreement. There has been no sector minimum wage in the main construction trade since 2022: nobody may pay less than the statutory minimum wage (€13.90), but the collective rate does not apply everywhere.
- **Painters**: sector minimum wage for journeymen (*Gesellen*) **€16.13 per hour** from 1 July 2026.
- **SHK, joiners, metalwork**: regional craft agreements; in North Rhine-Westphalia SHK pay rose by 2.95 % from March 2026.
- **Statistical benchmark**: the median for masons in the Federal Employment Agency’s Entgeltatlas is about **€3,900** gross a month.

Work out your net pay with our [salary calculator](/salary-calculator). Important: **temporary agency work is banned** in the main construction trade (§ 1b AÜG) — the construction company itself must employ you.

## Where the shortage is greatest

According to the Federal Employment Agency’s 2025 shortage analysis, **plumbing, heating and air conditioning (SHK)** and **metal construction** are official shortage occupations; masons, carpenters, concrete workers and welders at skilled level are “under observation”. Civil engineering, road building and roofing are even tighter. Details by state are in our [shortage barometer](/shortage-barometer).

## Language and safety on site

German is not legally required for recognition or the § 18a visa; § 16d usually requires **A2**. On site, however, you must understand safety briefings, warnings and the foreman’s instructions, so employers expect **A2–B1**. Your employer must give the safety briefing (*Unterweisung*) in a language you understand and provide protective equipment free of charge: helmet, safety shoes, goggles, fall protection. You are insured against accidents through **BG BAU**, and holiday pay in construction runs through **SOKA-BAU**. Practise the German words and safety signs in our [interactive construction-site scene](/work-scenes/construction-site).

## Visa routes for construction workers

- **§ 18a — after recognition.** Employment contract + recognition; the Federal Employment Agency checks that conditions are not worse than local ones. Visa fee €75; the employer can start the § 81a fast-track procedure (€411). More in the guide [work visa for Germany](guide:work-visa).
- **§ 16d — recognition in Germany.** With partial equivalence, an adaptation measure; in a **recognition partnership** you start working for the employer right away and complete recognition in Germany (a qualification of at least 2 years, A2 and an agreement with the employer are required).
- **§ 19c (2) — experience route.** Without German recognition: a qualification recognised by the state in Azerbaijan (at least 2 years of training), at least 2 years of experience in the last 5 years and pay of at least **€45,630 a year** (2026) — or an employer bound by a collective agreement. Construction collective pay is usually above that.
- **No qualification** — [vocational training in Germany](guide:ausbildung); electricians have their own guide: [recognition for electricians](guide:anerkennung-elektroniker).

## How Triad Vision helps

We find the right reference occupation and chamber, check and collect your documents, prepare the recognition application (you arrange translations yourself), look for a construction company and plan the visa route. You file the application at the embassy yourself. [Book a consultation](/booking).

## Official sources

- [Anerkennung in Deutschland — Anerkennungs-Finder](https://www.anerkennung-in-deutschland.de)
- [Crafts Code, Annex A](https://www.gesetze-im-internet.de/hwo/anlage_a.html)
- [Entgeltatlas of the Federal Employment Agency](https://web.arbeitsagentur.de/entgeltatlas/)
- [BG BAU](https://www.bgbau.de)`,
      faq: [
        { q: 'Do I need recognition to work as a mason in Germany?', a: 'The law does not require recognition for employment, but the § 18a visa needs a recognised qualification. Without recognition, the experience route under § 19c (2) is possible with pay of at least €45,630 a year (2026) or with an employer bound by a collective agreement.' },
        { q: 'How much does a construction worker earn in Germany in 2026?', a: 'Under the main construction collective agreement a skilled worker earns €23.97 an hour from April 2026, roughly €4,150 gross a month. Journeyman painters get at least €16.13 an hour. The Entgeltatlas median for masons is about €3,900.' },
        { q: 'Who recognises construction qualifications?', a: 'For craft trades the Chamber of Crafts (HWK) at your future place of work, for industrial occupations (e.g. Konstruktionsmechaniker) IHK FOSA in Nuremberg. The Anerkennungs-Finder shows the exact authority.' },
        { q: 'How are welders recognised?', a: 'There is no training occupation “welder” in Germany, so the reference is Metallbauer/in or Konstruktionsmechaniker/in. DIN EN ISO 9606 certificates help you get hired but do not replace recognition.' },
        { q: 'Can I work in construction through a temp agency?', a: 'No. Temporary agency work is banned in the main construction trade (§ 1b AÜG): the construction company must employ you directly.' },
      ],
    },
  },
};
