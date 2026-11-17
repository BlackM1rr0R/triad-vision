/** Page help texts in Azerbaijani: every public and client portal page (see ../registry.ts). */
import type { FullHelpTexts } from '../registry';

export const HELP_AZ: FullHelpTexts = {
  // start + hubs
  '/start': {
    what: 'Bu səhifə sizə 3 sual verir: kimsiniz, peşəniz nədir və alman diliniz hansı səviyyədədir.',
    why: 'Cavablarınıza görə sizin üçün şəxsi plan hazırlanır.',
    todo: 'Üç suala cavab verin və planınızı açın.',
  },
  '/start/plan': {
    what: 'Bu səhifə sizin şəxsi planınızdır: addım-addım nə etməli olduğunuz.',
    why: 'Hansı addımdan başlamaq lazım olduğunu dərhal görürsünüz.',
    todo: 'Addımları sırayla oxuyun, faydalı alətləri və vakansiyaları açın, sonra qeydiyyatdan keçin.',
  },
  '/tools': {
    what: 'Bu səhifədə bütün pulsuz alətlər bir yerdədir.',
    why: 'Lazım olan kalkulyatoru, testi və ya oyunu tez tapırsınız.',
    todo: 'Axtarışa söz yazın və ya bölməni seçin, sonra aləti açın.',
  },
  '/for/:profession': {
    what: 'Bu səhifə bir peşə üçündür: alətlər, alman sözləri, sınaq imtahanı və vakansiyalar.',
    why: 'Peşənizə aid hər şeyi bir yerdə görürsünüz.',
    todo: 'Sözləri öyrənin, sınaq imtahanını yoxlayın və vakansiyalara baxın.',
  },
  // am I eligible?
  '/path-finder': {
    what: 'Bu səhifə 5 sualla Almaniyaya sizə uyğun yolu göstərir.',
    why: 'Hansı vizanın sizə uyğun olduğunu, təxmini maaşı və müddəti öyrənirsiniz.',
    todo: 'Sualları cavablandırın və nəticəyə baxın.',
  },
  '/uygunluq-testi': {
    what: 'Bu qısa test sizə uyğun yolu tapır: iş, Ausbildung, İmkan Kartı və ya ailə.',
    why: 'Haradan başlamağı bilmədiyiniz zaman kömək edir.',
    todo: '7 suala cavab verin və nəticəni oxuyun.',
  },
  '/eligibility': {
    what: 'Bu səhifə viza testidir.',
    why: 'Hansı viza növünün sizə uyğun olduğunu öyrənirsiniz.',
    todo: 'Suallara cavab verin və tövsiyəyə baxın.',
  },
  '/compare-visas': {
    what: 'Bu səhifə müxtəlif viza yollarını bir cədvəldə müqayisə edir.',
    why: 'Yolların fərqini və hansının sizə yaxın olduğunu görürsünüz.',
    todo: 'Cədvəli oxuyun və sizə uyğun yolu seçin.',
  },
  '/blue-card-check': {
    what: 'Bu səhifə maaşınızın Mavi Kart üçün kifayət olub-olmadığını yoxlayır.',
    why: 'Mavi Kart üçün maaş həddi var.',
    todo: 'Təklif olunan maaşı və peşənizi yazın, nəticəyə baxın.',
  },
  '/chancenkarte-calculator': {
    what: 'Bu səhifə İmkan Kartı (Chancenkarte) üçün xallarınızı hesablayır.',
    why: 'Kifayət qədər xalınız olub-olmadığını və nəyin çatmadığını görürsünüz.',
    todo: 'Təhsil, dil, yaş və təcrübə barədə suallara cavab verin.',
  },
  '/anerkennung': {
    what: 'Bu səhifə diplomun Almaniyada tanınmasını (Anerkennung) izah edir.',
    why: 'Bir çox peşədə işləmək üçün diplomunuz tanınmalıdır.',
    todo: 'Peşənizi seçin və addımları sırayla oxuyun.',
  },
  '/family-reunification-check': {
    what: 'Bu səhifə ailənizin sizin yanınıza gələ bilib-bilmədiyini yoxlayır.',
    why: 'Həyat yoldaşı və uşaqlar üçün gəlir, mənzil və dil şərtləri var.',
    todo: 'Ailəniz, gəliriniz və mənziliniz barədə suallara cavab verin.',
  },
  '/germany-vs-other-countries': {
    what: 'Bu səhifə Almaniyanı başqa ölkələrlə müqayisə edir.',
    why: 'Maaş, viza və ailə şərtlərini yan-yana görürsünüz.',
    todo: 'Ölkələri seçin və cədvəli oxuyun.',
  },
  '/visa-document-checklist': {
    what: 'Bu səhifə viza üçün lazım olan sənədlərin siyahısını verir.',
    why: 'Səfirliyə heç bir sənədi unutmadan getmək üçün.',
    todo: 'Viza növünü və peşənizi seçin, siyahını çap edin.',
  },
  '/visa-refusal': {
    what: 'Bu səhifə vizadan imtina olunanda nə etməli olduğunuzu izah edir.',
    why: 'İmtinanın səbəbini və qalan yolları başa düşürsünüz.',
    todo: 'İmtina səbəbini seçin və növbəti addımları oxuyun.',
  },
  '/grade-converter': {
    what: 'Bu səhifə attestat və ya diplom qiymətinizi alman qiymətinə çevirir.',
    why: 'Almaniyada qiymətlər başqa cür hesablanır.',
    todo: 'Qiymətinizi və qiymət şkalasını yazın.',
  },
  // money
  '/salary-calculator': {
    what: 'Bu səhifə brutto maaşınızdan xalis maaşı hesablayır.',
    why: 'Əlinizə nə qədər pul qalacağını bilirsiniz.',
    todo: 'Maaşı yazın və vergi sinfini seçin.',
  },
  '/cost-calculator': {
    what: 'Bu səhifə Almaniyaya köçün xərclərini təxmini hesablayır.',
    why: 'Nə qədər pul yığmalı olduğunuzu əvvəlcədən bilirsiniz.',
    todo: 'Viza növünü və lazım olan xidmətləri seçin.',
  },
  '/budget': {
    what: 'Bu səhifə Almaniyada ilk ayın büdcəsini hesablayır.',
    why: 'İlk maaşa qədər nə qədər pul lazım olduğunu görürsünüz.',
    todo: 'Maaşınızı, şəhəri və kirayəni yazın.',
  },
  '/payslip-explained': {
    what: 'Bu səhifə alman maaş vərəqəsini (Lohnabrechnung) sətir-sətir izah edir.',
    why: 'Maaşınızdan nəyin və niyə tutulduğunu başa düşürsünüz.',
    todo: 'Vərəqədəki sətirə toxunun və izahı oxuyun.',
  },
  '/tax-refund-calculator': {
    what: 'Bu səhifə vergi bəyannaməsi ilə nə qədər pul geri ala biləcəyinizi hesablayır.',
    why: 'Çox vaxt ödədiyiniz verginin bir hissəsi geri qaytarılır.',
    todo: 'Maaşınızı və xərclərinizi, məsələn işə yolu, yazın.',
  },
  '/shift-pay-calculator': {
    what: 'Bu səhifə gecə, bazar və bayram əlavələrini hesablayır.',
    why: 'Bu əlavələrin bir hissəsi vergisizdir və xalis maaşı artırır.',
    todo: 'Saatlıq maaşınızı və iş saatlarınızı yazın.',
  },
  '/tax-class-chooser': {
    what: 'Bu səhifə evli cütlüklər üçün vergi sinfini müqayisə edir.',
    why: 'Düzgün vergi sinfi ilə hər ay daha çox pul qala bilər.',
    todo: 'İkinizin də maaşını yazın və nəticələri müqayisə edin.',
  },
  '/rent-check': {
    what: 'Bu səhifə kirayə qiymətinin normal olub-olmadığını yoxlayır.',
    why: 'Çox baha mənzil kirayələməmək üçün.',
    todo: 'Şəhəri, mənzilin ölçüsünü və kirayəni yazın.',
  },
  '/send-money-home': {
    what: 'Bu səhifə hər ay ailənizə nə qədər pul göndərə biləcəyinizi hesablayır.',
    why: 'Xərclərdən sonra nə qaldığını manatla görürsünüz.',
    todo: 'Maaşınızı və xərclərinizi yazın.',
  },
  '/real-salaries': {
    what: 'Bu səhifə işçilərimizin müqavilələrindəki real maaşları göstərir.',
    why: 'Peşənizdə və şəhərinizdə həqiqətən nə qədər ödənildiyini görürsünüz.',
    todo: 'Peşəni və şəhəri seçin.',
  },
  '/health-insurance-comparison': {
    what: 'Bu səhifə alman tibbi sığorta kassalarını (Krankenkasse) müqayisə edir.',
    why: 'Kassalar arasında qiymət fərqi var.',
    todo: 'Maaşınızı yazın və ən ucuz kassalara baxın.',
  },
  // plan the move
  '/when-in-germany': {
    what: 'Bu səhifə Almaniyaya təxminən nə vaxt gələ biləcəyinizi göstərir.',
    why: 'Planlarınızı vaxtında qurmaq üçün.',
    todo: 'Viza növünü və hazırkı addımınızı seçin.',
  },
  '/permanent-residence': {
    what: 'Bu səhifə daimi yaşayış və vətəndaşlıq üçün ən tez tarixi göstərir.',
    why: 'Almaniyada uzun müddətli planınızı görürsünüz.',
    todo: 'Gəliş tarixinizi və vəziyyətinizi yazın.',
  },
  '/five-years-in-germany': {
    what: 'Bu səhifə Almaniyada ilk 5 ilinizi il-il göstərir.',
    why: 'Maaş, yığım və yaşayış icazəsinin necə dəyişəcəyini görürsünüz.',
    todo: 'Peşənizi və şəhəri seçin, illərə baxın.',
  },
  '/which-city': {
    what: 'Bu səhifə sizə uyğun alman şəhərini tapır.',
    why: 'Hansı şəhərdə yaşamağın sizə daha yaxşı olduğunu öyrənirsiniz.',
    todo: '8 suala cavab verin və nəticəyə baxın.',
  },
  '/residence-card-explained': {
    what: 'Bu səhifə alman yaşayış kartını (eAT) izah edir.',
    why: 'Kartdakı hər yazının mənasını başa düşürsünüz.',
    todo: 'Nümunə kartda sahəyə toxunun və izahı oxuyun.',
  },
  '/calculator': {
    what: 'Bu səhifə Almaniyada işə nə vaxt başlaya biləcəyinizi təxmin edir.',
    why: 'Planlarınızı tarixə görə qurursunuz.',
    todo: 'Viza növünü və başlama tarixini seçin.',
  },
  '/cities': {
    what: 'Bu səhifə alman şəhərlərini müqayisə edir.',
    why: 'Kirayə, nəqliyyat və aylıq xərcləri görürsünüz.',
    todo: 'Şəhərləri seçin və rəqəmləri müqayisə edin.',
  },
  '/events': {
    what: 'Bu səhifədə pulsuz tədbirlər və vebinarlar var.',
    why: 'Suallarınızı soruşa və yeni məlumat öyrənə bilərsiniz.',
    todo: 'Tədbir seçin və qeydiyyatdan keçin.',
  },
  '/status': {
    what: 'Bu səhifə müraciətinizin hansı mərhələdə olduğunu göstərir.',
    why: 'Girişsiz statusu yoxlaya bilərsiniz.',
    todo: 'Müraciət nömrənizi və doğum tarixinizi yazın.',
  },
  '/changes-2027': {
    what: 'Bu səhifə 2027-ci ildə Almaniyada nəyin dəyişdiyini göstərir.',
    why: 'Maaş, vergi və digər qaydalardakı yenilikləri bilirsiniz.',
    todo: 'Siyahını oxuyun: köhnə və yeni dəyər yan-yanadır.',
  },
  // life in Germany
  '/life-in-germany': {
    what: 'Bu səhifə Almaniyada həyatınızı simulyasiya edir.',
    why: 'Maaş, kirayə və xərclərdən sonra nə qaldığını görürsünüz.',
    todo: 'Peşənizi və şəhəri seçin.',
  },
  '/driving-licence-germany': {
    what: 'Bu səhifə Azərbaycan sürücülük vəsiqəsinin Almaniyada necə istifadə olunduğunu izah edir.',
    why: 'Vəsiqəni vaxtında dəyişmək lazım ola bilər.',
    todo: 'Vəsiqə növünüzü seçin və addımları oxuyun.',
  },
  '/german-apartment': {
    what: 'Bu səhifə virtual alman mənzilidir.',
    why: 'Mənzildə gündəlik qaydaları əvvəlcədən öyrənirsiniz.',
    todo: 'Mənzildəki nöqtələrə toxunun və izahları oxuyun.',
  },
  '/apartment-viewing': {
    what: 'Bu səhifədə mənzilə baxışı alman dilində məşq edirsiniz.',
    why: 'Baxışa hazır gedir və fırıldaqları tanıyırsınız.',
    todo: 'Dialoqu məşq edin və kirayəçi anketini (Mieterselbstauskunft) doldurun.',
  },
  '/german-street': {
    what: 'Bu səhifə virtual alman küçəsidir: idarə, bank, vağzal, mağaza, həkim.',
    why: 'Gündəlik vəziyyətləri oyunla məşq edirsiniz.',
    todo: 'Binaya toxunun və oyunu açın.',
  },
  '/holiday-planner': {
    what: 'Bu səhifə alman bayramlarını və körpü günlərini göstərir.',
    why: 'Məzuniyyəti ağıllı planlaşdırırsınız.',
    todo: 'Ştatı və ili seçin, təqvimə əlavə edin.',
  },
  '/advent-calendar': {
    what: 'Bu səhifə Advent təqvimidir: 1-24 dekabr hər gün bir qapı.',
    why: 'Alman Milad ənənələrini və ifadələrini öyrənirsiniz.',
    todo: 'Bu günün qapısını açın.',
  },
  '/weekend-trips': {
    what: 'Bu səhifə qatarla həftəsonu səfərləri təklif edir.',
    why: 'Deutschlandticket ilə ucuz səyahət yerlərini tapırsınız.',
    todo: 'Şəhərinizi seçin və səfər yerinə baxın.',
  },
  '/driving-time-calculator': {
    what: 'Bu səhifə sürücülər üçün sürmə və istirahət vaxtını yoxlayır.',
    why: 'Qaydaları pozub cərimə almamaq üçün.',
    todo: 'Həftəlik sürmə və istirahət saatlarınızı yazın.',
  },
  '/work-schedule-check': {
    what: 'Bu səhifə iş qrafikinizin qanuna uyğun olub-olmadığını yoxlayır.',
    why: 'İş saatları və istirahət üçün qaydalar var.',
    todo: 'Növbələrinizi yazın və nəticəyə baxın.',
  },
  '/emergency-wallpaper': {
    what: 'Bu səhifə telefon üçün təcili yardım ekran şəkli yaradır.',
    why: 'Vacib nömrələr və ünvanınız həmişə ekranda olur.',
    todo: 'Məlumatları yazın və şəkli endirin.',
  },
  '/pocket-guide': {
    what: 'Bu səhifə çap üçün Almaniya cib bələdçisidir.',
    why: 'Vacib nömrələr və ifadələr həmişə yanınızda olur.',
    todo: 'PDF-i endirin və çap edin.',
  },
  // explore
  '/map': {
    what: 'Bu xəritə işçilərimizin Almaniyanın hansı şəhərlərində çalışdığını göstərir.',
    why: 'Başqalarının harada işə başladığını görürsünüz.',
    todo: 'Xəritədə şəhərə toxunun.',
  },
  '/azerbaijan-in-germany': {
    what: 'Bu xəritə Almaniyada Azərbaycanla bağlı yerləri göstərir.',
    why: 'Səfirliyi, birlikləri və tanış yerləri tapırsınız.',
    todo: 'Şəhəri seçin və yerlərə baxın.',
  },
  '/guides': {
    what: 'Bu səhifədə viza, Anerkennung (diplomun tanınması) və köç haqqında bələdçilər var.',
    why: 'Suallarınıza ətraflı cavab tapırsınız.',
    todo: 'Mövzu seçin və yazını oxuyun.',
  },
  '/glossary': {
    what: 'Bu səhifə alman bürokratiya sözlərinin lüğətidir.',
    why: 'Məktub və formalardakı sözləri başa düşürsünüz.',
    todo: 'Sözü axtarın və sadə izahı oxuyun.',
  },
  '/shortage-barometer': {
    what: 'Bu səhifə Almaniyada hansı peşələrdə işçi çatışmadığını göstərir.',
    why: 'Peşənizin harada daha çox axtarıldığını görürsünüz.',
    todo: 'Peşənizi seçin və xəritəyə baxın.',
  },
  '/jobs': {
    what: 'Bu səhifədə Almaniyada açıq vakansiyalar var.',
    why: 'Sizə uyğun işi tapırsınız.',
    todo: 'Vakansiyanı seçin və müraciət edin.',
  },
  '/visas': {
    what: 'Bu səhifə bütün iş vizası növlərini göstərir.',
    why: 'Hər vizanın tələblərini bilirsiniz.',
    todo: 'Viza növünü seçin və ətraflı oxuyun.',
  },
  // learn German
  '/german-mock-exam': {
    what: 'Bu səhifədə alman dili sınaq imtahanları var.',
    why: 'Real imtahandan əvvəl məşq edirsiniz.',
    todo: 'A1 və ya B1 seçin və başlayın.',
  },
  '/german-mock-exam/a1': {
    what: 'Bu səhifə A1 səviyyəsində sınaq imtahanıdır.',
    why: 'Real A1 imtahanına nə qədər hazır olduğunuzu görürsünüz.',
    todo: 'Taymeri başladın və hər hissəni həll edin.',
  },
  '/german-mock-exam/b1': {
    what: 'Bu səhifə B1 səviyyəsində sınaq imtahanıdır.',
    why: 'Real B1 imtahanına nə qədər hazır olduğunuzu görürsünüz.',
    todo: 'Taymeri başladın və dörd hissəni həll edin.',
  },
  '/german-level-test-self': {
    what: 'Bu səhifə alman dili səviyyənizi özünüz qiymətləndirməyə kömək edir.',
    why: 'Səviyyənizi və növbəti addımı bilirsiniz.',
    todo: 'Cümlələri oxuyun və nəyi bacardığınızı seçin.',
  },
  '/german-simulator': {
    what: 'Bu səhifədə idarədə, bankda və həkimdə alman dilində dialoq məşq edirsiniz.',
    why: 'Real vəziyyətdə nə deyəcəyinizi bilirsiniz.',
    todo: 'Vəziyyəti seçin və düzgün cavabı seçin.',
  },
  '/pronunciation': {
    what: 'Bu səhifə alman tələffüzünü məşq etməyə kömək edir.',
    why: 'Düzgün danışmaq üçün.',
    todo: 'Cümləni dinləyin, yüksək səslə deyin və nəticəyə baxın.',
  },
  '/price-game': {
    what: 'Bu oyunda Almaniyada qiymətləri təxmin edirsiniz.',
    why: 'Gündəlik xərcləri əvvəlcədən öyrənirsiniz.',
    todo: 'Qiyməti təxmin edin və düzgün cavabı görün.',
  },
  '/traffic-signs': {
    what: 'Bu səhifə alman yol nişanlarını öyrədir.',
    why: 'Almaniyada sürmək və ya piyada getmək üçün lazımdır.',
    todo: 'Nişanları öyrənin, sonra testi keçin.',
  },
  '/waste-sorting': {
    what: 'Bu oyunda zibili düzgün qaba atmağı öyrənirsiniz.',
    why: 'Almaniyada zibil növlərə ayrılır.',
    todo: 'Hər əşyanı düzgün qaba atın.',
  },
  '/ticket-machine': {
    what: 'Bu səhifə alman bilet avtomatını simulyasiya edir.',
    why: 'Düzgün bilet alıb cərimədən qaçırsınız.',
    todo: 'Tapşırığı oxuyun və bileti alın.',
  },
  '/supermarket-game': {
    what: 'Bu oyunda alman supermarketində alış-veriş edirsiniz.',
    why: 'Məhsulların alman adlarını öyrənirsiniz.',
    todo: 'Siyahıdakı məhsulları rəflərdən tapın.',
  },
  '/workplace-etiquette': {
    what: 'Bu səhifə alman iş yerində davranış qaydaları haqqında viktorinadır.',
    why: 'İşdə nəyin normal olduğunu əvvəlcədən bilirsiniz.',
    todo: 'Vəziyyəti oxuyun və cavab seçin.',
  },
  '/work-scenes': {
    what: 'Bu səhifədə iş yerlərinin şəkilləri və alman sözləri var.',
    why: 'İşdə lazım olan sözləri öyrənirsiniz.',
    todo: 'İş yerini seçin.',
  },
  '/work-scenes/restaurant-kitchen': {
    what: 'Bu şəkil restoran mətbəxidir, alman sözləri ilə.',
    why: 'Mətbəxdə lazım olan sözləri öyrənirsiniz.',
    todo: 'Əşyaya toxunun, sözü dinləyin, sonra testi keçin.',
  },
  '/work-scenes/truck-cab': {
    what: 'Bu şəkil yük maşınının kabinəsidir, alman sözləri ilə.',
    why: 'Sürücü kimi lazım olan sözləri öyrənirsiniz.',
    todo: 'Əşyaya toxunun, sözü dinləyin, sonra testi keçin.',
  },
  '/work-scenes/hospital-ward': {
    what: 'Bu şəkil xəstəxana palatasıdır, alman sözləri ilə.',
    why: 'Xəstəxanada lazım olan sözləri öyrənirsiniz.',
    todo: 'Əşyaya toxunun, sözü dinləyin, sonra testi keçin.',
  },
  '/work-scenes/construction-site': {
    what: 'Bu şəkil tikinti meydançasıdır, alman sözləri ilə.',
    why: 'Tikintidə lazım olan sözləri və təhlükəsizlik qaydalarını öyrənirsiniz.',
    todo: 'Əşyaya toxunun, sözü dinləyin, sonra testi keçin.',
  },
  '/work-scenes/electrical-panel': {
    what: 'Bu şəkil elektrik lövhəsidir, alman sözləri ilə.',
    why: 'Elektrik işində lazım olan sözləri öyrənirsiniz.',
    todo: 'Əşyaya toxunun, sözü dinləyin, sonra testi keçin.',
  },
  // employers
  '/employer-cost-calculator': {
    what: 'Bu səhifə işəgötürən üçün bir işçinin xərcini hesablayır.',
    why: 'Xaricdən işçi qəbul etməyin real qiymətini görürsünüz.',
    todo: 'Brutto maaşı yazın və xərclərə baxın.',
  },
  '/employer-guide-azerbaijan': {
    what: 'Bu səhifə Azərbaycandan işçi qəbul edən işəgötürənlər üçün bələdçidir.',
    why: 'Təhsil, diplomlar və prosedur haqqında bilirsiniz.',
    todo: 'Bölmələri oxuyun və suallarınız varsa bizə yazın.',
  },
  '/kandidaten': {
    what: 'Bu səhifə Almaniyada işləməyə hazır namizədlərin anonim kataloqudur.',
    why: 'İşəgötürən kimi uyğun işçi tapırsınız.',
    todo: 'Peşəyə və dilə görə süzün, namizəd üçün sorğu göndərin.',
  },
  '/novruz-card': {
    what: 'Bu səhifə Novruz təbrik kartı yaradır.',
    why: 'Azərbaycanlı işçilərinizi düzgün təbrik edirsiniz.',
    todo: 'Kartı seçin, adı yazın və yükləyin.',
  },

  // client portal
  '/account': {
    what: 'Bu sizin kabinetinizin əsas səhifəsidir.',
    why: 'İndi ən vacib addımı və gedişatı burada görürsünüz.',
    todo: 'Yuxarıdakı kartdakı addımı edin.',
  },
  '/account/cases': {
    what: 'Bu səhifə bütün müraciətlərinizi göstərir.',
    why: 'Öz və ailə üzvlərinizin müraciətlərini bir yerdə görürsünüz.',
    todo: 'Müraciəti açın və onun vəziyyətinə baxın.',
  },
  '/account/cases/:id': {
    what: 'Bu səhifə bir müraciətinizin bütün məlumatlarını göstərir.',
    why: 'Sənədləri, addımları və statusu burada görürsünüz.',
    todo: 'Çatışmayan sənədləri yükləyin və açıq tapşırıqları edin.',
  },
  '/account/cases/:id/forms/:formId': {
    what: 'Bu səhifə komandamızın sizə göndərdiyi anketdir.',
    why: 'Sənədlərinizi hazırlamaq üçün bu cavablar lazımdır.',
    todo: 'Sualları doldurun və göndərin. Yazdıqlarınız avtomatik saxlanılır.',
  },
  '/account/cases/:id/confirm': {
    what: 'Bu səhifə səfirliyə gedəcək məlumatlarınızı göstərir.',
    why: 'Səhv məlumat problem yarada bilər.',
    todo: 'Hər sahəni yoxlayın: düzdürsə təsdiqləyin, səhvdirsə düzəldin.',
  },
  '/account/notifications': {
    what: 'Bu səhifədə bütün bildirişləriniz var.',
    why: 'Heç bir vacib xəbəri qaçırmırsınız.',
    todo: 'Yeni bildirişləri oxuyun.',
  },
  '/account/profile': {
    what: 'Bu səhifə sizin şəxsi məlumatlarınızdır.',
    why: 'Tam profil sənədlərin hazırlanmasını sürətləndirir.',
    todo: 'Boş sahələri doldurun və yadda saxlayın.',
  },
  '/account/applications': {
    what: 'Bu səhifə vakansiyalara göndərdiyiniz müraciətləri göstərir.',
    why: 'Hər müraciətin hansı vəziyyətdə olduğunu görürsünüz.',
    todo: 'Müraciətlərinizin statusuna baxın.',
  },
  '/account/saved-jobs': {
    what: 'Bu səhifədə saxladığınız vakansiyalar və iş bildirişləri var.',
    why: 'Bəyəndiyiniz işləri itirmirsiniz.',
    todo: 'Vakansiyanı açın və ya bildiriş tezliyini seçin.',
  },
  '/account/job-applications': {
    what: 'Bu səhifə başqa saytlardakı elanlara bizim vasitəmizlə göndərdiyiniz müraciətləri göstərir.',
    why: 'Hər müraciətin vəziyyətini görürsünüz.',
    todo: 'Statuslara və qeydlərə baxın.',
  },
  '/account/onboarding': {
    what: 'Bu səhifə Almaniyaya gəldikdən sonra görüləcək işlərin siyahısıdır.',
    why: 'İlk həftələrdə heç nəyi unutmursunuz.',
    todo: 'Hər addımı edin və hazır kimi işarələyin.',
  },
  '/account/housing': {
    what: 'Bu səhifə mənzil axtarışı və Anmeldung (yaşayış yerinin qeydiyyatı) üçündür.',
    why: 'Gəlişdən sonra yaşayış yerinizi qeydiyyatdan keçirməlisiniz.',
    todo: 'Addımları izləyin və görüş tarixini yazın.',
  },
  '/account/german': {
    what: 'Bu səhifə alman dilinə hazırlığınız üçündür.',
    why: 'Viza və iş üçün alman dili lazımdır.',
    todo: 'Səviyyənizi yoxlayın, kurs seçin və sertifikatı yükləyin.',
  },
  '/account/interviews': {
    what: 'Bu səhifə işəgötürənlərlə onlayn müsahibələrinizi göstərir.',
    why: 'Müsahibə vaxtını unutmursunuz.',
    todo: 'Vaxtı təsdiqləyin və vaxtında müsahibəyə qoşulun.',
  },
  '/account/privacy': {
    what: 'Bu səhifə məxfilik və razılıqlarınız üçündür.',
    why: 'Məlumatlarınızla nə edildiyini siz idarə edirsiniz.',
    todo: 'Razılıqlarınızı yoxlayın və lazım olsa dəyişin.',
  },
  '/account/waiting-room': {
    what: 'Bu səhifə müraciətinizə baxılarkən hazırlaşmaq üçündür.',
    why: 'Gözləmə vaxtını faydalı keçirirsiniz.',
    todo: 'Qısa dərsləri, testləri və siyahıları keçin.',
  },
  '/account/course': {
    what: 'Bu səhifə Almaniyada iş və həyat üçün hazırlıq kursudur.',
    why: 'Almaniyaya hazır gəlirsiniz.',
    todo: 'Kursu seçin və başlayın.',
  },
  '/account/course/:courseId': {
    what: 'Bu səhifə kursun dərslərini göstərir.',
    why: 'Hansı dərsləri bitirdiyinizi görürsünüz.',
    todo: 'Növbəti dərsi açın.',
  },
  '/account/course/:courseId/lesson/:lessonId': {
    what: 'Bu səhifə kursun bir dərsidir.',
    why: 'Addım-addım öyrənirsiniz.',
    todo: 'Dərsi oxuyun və ya baxın, sonra testi keçin.',
  },
  '/account/guides': {
    what: 'Bu səhifədə hazırkı addımınız üçün məsləhətlər var.',
    why: 'İndi nəyi bilməli olduğunuzu tapırsınız.',
    todo: 'Məsləhətləri oxuyun və keçidləri açın.',
  },
  '/account/cv': {
    what: 'Bu səhifədə alman dilində CV (Lebenslauf) hazırlayırsınız.',
    why: 'İşəgötürənlər CV istəyir.',
    todo: 'Sualları doldurun, mətni yoxlayın və CV-ni yükləyin.',
  },
  '/account/letters/*': {
    what: 'Bu səhifədə alman dilində motivasiya məktubu hazırlayırsınız.',
    why: 'Səfirlik və ya işəgötürən məktub istəyə bilər.',
    todo: 'Yeni məktub yaradın, mətni yoxlayın və yükləyin.',
  },
  '/account/letters-explain': {
    what: 'Bu səhifə alman idarəsindən gələn məktubu sadə dildə izah edir.',
    why: 'Məktubda nə yazıldığını və nə etməli olduğunuzu başa düşürsünüz.',
    todo: 'Məktubun şəklini çəkin və ya yükləyin.',
  },
  '/account/vault': {
    what: 'Bu səhifə sizin sənəd seyfinizdir.',
    why: 'Sənədləri bir dəfə yükləyib yenidən istifadə edirsiniz.',
    todo: 'Sənədlərinizi yükləyin və bitmə tarixini yazın.',
  },
  '/account/referral': {
    what: 'Bu səhifə dostlarınızı dəvət etmək üçündür.',
    why: 'Dostunuz da Almaniyaya yol tapa bilər.',
    todo: 'Linki kopyalayın və dostunuza göndərin.',
  },
  '/account/arrival': {
    what: 'Bu səhifə Almaniyaya gəlişinizin planıdır.',
    why: 'Uçuş, qarşılanma və ilk yaşayış yeri vaxtında hazır olur.',
    todo: 'Uçuş məlumatlarınızı yazın və nəyə ehtiyacınız olduğunu seçin.',
  },
  '/account/arrival-prep': {
    what: 'Bu səhifə gəlişə hazırlıq üçündür.',
    why: 'İlk həftələrin formalarını əvvəlcədən görürsünüz.',
    todo: 'Nümunə formalara baxın və yaddaş vərəqini çap edin.',
  },
  '/account/arrival-card': {
    what: 'Bu səhifə sizin rəqəmsal gəliş kartınızdır.',
    why: 'Ünvan və vacib əlaqələr internetsiz də əlinizdə olur.',
    todo: 'Kartı yoxlayın və telefonda saxlayın.',
  },
  '/account/readiness': {
    what: 'Bu səhifə Almaniyaya nə qədər hazır olduğunuzu bal ilə göstərir.',
    why: 'Nəyin hələ çatmadığını görürsünüz.',
    todo: 'Ən aşağı bölməni açın və növbəti addımı edin.',
  },
  '/account/germany-ready': {
    what: 'Bu səhifə məşqlərinizdən topladığınız xalları göstərir.',
    why: 'Öyrənməyə davam etmək üçün motivasiya verir.',
    todo: 'Həftəlik tapşırığı edin və xal toplayın.',
  },
  '/account/future-letter': {
    what: 'Bu səhifədə gələcək özünüzə məktub yazırsınız.',
    why: 'Almaniyaya çatanda bu məktubu alacaqsınız.',
    todo: 'Məktubu yazın və yadda saxlayın.',
  },
  '/account/rate-alerts': {
    what: 'Bu səhifə avro-manat məzənnəsi üçün xəbərdarlıqdır.',
    why: 'Pul göndərmək üçün yaxşı anı bilirsiniz.',
    todo: 'İstədiyiniz məzənnəni yazın və xəbərdarlığı yaradın.',
  },
  '/account/pocket-guide': {
    what: 'Bu səhifə sizin şəxsi Almaniya cib bələdçinizdir.',
    why: 'Adınız, işəgötürəniniz və şəhəriniz artıq içindədir.',
    todo: 'PDF-i endirin və çap edin.',
  },
  '/account/emergency-wallpaper': {
    what: 'Bu səhifə telefon üçün təcili yardım ekran şəkli yaradır.',
    why: 'Vacib nömrələr və ünvanınız həmişə ekranda olur.',
    todo: 'Məlumatları yoxlayın və şəkli endirin.',
  },
  '/account/badges': {
    what: 'Bu səhifə nailiyyət nişanlarınızı göstərir.',
    why: 'Yolunuzda nə qədər irəlilədiyinizi görürsünüz.',
    todo: 'Nişanlara baxın. Onları yalnız siz görürsünüz.',
  },
  '/account/visa-story/:caseId': {
    what: 'Bu səhifə viza yolunuzun qısa hekayəsidir.',
    why: 'Vizanız təsdiqləndi, yolunuzu xatırlayırsınız.',
    todo: 'Slaydlara baxın və istəsəniz paylaşın.',
  },
  '/account/rule-changes': {
    what: 'Bu səhifə viza növünüz üçün qayda dəyişikliklərini göstərir.',
    why: 'Yeni qaydalar müraciətinizə təsir edə bilər.',
    todo: 'Dəyişiklikləri oxuyun.',
  },
  '/account/checklist': {
    what: 'Bu səhifə sizə lazım olan sənədlərin siyahısıdır.',
    why: 'Hansı sənədin hələ çatmadığını görürsünüz.',
    todo: 'Çatışmayan sənədləri hazırlayın və yükləyin.',
  },
  '/account/budget': {
    what: 'Bu səhifə Almaniyada ilk ayınızın büdcəsini göstərir.',
    why: 'Özünüzlə nə qədər pul gətirməli olduğunuzu bilirsiniz.',
    todo: 'Rəqəmləri yoxlayın və lazım olsa dəyişin.',
  },
  '/account/interview-prep': {
    what: 'Bu səhifə müsahibəyə hazırlıq üçündür.',
    why: 'Suallara əvvəlcədən hazır olursunuz.',
    todo: 'Sualı oxuyun, cavabı deyin, sonra nümunə cavaba baxın.',
  },
  '/account/signatures': {
    what: 'Bu səhifədə imzalamalı olduğunuz sənədlər var.',
    why: 'İmza olmadan işiniz dayana bilər.',
    todo: 'Sənədi açın, oxuyun və onlayn imzalayın.',
  },
  '/account/signatures/:signerId': {
    what: 'Bu səhifə imzalamalı olduğunuz sənəddir.',
    why: 'İmza olmadan işiniz dayana bilər.',
    todo: 'Sənədi oxuyun və imzalayın.',
  },
  '/account/payments': {
    what: 'Bu səhifə hesab-fakturalarınızı və ödənişlərinizi göstərir.',
    why: 'Nəyin ödənildiyini və nəyin gözlədiyini görürsünüz.',
    todo: 'Ödənilməmiş hesab-fakturanı açın və ödəniş məlumatlarına baxın.',
  },
  '/account/all': {
    what: 'Bu səhifədə kabinetin bütün bölmələri var.',
    why: 'Menyuda görmədiyiniz bölməni burada tapa bilərsiniz.',
    todo: 'Lazım olan bölməni seçin və açın.',
  },
};
