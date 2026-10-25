/**
 * Privacy policy template (Datenschutzerklärung) – the long text, kept in its own module so it is
 * only downloaded with the /privacy page. See pagesLegal.ts for the rules: the GERMAN version is
 * legally binding, square-bracket notes must be resolved, [[months]] / [[email]] / [[supervisory]]
 * are filled in by the page, and the whole text must be reviewed by a lawyer before going live.
 */
import type { PolicySection } from './pagesLegal';

const azSections: PolicySection[] = [
  {
    id: 'general',
    title: 'Ümumi məlumat',
    body: [
      'Bu məxfilik siyasəti DSGVO-nun 13 və 14-cü maddələrinə uyğun olaraq triad-vision.de saytından, namizəd və işəgötürən portalından və mobil tətbiqimizdən istifadə edərkən hansı şəxsi məlumatları, hansı məqsədlə və hansı hüquqi əsasla emal etdiyimizi, eləcə də hüquqlarınızı izah edir.',
      'Triad Vision Azərbaycandan olan mütəxəssisləri Almaniyadakı işəgötürənlərə yönləndirir və viza prosesini müşayiət edir. Bunun üçün namizəd məlumatlarının geniş emalı lazımdır. Biz yalnız bu məqsədlər üçün zəruri olan məlumatları emal edirik.',
    ],
  },
  {
    id: 'hosting',
    title: 'Hostinq və serverlər',
    body: [
      'Saytımız, API və yüklənmiş bütün sənədlər Akamai Technologies, Inc. (Linode), 145 Broadway, Cambridge, MA 02142, ABŞ şirkətinin serverlərində işləyir. Məlumat mərkəzinin yeri: [Hostinq təminatçısını və məlumat mərkəzinin yerini yoxlayın, məs. Frankfurt am Main]. Təminatçı ilə DSGVO-nun 28-ci maddəsinə uyğun məlumat emalı müqaviləsi bağlanıb [yoxlayın].',
      'Hüquqi əsas: DSGVO maddə 6(1)(f) (təhlükəsiz və etibarlı işləmədə qanuni maraq), sizinlə müqavilənin icrası üçün isə maddə 6(1)(b).',
    ],
  },
  {
    id: 'cloudflare',
    title: 'Cloudflare (CDN və təhlükəsizlik)',
    body: [
      'Hücumlardan qorunmaq və səhifələrin daha sürətli yüklənməsi üçün bütün trafik Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, ABŞ şəbəkəsindən keçir. Cloudflare texniki bağlantı məlumatlarını (xüsusilə IP ünvanı, açılan URL, brauzer məlumatı, vaxt) emal edir.',
      'Hüquqi əsas DSGVO maddə 6(1)(f)-dir; qanuni marağımız xidmətimizin təhlükəsizliyi və əlçatanlığıdır. Cloudflare AB-ABŞ Məlumat Məxfiliyi Çərçivəsi (Data Privacy Framework) üzrə sertifikatlıdır; əlavə olaraq standart müqavilə bəndləri tətbiq olunur. Cloudflare ilə məlumat emalı müqaviləsi var [yoxlayın].',
    ],
  },
  {
    id: 'logs',
    title: 'Server log faylları',
    body: [
      'Hər müraciət zamanı aşağıdakı məlumatlar avtomatik qeydə alınır:',
      [
        'IP ünvanı',
        'tarix və vaxt',
        'açılan səhifə və ya interfeys',
        'HTTP status kodu və ötürülən məlumatın həcmi',
        'əvvəlki səhifənin ünvanı (referrer)',
        'brauzer və əməliyyat sistemi (User-Agent)',
      ],
      'Bu məlumatlar yalnız fasiləsiz işləməni təmin etmək və hücumların qarşısını almaq üçün istifadə olunur (DSGVO maddə 6(1)(f)). Onlar digər məlumatlarla birləşdirilmir və [log fayllarının saxlanma müddətini yoxlayın, məs. 14 gün] sonra silinir.',
    ],
  },
  {
    id: 'cookies',
    title: 'Kukilər və lokal yaddaş',
    body: [
      'Biz izləmə, reklam və ya analitika kukilərindən istifadə etmirik. Cihazınızda yalnız texniki baxımdan mütləq zəruri olan məlumatlar saxlanılır:',
      [
        'tv_session – girişdən sonra sessiya kukisi (httpOnly); 30 dəqiqə fəaliyyətsizlikdən sonra, ən gec isə 12 saatdan sonra etibarsız olur.',
        'tv_lang – seçilmiş dil (Local Storage).',
        'tv_ref – yalnız tövsiyə linki ilə (?ref=KOD) gəldikdə: agentin və ya sizi dəvət edən müştərinin kodu, qeydiyyatda dəvəti nəzərə almaq üçün; birinci tərəf kukisi, 60 gün, qeydiyyatdan sonra silinir, üçüncü tərəflərə ötürülmür.',
        'Görünüş və əlçatanlıq ayarları (məs. tünd rejim, şrift ölçüsü) və kuki bildirişini gördüyünüz barədə qeyd (Local Storage).',
        'Mobil tətbiqdə: giriş tokeniniz cihazın şifrələnmiş yaddaşında (Keychain/Keystore).',
      ],
      'Hüquqi əsas: § 25 Abs. 2 Nr. 2 TDDDG (keçmiş TTDSG) və DSGVO maddə 6(1)(b) və (f). Bunun üçün razılıq tələb olunmur.',
    ],
  },
  {
    id: 'analytics',
    title: 'Kukisiz ziyarət statistikası',
    body: [
      'Biz Cloudflare Web Analytics-dən istifadə edirik. Bu zaman kuki qoyulmur və istifadəçi profili yaradılmır; yalnız açılan səhifələr, yüklənmə vaxtı, ölkə və brauzer növü kimi ümumiləşdirilmiş məlumatlar toplanır. Hüquqi əsas DSGVO maddə 6(1)(f)-dir.',
      'Bundan əlavə, öz serverimizdə gündəlik ziyarətləri mənbəyə görə (məs. axtarış sistemi, sosial şəbəkə) sayırıq. Sizi tanımağa imkan verən heç nə saxlanılmır; IP ünvanı yalnız qısa müddət yaddaşda sui-istifadənin məhdudlaşdırılması üçün istifadə olunur. Brauzeriniz "Do Not Track" və ya "Global Privacy Control" siqnalı göndərirsə, heç nə sayılmır.',
    ],
  },
  {
    id: 'external',
    title: 'Xarici məzmun',
    body: [
      [
        'Şriftlər: Onest şrifti birbaşa bizim serverimizdən yüklənir. Üçüncü tərəflərə (məsələn Google) heç bir sorğu göndərilmir.',
        'Şəkillər: bəzi fotolar Unsplash serverlərindən yüklənir; bu zaman IP ünvanınız onların serverlərinə ötürülür.',
        'Xəritə: əlaqə səhifəsində OpenStreetMap xəritəsi (OpenStreetMap Foundation, Böyük Britaniya) yerləşdirilib; yüklənərkən IP ünvanınız və texniki məlumatlar OpenStreetMap Foundation-a ötürülür.',
        'WhatsApp, telefon və sosial şəbəkələr yalnız keçid kimi verilib. Məlumat yalnız siz keçidə kliklədikdə ötürülür; bu halda müvafiq təminatçının məxfilik qaydaları tətbiq olunur.',
      ],
      'Hüquqi əsas DSGVO maddə 6(1)(f)-dir (saytın cəlbedici və işlək təqdimatı).',
    ],
  },
  {
    id: 'contact',
    title: 'Əlaqə formaları, sorğular və məsləhət görüşləri',
    body: [
      'Bizimlə forma, e-poçt, telefon və ya WhatsApp vasitəsilə əlaqə saxladıqda, işəgötürən kimi işçi sorğusu göndərdikdə və ya məsləhət görüşü sifariş etdikdə, sorğunuzu emal etmək üçün məlumatlarınızı (məs. ad, e-poçt, telefon, şirkət, lazım olan işçi sayı, mesaj, istədiyiniz vaxt) emal edirik.',
      'Sorğunuz müqavilə bağlanmasına yönəlibsə, hüquqi əsas DSGVO maddə 6(1)(b), digər hallarda maddə 6(1)(f)-dir (sorğuların cavablandırılması). Sorğu tam emal edildikdən və qanuni saxlama öhdəliyi olmadıqda məlumatlar silinir.',
    ],
  },
  {
    id: 'portal',
    title: 'Müştəri hesabı və namizəd portalı',
    body: [
      'Yönləndirmə və viza prosesi üçün hesabınızda aşağıdakıları emal edirik:',
      [
        'Hesab məlumatları: ad, e-poçt, telefon, şifrə (yalnız hash şəklində), dil, bildiriş ayarları;',
        'Profil məlumatları: doğum tarixi, vətəndaşlıq, yaşayış yeri və ünvan, peşə, iş təcrübəsi, alman dili səviyyəsi, təhsil, sürücülük kateqoriyaları, özünüz haqqında məlumat;',
        'Sənədlər: pasport, fotolar, CV, diplom və sertifikatlar, iş arayışları, dil sertifikatları, tibbi sığorta sübutu, əmək müqaviləsi, viza ərizəsi və proses üçün lazım olan digər sənədlər;',
        'Proses məlumatları: müraciətin statusu, səfirlik görüşləri, qərarlar, komandamızla yazışmalar və əməkdaşlarımızın qeydləri;',
        'Müqavilənin elektron imzası: ad, imza təsviri, vaxt, IP ünvanı və brauzer məlumatı (imzanın sübutu);',
        'Təhlükəsizlik məlumatları: aktiv sessiyalar (cihaz növü, IP ünvanı, vaxt), iki faktorlu autentifikasiya aktiv olduqda şifrələnmiş açar.',
      ],
      'Məqsəd yönləndirmə və müşayiət müqaviləsinin icrasıdır; hüquqi əsas DSGVO maddə 6(1)(b)-dir. Qanuni saxlama öhdəliyi olduqda maddə 6(1)(c) tətbiq olunur.',
      'Xüsusi kateqoriyalı şəxsi məlumatlar: sənədləriniz sağlamlıq məlumatları (məs. tibbi arayışlar, sığorta sənədləri) və ya DSGVO-nun 9-cu maddəsində nəzərdə tutulan digər xüsusi kateqoriyalar ehtiva edə bilər. Biz onları yalnız viza və yönləndirmə prosesi üçün, açıq razılığınız əsasında (DSGVO maddə 9(2)(a)) emal edirik; razılığı istənilən vaxt gələcək üçün geri götürə bilərsiniz. [Razılıq mətnini və prosesini yoxlayın.]',
      'Bu məlumatların təqdim edilməsi viza prosesi üçün zəruridir. Onlar olmadan sizi yönləndirə və viza ərizəsi hazırlaya bilmərik.',
    ],
  },
  {
    id: 'employers',
    title: 'İşəgötürən hesabları',
    body: [
      'İşəgötürənlər üçün şirkət və əlaqə şəxsi məlumatlarını (şirkət, ünvan, ad, vəzifə, e-poçt, telefon), vakansiyaları, bu vakansiyalara müraciətləri və hesab-faktura məlumatlarını emal edirik. Hüquqi əsas DSGVO maddə 6(1)(b), hesab-fakturalar üçün isə maddə 6(1)(c)-dir.',
    ],
  },
  {
    id: 'recipients',
    title: 'Məlumatlarınızın alıcıları',
    body: [
      'Məlumatlarınızı yalnız göstərilən məqsədlər üçün onlara ehtiyacı olan şəxs və qurumlar alır:',
      [
        'Almaniya və Azərbaycandakı məsul əməkdaşlarımız (rollara görə giriş, əlavə olaraq iki faktorlu autentifikasiya ilə);',
        'müraciət etdiyiniz və ya sizi təklif etdiyimiz Almaniyadakı işəgötürənlər (profil, CV, ixtisas sənədləri);',
        'vizanız üçün lazım olduqda Almaniyanın xarici nümayəndəlikləri (xüsusilə Almaniyanın Bakıdakı səfirliyi), əcnəbilər idarələri, Federal Əmək Agentliyi və xarici peşə ixtisaslarının tanınması üzrə qurumlar;',
        'bizim üçün məlumat emalçısı kimi çalışan texniki xidmət təminatçıları (hostinq, Cloudflare, e-poçt göndərişi, push bildirişlər);',
        'qanunla tələb olunduqda dövlət orqanları və məhkəmələr.',
      ],
    ],
  },
  {
    id: 'transfer',
    title: 'Üçüncü ölkələrə ötürmə',
    body: [
      'Azərbaycandan olan namizədlərlə işlədiyimiz üçün məlumatlar Almaniya ilə Azərbaycan arasında ötürülür (məs. Bakıdakı komandamıza və sizin özünüzə). Azərbaycan üçün Avropa Komissiyasının adekvatlıq qərarı yoxdur. Ötürmə sizinlə bağlanmış müqavilənin icrası üçün zəruri olduğu həddə (DSGVO maddə 49(1)(b)), digər hallarda AB standart müqavilə bəndləri əsasında (maddə 46(2)(c)) həyata keçirilir [yoxlayın].',
      'ABŞ-da yerləşən xidmət təminatçıları (Cloudflare, Akamai/Linode, Expo) üçün ötürmə AB-ABŞ Data Privacy Framework (DSGVO maddə 45) və ya standart müqavilə bəndləri əsasında aparılır.',
    ],
  },
  {
    id: 'email',
    title: 'E-poçt göndərişi',
    body: [
      'Sistem məktublarını (məs. təsdiq linkləri, status dəyişiklikləri, görüş xatırlatmaları) [E-poçt təminatçısını daxil edin] SMTP xidməti vasitəsilə göndəririk. E-poçt ünvanınız, məktubun məzmunu və texniki göndəriş məlumatları emal olunur. Hüquqi əsas DSGVO maddə 6(1)(b)-dir. E-poçt bildirişlərini profilinizdə söndürə bilərsiniz; müqavilə üçün zəruri məktubları (məs. şifrənin bərpası) yenə alacaqsınız.',
    ],
  },
  {
    id: 'push',
    title: 'Mobil tətbiq və push bildirişlər',
    body: [
      'Mobil tətbiq portal ilə eyni məlumatlardan istifadə edir. Push bildirişlərə icazə versəniz, cihazınızın push tokenini və platformanı (iOS/Android) saxlayırıq. Çatdırılma Expo (650 Industries, Inc., ABŞ) push xidməti, həmçinin Apple Push Notification Service və ya Firebase Cloud Messaging (Google) vasitəsilə həyata keçirilir. Hüquqi əsas razılığınızdır (DSGVO maddə 6(1)(a), § 25 Abs. 1 TDDDG); onu istənilən vaxt cihaz və ya profil ayarlarında geri götürə bilərsiniz.',
    ],
  },
  {
    id: 'retention',
    title: 'Saxlama müddəti və silinmə',
    body: [
      'Müraciət çərçivəsində yüklədiyiniz sənədlər (imzalanmış müqavilələr daxil olmaqla) proses başa çatdıqdan (viza verildikdə, rədd edildikdə və ya müraciət ləğv edildikdə) [[months]] ay sonra avtomatik silinir.',
      'Prosesin əsas məlumatlarını (müraciət nömrəsi, status tarixçəsi, qərarlar) fəaliyyətimizi sübut etmək və iddialardan müdafiə üçün ümumi iddia müddəti bitənə qədər (Almaniya Mülki Məcəlləsinin 195, 199-cu paraqrafları, adətən ilin sonundan etibarən üç il) saxlayırıq. Hesab-fakturalar və mühasibat sənədləri § 147 AO və § 257 HGB-yə uyğun olaraq on ilə qədər saxlanılır. [Müddətləri yoxlayın.]',
      'Müştəri hesabınız siz onun silinməsini tələb edənə qədər qalır. Sessiya məlumatları müddəti bitdikdən sonra silinir.',
    ],
  },
  {
    id: 'security',
    title: 'Məlumatların təhlükəsizliyi',
    body: [
      'Bütün bağlantılar TLS ilə şifrələnir. Sənədlər ictimai olmayan yaddaş sahəsində saxlanılır və yalnız sizə və səlahiyyətli əməkdaşlara açıqdır. Əməkdaş hesabları iki faktorlu autentifikasiya ilə qorunur; təhlükəsizliklə bağlı əməliyyatlar jurnala yazılır.',
    ],
  },
  {
    id: 'rights',
    title: 'Hüquqlarınız',
    body: [
      'Sizin aşağıdakı hüquqlarınız var:',
      [
        'saxlanılan məlumatlarınız barədə məlumat almaq (DSGVO maddə 15);',
        'yanlış məlumatların düzəldilməsi (maddə 16);',
        'qanuni saxlama öhdəliyi olmadıqda silinmə (maddə 17);',
        'emalın məhdudlaşdırılması (maddə 18);',
        'məlumatların daşınması (maddə 20);',
        'verilmiş razılığı istənilən vaxt gələcək üçün geri götürmək (maddə 7(3));',
        'məlumatların mühafizəsi üzrə nəzarət orqanına şikayət etmək (maddə 77).',
      ],
      'Etiraz hüququ (DSGVO maddə 21): məlumatları qanuni maraq əsasında (maddə 6(1)(f)) emal etdiyimiz hallarda, xüsusi vəziyyətinizlə bağlı səbəblərə görə istənilən vaxt etiraz edə bilərsiniz.',
      'Hüquqlarınızdan istifadə etmək üçün [[email]] ünvanına yazmağınız kifayətdir.',
      'Səlahiyyətli nəzarət orqanı: [[supervisory]]',
    ],
  },
  {
    id: 'dpo',
    title: 'Məlumatların mühafizəsi üzrə məsul şəxs',
    body: [
      '[Məlumatların mühafizəsi üzrə məsul şəxsin təyin edilməsi öhdəliyinin olub-olmadığını yoxlayın (§ 38 BDSG, DSGVO maddə 37 – məs. xüsusi kateqoriyalı məlumatların geniş emalı zamanı). Təyin edilibsə, ad və əlaqə məlumatlarını burada göstərin.] O vaxta qədər [[email]] ünvanına müraciət edin.',
    ],
  },
  {
    id: 'automated',
    title: 'Avtomatlaşdırılmış qərar qəbulu yoxdur',
    body: [
      'Biz yalnız avtomatlaşdırılmış emala əsaslanan qərarlar qəbul etmirik (DSGVO maddə 22). Saytımızdakı uyğunluq testi yalnız ilkin istiqamət verir; nəticələr brauzerinizdə hesablanır.',
    ],
  },
  {
    id: 'changes',
    title: 'Dəyişikliklər',
    body: ['Xidmətimiz və ya qanunvericilik dəyişdikdə bu məxfilik siyasətini yeniləyirik. Burada dərc olunmuş versiya qüvvədədir.'],
  },
];

const deSections: PolicySection[] = [
  {
    id: 'general',
    title: 'Allgemeine Hinweise',
    body: [
      'Diese Datenschutzerklärung informiert Sie gemäß Art. 13 und 14 DSGVO darüber, welche personenbezogenen Daten wir verarbeiten, wenn Sie unsere Website triad-vision.de, unser Bewerber- und Arbeitgeberportal sowie unsere mobile App nutzen, zu welchen Zwecken und auf welcher Rechtsgrundlage dies geschieht und welche Rechte Ihnen zustehen.',
      'Triad Vision vermittelt Fachkräfte aus Aserbaidschan an Arbeitgeber in Deutschland und begleitet das Visumverfahren. Dafür ist die Verarbeitung umfangreicher Bewerberdaten erforderlich. Wir verarbeiten nur die Daten, die für diese Zwecke notwendig sind.',
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting und Server',
    body: [
      'Unsere Website, die Programmierschnittstelle (API) und alle hochgeladenen Dokumente werden auf Servern der Akamai Technologies, Inc. (Linode), 145 Broadway, Cambridge, MA 02142, USA, betrieben. Standort des Rechenzentrums: [Hosting-Anbieter und Rechenzentrumsstandort prüfen, z. B. Frankfurt am Main]. Mit dem Anbieter besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO [prüfen].',
      'Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren und zuverlässigen Betrieb) bzw. Art. 6 Abs. 1 lit. b DSGVO, soweit die Verarbeitung der Durchführung unseres Vertrags mit Ihnen dient.',
    ],
  },
  {
    id: 'cloudflare',
    title: 'Cloudflare (Content Delivery Network und Sicherheit)',
    body: [
      'Zum Schutz vor Angriffen und zur schnelleren Auslieferung wird der gesamte Datenverkehr über das Netzwerk der Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA, geleitet. Cloudflare verarbeitet dabei technische Verbindungsdaten (insbesondere IP-Adresse, aufgerufene URL, Browserinformationen, Zeitpunkt).',
      'Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt in der Sicherheit und Verfügbarkeit unseres Angebots. Cloudflare ist unter dem EU-US Data Privacy Framework zertifiziert; ergänzend gelten Standardvertragsklauseln. Mit Cloudflare besteht ein Vertrag zur Auftragsverarbeitung [prüfen].',
    ],
  },
  {
    id: 'logs',
    title: 'Server-Logfiles',
    body: [
      'Bei jedem Aufruf werden automatisch folgende Daten erfasst:',
      [
        'IP-Adresse',
        'Datum und Uhrzeit des Zugriffs',
        'aufgerufene Seite bzw. Schnittstelle',
        'HTTP-Statuscode und übertragene Datenmenge',
        'Referrer-URL (zuvor besuchte Seite)',
        'Browser und Betriebssystem (User-Agent)',
      ],
      'Diese Daten dienen ausschließlich der Gewährleistung eines störungsfreien Betriebs und der Abwehr von Angriffen (Art. 6 Abs. 1 lit. f DSGVO). Sie werden nicht mit anderen Datenquellen zusammengeführt und nach [Speicherdauer der Logfiles prüfen, z. B. 14 Tagen] gelöscht.',
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies und lokale Speicherung',
    body: [
      'Wir verwenden keine Tracking-, Werbe- oder Analyse-Cookies. Auf Ihrem Endgerät werden ausschließlich technisch unbedingt erforderliche Informationen gespeichert:',
      [
        'tv_session – Sitzungs-Cookie (httpOnly) nach der Anmeldung; er verliert nach 30 Minuten Inaktivität, spätestens nach 12 Stunden seine Gültigkeit.',
        'tv_lang – die gewählte Sprache (Local Storage).',
        'tv_ref – nur wenn Sie über einen Empfehlungslink (?ref=CODE) kommen: der Code des Agenten oder der Kundin bzw. des Kunden, die Sie eingeladen haben, damit die Empfehlung bei der Registrierung zugeordnet wird; eigenes (First-Party-)Cookie, 60 Tage, nach der Registrierung gelöscht, keine Weitergabe an Dritte.',
        'Darstellungs- und Barrierefreiheitseinstellungen (z. B. dunkles Design, Schriftgröße) sowie die Information, dass Sie den Cookie-Hinweis gesehen haben (Local Storage).',
        'In der mobilen App: Ihr Anmelde-Token im verschlüsselten Speicher des Geräts (Keychain/Keystore).',
      ],
      'Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG (ehemals TTDSG) sowie Art. 6 Abs. 1 lit. b und f DSGVO. Eine Einwilligung ist hierfür nicht erforderlich.',
    ],
  },
  {
    id: 'analytics',
    title: 'Reichweitenmessung ohne Cookies',
    body: [
      'Wir nutzen Cloudflare Web Analytics. Dabei werden keine Cookies gesetzt und keine Nutzerprofile gebildet; erfasst werden nur zusammengefasste Angaben wie aufgerufene Seiten, Ladezeiten, Herkunftsland und Browsertyp. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.',
      'Zusätzlich zählen wir auf unserem eigenen Server Besuche je Tag und Herkunftsquelle (z. B. Suchmaschine, soziales Netzwerk). Dabei wird nichts gespeichert, was Sie identifiziert; die IP-Adresse wird nur kurzzeitig im Arbeitsspeicher zur Missbrauchsbegrenzung verwendet. Sendet Ihr Browser „Do Not Track“ oder „Global Privacy Control“, wird nichts gezählt.',
    ],
  },
  {
    id: 'external',
    title: 'Externe Inhalte',
    body: [
      [
        'Schriftarten: Die Schriftart Onest wird lokal von unserem eigenen Server geladen. Dabei findet keine Verbindung zu Dritten (z. B. Google) statt.',
        'Bilder: Einige Fotos werden von Servern des Dienstes Unsplash geladen; dabei wird Ihre IP-Adresse an dessen Server übermittelt.',
        'Karte: Auf der Kontaktseite ist eine Karte von OpenStreetMap (OpenStreetMap Foundation, Vereinigtes Königreich) eingebunden; beim Laden werden Ihre IP-Adresse und technische Daten an die OpenStreetMap Foundation übermittelt.',
        'WhatsApp, Telefon und soziale Netzwerke sind nur verlinkt. Daten werden erst übermittelt, wenn Sie einen Link anklicken; dann gelten die Datenschutzbestimmungen des jeweiligen Anbieters.',
      ],
      'Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (ansprechende und funktionsfähige Darstellung unseres Angebots).',
    ],
  },
  {
    id: 'contact',
    title: 'Kontaktformular, Anfragen und Beratungstermine',
    body: [
      'Wenn Sie uns über ein Formular, per E-Mail, Telefon oder WhatsApp kontaktieren, als Arbeitgeber eine Personalanfrage stellen oder einen Beratungstermin buchen, verarbeiten wir Ihre Angaben (z. B. Name, E-Mail-Adresse, Telefonnummer, Unternehmen, Anzahl gesuchter Arbeitskräfte, Nachricht, Wunschtermin), um Ihre Anfrage zu bearbeiten.',
      'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, sofern Ihre Anfrage auf einen Vertragsschluss gerichtet ist, im Übrigen Art. 6 Abs. 1 lit. f DSGVO (Beantwortung von Anfragen). Die Daten werden gelöscht, sobald die Anfrage abschließend bearbeitet ist und keine gesetzlichen Aufbewahrungspflichten bestehen.',
    ],
  },
  {
    id: 'portal',
    title: 'Kundenkonto und Bewerberportal',
    body: [
      'Für die Vermittlung und das Visumverfahren verarbeiten wir in Ihrem Kundenkonto:',
      [
        'Kontodaten: Name, E-Mail-Adresse, Telefonnummer, Passwort (nur als Hashwert), Sprache, Benachrichtigungseinstellungen;',
        'Profildaten: Geburtsdatum, Staatsangehörigkeit, Wohnort und Anschrift, Beruf, Berufserfahrung, Deutschkenntnisse, Ausbildung, Führerscheinklassen, Angaben zu Ihrer Person;',
        'Dokumente: Reisepass, Passfotos, Lebenslauf, Diplome und Zeugnisse, Arbeitszeugnisse, Sprachzertifikate, Krankenversicherungsnachweis, Arbeitsvertrag, Visumantrag und weitere für das Verfahren erforderliche Unterlagen;',
        'Verfahrensdaten: Status Ihres Antrags, Termine bei der Botschaft, Entscheidungen, Nachrichten mit unserem Team und Hinweise unserer Mitarbeiter;',
        'Elektronische Unterzeichnung des Vertrags: Name, Unterschriftsbild, Zeitpunkt, IP-Adresse und Browserkennung (Nachweis der Unterzeichnung);',
        'Sicherheitsdaten: aktive Sitzungen (Gerätetyp, IP-Adresse, Zeitpunkt) und – bei aktivierter Zwei-Faktor-Authentifizierung – das verschlüsselt gespeicherte Geheimnis.',
      ],
      'Zweck ist die Durchführung des Vermittlungs- und Betreuungsvertrags; Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Soweit wir gesetzlich zur Aufbewahrung verpflichtet sind, gilt Art. 6 Abs. 1 lit. c DSGVO.',
      'Besondere Kategorien personenbezogener Daten: Ihre Unterlagen können Gesundheitsdaten (z. B. ärztliche Bescheinigungen, Versicherungsnachweise) oder andere besondere Kategorien im Sinne von Art. 9 DSGVO enthalten. Diese verarbeiten wir ausschließlich für das Visum- und Vermittlungsverfahren auf Grundlage Ihrer ausdrücklichen Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), die Sie jederzeit mit Wirkung für die Zukunft widerrufen können. [Einwilligungstext und -prozess prüfen.]',
      'Die Bereitstellung dieser Daten ist für das Visumverfahren erforderlich. Ohne sie können wir Sie nicht vermitteln und keinen Visumantrag vorbereiten.',
    ],
  },
  {
    id: 'employers',
    title: 'Arbeitgeberkonten',
    body: [
      'Für Arbeitgeber verarbeiten wir Firmen- und Ansprechpartnerdaten (Firma, Anschrift, Name, Funktion, E-Mail-Adresse, Telefonnummer), Stellenangebote, Bewerbungen auf diese Stellen sowie Rechnungsdaten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, für Rechnungen zusätzlich Art. 6 Abs. 1 lit. c DSGVO.',
    ],
  },
  {
    id: 'recipients',
    title: 'Empfänger Ihrer Daten',
    body: [
      'Ihre Daten erhalten nur Personen und Stellen, die sie für die genannten Zwecke benötigen:',
      [
        'unsere zuständigen Mitarbeiterinnen und Mitarbeiter in Deutschland und Aserbaidschan (rollenbasierter Zugriff, zusätzlich mit Zwei-Faktor-Authentifizierung);',
        'Arbeitgeber in Deutschland, bei denen Sie sich bewerben oder für die wir Sie vorschlagen (Profil, Lebenslauf, Qualifikationsnachweise);',
        'deutsche Auslandsvertretungen (insbesondere die Deutsche Botschaft Baku), Ausländerbehörden, die Bundesagentur für Arbeit sowie Stellen für die Anerkennung ausländischer Berufsqualifikationen, soweit dies für Ihr Visum erforderlich ist;',
        'technische Dienstleister, die als Auftragsverarbeiter für uns tätig sind (Hosting, Cloudflare, E-Mail-Versand, Push-Benachrichtigungen);',
        'Behörden und Gerichte, soweit wir gesetzlich dazu verpflichtet sind.',
      ],
    ],
  },
  {
    id: 'transfer',
    title: 'Übermittlung in Drittländer',
    body: [
      'Da wir Bewerberinnen und Bewerber aus Aserbaidschan betreuen, werden Daten zwischen Deutschland und Aserbaidschan übermittelt (z. B. an unser Team in Baku und an Sie selbst). Für Aserbaidschan besteht kein Angemessenheitsbeschluss der EU-Kommission. Die Übermittlung erfolgt, soweit sie für die Erfüllung des mit Ihnen geschlossenen Vertrags erforderlich ist (Art. 49 Abs. 1 lit. b DSGVO), im Übrigen auf Grundlage von EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO) [prüfen].',
      'Bei Dienstleistern mit Sitz in den USA (Cloudflare, Akamai/Linode, Expo) stützt sich die Übermittlung auf das EU-US Data Privacy Framework (Art. 45 DSGVO) bzw. auf Standardvertragsklauseln.',
    ],
  },
  {
    id: 'email',
    title: 'E-Mail-Versand',
    body: [
      'Systemnachrichten (z. B. Bestätigungslinks, Statusänderungen, Terminerinnerungen) versenden wir über den SMTP-Dienst [E-Mail-Anbieter eintragen]. Verarbeitet werden Ihre E-Mail-Adresse, der Inhalt der Nachricht und technische Versanddaten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Benachrichtigungen per E-Mail können Sie in Ihrem Profil abschalten; vertragsnotwendige Nachrichten (z. B. zum Zurücksetzen des Passworts) erhalten Sie weiterhin.',
    ],
  },
  {
    id: 'push',
    title: 'Mobile App und Push-Benachrichtigungen',
    body: [
      'Die mobile App nutzt dieselben Daten wie das Portal. Wenn Sie Push-Benachrichtigungen erlauben, speichern wir das Push-Token Ihres Geräts und die Plattform (iOS/Android). Die Zustellung erfolgt über den Push-Dienst von Expo (650 Industries, Inc., USA) sowie den Apple Push Notification Service bzw. Firebase Cloud Messaging (Google). Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG), die Sie jederzeit in den Geräte- oder Profileinstellungen widerrufen können.',
    ],
  },
  {
    id: 'retention',
    title: 'Speicherdauer und Löschung',
    body: [
      'Dokumente, die Sie im Rahmen eines Antrags hochgeladen haben (einschließlich der unterschriebenen Verträge), werden [[months]] Monate nach Abschluss des Verfahrens (Visum erteilt, abgelehnt oder Antrag storniert) automatisch gelöscht.',
      'Die Eckdaten des Verfahrens (Aktenzeichen, Statusverlauf, Entscheidungen) bewahren wir zum Nachweis unserer Tätigkeit und zur Abwehr von Ansprüchen bis zum Ablauf der regelmäßigen Verjährungsfrist auf (§§ 195, 199 BGB, in der Regel drei Jahre ab Jahresende). Rechnungen und Buchungsbelege speichern wir gemäß § 147 AO und § 257 HGB bis zu zehn Jahre. [Fristen prüfen.]',
      'Ihr Kundenkonto bleibt bestehen, bis Sie seine Löschung verlangen. Sitzungsdaten werden nach ihrem Ablauf gelöscht.',
    ],
  },
  {
    id: 'security',
    title: 'Datensicherheit',
    body: [
      'Alle Verbindungen sind TLS-verschlüsselt. Dokumente liegen in einem nicht öffentlichen Speicherbereich und sind nur für Sie und berechtigte Mitarbeiter abrufbar. Mitarbeiterkonten sind mit Zwei-Faktor-Authentifizierung geschützt; sicherheitsrelevante Vorgänge werden protokolliert.',
    ],
  },
  {
    id: 'rights',
    title: 'Ihre Rechte',
    body: [
      'Sie haben das Recht:',
      [
        'Auskunft über Ihre bei uns gespeicherten Daten zu erhalten (Art. 15 DSGVO);',
        'unrichtige Daten berichtigen zu lassen (Art. 16 DSGVO);',
        'die Löschung Ihrer Daten zu verlangen (Art. 17 DSGVO), soweit keine gesetzliche Aufbewahrungspflicht entgegensteht;',
        'die Einschränkung der Verarbeitung zu verlangen (Art. 18 DSGVO);',
        'Ihre Daten in einem gängigen, maschinenlesbaren Format zu erhalten (Art. 20 DSGVO);',
        'eine erteilte Einwilligung jederzeit mit Wirkung für die Zukunft zu widerrufen (Art. 7 Abs. 3 DSGVO);',
        'sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO).',
      ],
      'Widerspruchsrecht (Art. 21 DSGVO): Soweit wir Daten auf Grundlage berechtigter Interessen (Art. 6 Abs. 1 lit. f DSGVO) verarbeiten, können Sie aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen.',
      'Zur Ausübung Ihrer Rechte genügt eine Nachricht an [[email]].',
      'Zuständige Aufsichtsbehörde: [[supervisory]]',
    ],
  },
  {
    id: 'dpo',
    title: 'Datenschutzbeauftragter',
    body: [
      '[Prüfen, ob eine Pflicht zur Benennung eines Datenschutzbeauftragten besteht (§ 38 BDSG, Art. 37 DSGVO – z. B. bei umfangreicher Verarbeitung besonderer Kategorien personenbezogener Daten). Falls benannt: Name und Kontaktdaten hier eintragen.] Bis dahin wenden Sie sich bitte an [[email]].',
    ],
  },
  {
    id: 'automated',
    title: 'Keine automatisierte Entscheidungsfindung',
    body: [
      'Wir treffen keine Entscheidungen, die ausschließlich auf einer automatisierten Verarbeitung beruhen (Art. 22 DSGVO). Der Eignungs-Check auf unserer Website dient nur der unverbindlichen Orientierung; das Ergebnis wird in Ihrem Browser berechnet.',
    ],
  },
  {
    id: 'changes',
    title: 'Änderungen',
    body: ['Wir passen diese Datenschutzerklärung an, wenn sich unser Angebot oder die Rechtslage ändert. Es gilt die jeweils hier veröffentlichte Fassung.'],
  },
];

const enSections: PolicySection[] = [
  {
    id: 'general',
    title: 'General information',
    body: [
      'In accordance with Art. 13 and 14 GDPR, this privacy policy explains which personal data we process when you use our website triad-vision.de, our candidate and employer portal and our mobile app, for which purposes and on which legal basis, and which rights you have.',
      'Triad Vision places skilled workers from Azerbaijan with employers in Germany and supports the visa process. This requires processing extensive candidate data. We only process data that is necessary for these purposes.',
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting and servers',
    body: [
      'Our website, the API and all uploaded documents run on servers of Akamai Technologies, Inc. (Linode), 145 Broadway, Cambridge, MA 02142, USA. Data centre location: [Check hosting provider and data centre location, e.g. Frankfurt am Main]. A data processing agreement under Art. 28 GDPR is in place with the provider [check].',
      'The legal basis is Art. 6(1)(f) GDPR (legitimate interest in secure and reliable operation) or Art. 6(1)(b) GDPR where processing serves the performance of our contract with you.',
    ],
  },
  {
    id: 'cloudflare',
    title: 'Cloudflare (content delivery network and security)',
    body: [
      'To protect against attacks and deliver pages faster, all traffic is routed through the network of Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA. Cloudflare processes technical connection data (in particular IP address, requested URL, browser information, time).',
      'The legal basis is Art. 6(1)(f) GDPR; our legitimate interest is the security and availability of our service. Cloudflare is certified under the EU-US Data Privacy Framework; standard contractual clauses apply in addition. A data processing agreement with Cloudflare is in place [check].',
    ],
  },
  {
    id: 'logs',
    title: 'Server log files',
    body: [
      'Each request automatically records:',
      [
        'IP address',
        'date and time of access',
        'requested page or endpoint',
        'HTTP status code and amount of data transferred',
        'referrer URL (previous page)',
        'browser and operating system (user agent)',
      ],
      'This data is used solely to ensure trouble-free operation and to defend against attacks (Art. 6(1)(f) GDPR). It is not combined with other data sources and is deleted after [check log retention, e.g. 14 days].',
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies and local storage',
    body: [
      'We do not use tracking, advertising or analytics cookies. Only strictly necessary information is stored on your device:',
      [
        'tv_session – session cookie (httpOnly) after login; it expires after 30 minutes of inactivity and at the latest after 12 hours.',
        'tv_lang – the selected language (local storage).',
        'tv_ref – only when you arrive via a referral link (?ref=CODE): the code of the agent or client who invited you, so the referral is credited at registration; first-party cookie, 60 days, deleted after registration, never shared with third parties.',
        'Display and accessibility settings (e.g. dark mode, font size) and the fact that you have seen the cookie notice (local storage).',
        'In the mobile app: your login token in the device’s encrypted storage (Keychain/Keystore).',
      ],
      'The legal basis is § 25(2) no. 2 TDDDG (formerly TTDSG) and Art. 6(1)(b) and (f) GDPR. No consent is required for this.',
    ],
  },
  {
    id: 'analytics',
    title: 'Cookieless audience measurement',
    body: [
      'We use Cloudflare Web Analytics. It sets no cookies and builds no user profiles; only aggregated information such as pages viewed, load times, country of origin and browser type is collected. The legal basis is Art. 6(1)(f) GDPR.',
      'In addition, our own server counts visits per day and traffic source (e.g. search engine, social network). Nothing that identifies you is stored; the IP address is only held briefly in memory to limit abuse. If your browser sends “Do Not Track” or “Global Privacy Control”, nothing is counted.',
    ],
  },
  {
    id: 'external',
    title: 'External content',
    body: [
      [
        'Fonts: the Onest font is served directly from our own server. No requests are made to third parties (such as Google).',
        'Images: some photos are loaded from Unsplash servers; your IP address is transmitted to those servers.',
        'Map: the contact page embeds an OpenStreetMap map (OpenStreetMap Foundation, United Kingdom); when it loads, your IP address and technical data are transmitted to the OpenStreetMap Foundation.',
        'WhatsApp, phone and social networks are only linked. Data is only transmitted when you click a link; the privacy policy of the respective provider then applies.',
      ],
      'The legal basis is Art. 6(1)(f) GDPR (an appealing and functional presentation of our service).',
    ],
  },
  {
    id: 'contact',
    title: 'Contact forms, inquiries and consultations',
    body: [
      'When you contact us via a form, email, phone or WhatsApp, submit a staffing request as an employer or book a consultation, we process your details (e.g. name, email address, phone number, company, number of workers needed, message, preferred date) to handle your request.',
      'The legal basis is Art. 6(1)(b) GDPR where your request aims at concluding a contract, otherwise Art. 6(1)(f) GDPR (answering inquiries). The data is deleted once the request has been fully handled and no statutory retention obligations apply.',
    ],
  },
  {
    id: 'portal',
    title: 'Customer account and candidate portal',
    body: [
      'For the placement and the visa process we process the following in your account:',
      [
        'Account data: name, email address, phone number, password (hash only), language, notification settings;',
        'Profile data: date of birth, nationality, place of residence and address, profession, work experience, German level, education, driving licence classes, information about yourself;',
        'Documents: passport, photos, CV, diplomas and certificates, employment references, language certificates, proof of health insurance, employment contract, visa application and other documents required for the process;',
        'Process data: status of your application, embassy appointments, decisions, messages with our team and notes from our staff;',
        'Electronic signature of the contract: name, signature image, time, IP address and browser identifier (proof of signing);',
        'Security data: active sessions (device type, IP address, time) and – if two-factor authentication is enabled – the encrypted secret.',
      ],
      'The purpose is the performance of the placement and support contract; the legal basis is Art. 6(1)(b) GDPR. Where we are legally obliged to retain data, Art. 6(1)(c) GDPR applies.',
      'Special categories of personal data: your documents may contain health data (e.g. medical certificates, insurance documents) or other special categories within the meaning of Art. 9 GDPR. We process them solely for the visa and placement process on the basis of your explicit consent (Art. 9(2)(a) GDPR), which you can withdraw at any time with effect for the future. [Check consent wording and process.]',
      'Providing this data is necessary for the visa process. Without it we cannot place you or prepare a visa application.',
    ],
  },
  {
    id: 'employers',
    title: 'Employer accounts',
    body: [
      'For employers we process company and contact person data (company, address, name, position, email address, phone number), job vacancies, applications for these vacancies and invoicing data. The legal basis is Art. 6(1)(b) GDPR and, for invoices, also Art. 6(1)(c) GDPR.',
    ],
  },
  {
    id: 'recipients',
    title: 'Recipients of your data',
    body: [
      'Your data is only shared with people and bodies that need it for the purposes described:',
      [
        'our responsible staff in Germany and Azerbaijan (role-based access, additionally protected by two-factor authentication);',
        'employers in Germany you apply to or to whom we propose you (profile, CV, proof of qualifications);',
        'German diplomatic missions (in particular the German Embassy in Baku), immigration offices, the Federal Employment Agency and bodies for the recognition of foreign qualifications, where necessary for your visa;',
        'technical service providers acting as processors on our behalf (hosting, Cloudflare, email delivery, push notifications);',
        'authorities and courts where we are legally obliged to do so.',
      ],
    ],
  },
  {
    id: 'transfer',
    title: 'Transfers to third countries',
    body: [
      'Because we work with candidates from Azerbaijan, data is transferred between Germany and Azerbaijan (e.g. to our team in Baku and to you). There is no EU Commission adequacy decision for Azerbaijan. Transfers take place where necessary for the performance of the contract concluded with you (Art. 49(1)(b) GDPR), otherwise on the basis of EU standard contractual clauses (Art. 46(2)(c) GDPR) [check].',
      'For service providers based in the USA (Cloudflare, Akamai/Linode, Expo), transfers are based on the EU-US Data Privacy Framework (Art. 45 GDPR) or standard contractual clauses.',
    ],
  },
  {
    id: 'email',
    title: 'Email delivery',
    body: [
      'We send system messages (e.g. confirmation links, status changes, appointment reminders) via the SMTP service [enter email provider]. Your email address, the content of the message and technical delivery data are processed. The legal basis is Art. 6(1)(b) GDPR. You can switch off email notifications in your profile; messages required by the contract (e.g. password reset) will still be sent.',
    ],
  },
  {
    id: 'push',
    title: 'Mobile app and push notifications',
    body: [
      'The mobile app uses the same data as the portal. If you allow push notifications, we store your device’s push token and platform (iOS/Android). Delivery is handled by the Expo push service (650 Industries, Inc., USA) and the Apple Push Notification Service or Firebase Cloud Messaging (Google). The legal basis is your consent (Art. 6(1)(a) GDPR, § 25(1) TDDDG), which you can withdraw at any time in your device or profile settings.',
    ],
  },
  {
    id: 'retention',
    title: 'Retention and deletion',
    body: [
      'Documents you upload for an application (including signed contracts) are deleted automatically [[months]] months after the process is closed (visa granted, refused or application cancelled).',
      'We keep the key data of the process (case number, status history, decisions) as evidence of our work and to defend against claims until the regular limitation period expires (§§ 195, 199 BGB, usually three years from the end of the year). Invoices and accounting records are kept for up to ten years in accordance with § 147 AO and § 257 HGB. [Check periods.]',
      'Your account remains until you request its deletion. Session data is deleted once it has expired.',
    ],
  },
  {
    id: 'security',
    title: 'Data security',
    body: [
      'All connections are TLS-encrypted. Documents are stored in a non-public storage area and can only be accessed by you and authorised staff. Staff accounts are protected by two-factor authentication; security-relevant actions are logged.',
    ],
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: [
      'You have the right to:',
      [
        'access the data we hold about you (Art. 15 GDPR);',
        'have incorrect data rectified (Art. 16 GDPR);',
        'request erasure of your data (Art. 17 GDPR) unless a statutory retention obligation applies;',
        'request restriction of processing (Art. 18 GDPR);',
        'receive your data in a common, machine-readable format (Art. 20 GDPR);',
        'withdraw any consent at any time with effect for the future (Art. 7(3) GDPR);',
        'lodge a complaint with a data protection supervisory authority (Art. 77 GDPR).',
      ],
      'Right to object (Art. 21 GDPR): where we process data on the basis of legitimate interests (Art. 6(1)(f) GDPR), you may object at any time on grounds relating to your particular situation.',
      'To exercise your rights, simply write to [[email]].',
      'Competent supervisory authority: [[supervisory]]',
    ],
  },
  {
    id: 'dpo',
    title: 'Data protection officer',
    body: [
      '[Check whether a data protection officer must be appointed (§ 38 BDSG, Art. 37 GDPR – e.g. for large-scale processing of special categories of personal data). If appointed: enter name and contact details here.] Until then, please contact [[email]].',
    ],
  },
  {
    id: 'automated',
    title: 'No automated decision-making',
    body: [
      'We do not make decisions based solely on automated processing (Art. 22 GDPR). The eligibility check on our website is for non-binding guidance only; the result is calculated in your browser.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes',
    body: ['We update this privacy policy when our service or the law changes. The version published here applies.'],
  },
];

const ruSections: PolicySection[] = [
  {
    id: 'general',
    title: 'Общие сведения',
    body: [
      'В соответствии со ст. 13 и 14 GDPR эта политика объясняет, какие персональные данные мы обрабатываем, когда вы пользуетесь сайтом triad-vision.de, порталом для кандидатов и работодателей и нашим мобильным приложением, с какой целью и на каком правовом основании, а также какие права у вас есть.',
      'Triad Vision трудоустраивает специалистов из Азербайджана у работодателей в Германии и сопровождает визовый процесс. Для этого необходима обработка обширных данных кандидатов. Мы обрабатываем только данные, необходимые для этих целей.',
    ],
  },
  {
    id: 'hosting',
    title: 'Хостинг и серверы',
    body: [
      'Наш сайт, API и все загруженные документы размещены на серверах Akamai Technologies, Inc. (Linode), 145 Broadway, Cambridge, MA 02142, США. Местонахождение дата-центра: [Проверьте хостинг-провайдера и местонахождение дата-центра, напр. Франкфурт-на-Майне]. С провайдером заключён договор об обработке данных по ст. 28 GDPR [проверить].',
      'Правовое основание – ст. 6(1)(f) GDPR (законный интерес в безопасной и надёжной работе) или ст. 6(1)(b) GDPR, если обработка служит исполнению нашего договора с вами.',
    ],
  },
  {
    id: 'cloudflare',
    title: 'Cloudflare (сеть доставки контента и безопасность)',
    body: [
      'Для защиты от атак и ускорения загрузки весь трафик проходит через сеть Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, США. Cloudflare обрабатывает технические данные соединения (в частности, IP-адрес, запрошенный URL, данные браузера, время).',
      'Правовое основание – ст. 6(1)(f) GDPR; наш законный интерес – безопасность и доступность сервиса. Cloudflare сертифицирована по EU-US Data Privacy Framework; дополнительно применяются стандартные договорные условия. С Cloudflare заключён договор об обработке данных [проверить].',
    ],
  },
  {
    id: 'logs',
    title: 'Журналы сервера',
    body: [
      'При каждом обращении автоматически фиксируются:',
      [
        'IP-адрес',
        'дата и время обращения',
        'запрошенная страница или интерфейс',
        'код ответа HTTP и объём переданных данных',
        'адрес предыдущей страницы (referrer)',
        'браузер и операционная система (User-Agent)',
      ],
      'Эти данные используются исключительно для обеспечения бесперебойной работы и защиты от атак (ст. 6(1)(f) GDPR). Они не объединяются с другими данными и удаляются через [проверьте срок хранения журналов, напр. 14 дней].',
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies и локальное хранилище',
    body: [
      'Мы не используем cookies для отслеживания, рекламы или аналитики. На вашем устройстве сохраняются только технически строго необходимые данные:',
      [
        'tv_session – сессионный cookie (httpOnly) после входа; перестаёт действовать после 30 минут бездействия, но не позднее чем через 12 часов.',
        'tv_lang – выбранный язык (Local Storage).',
        'tv_ref – только если вы перешли по реферальной ссылке (?ref=КОД): код агента или клиента, который вас пригласил, чтобы приглашение было учтено при регистрации; собственный (first-party) cookie, 60 дней, удаляется после регистрации, третьим лицам не передаётся.',
        'Настройки отображения и доступности (напр. тёмная тема, размер шрифта), а также отметка о том, что вы видели уведомление о cookies (Local Storage).',
        'В мобильном приложении: ваш токен входа в зашифрованном хранилище устройства (Keychain/Keystore).',
      ],
      'Правовое основание – § 25 Abs. 2 Nr. 2 TDDDG (ранее TTDSG), а также ст. 6(1)(b) и (f) GDPR. Согласие для этого не требуется.',
    ],
  },
  {
    id: 'analytics',
    title: 'Статистика посещений без cookies',
    body: [
      'Мы используем Cloudflare Web Analytics. При этом cookies не устанавливаются и профили пользователей не создаются; собираются только обобщённые сведения: просмотренные страницы, время загрузки, страна и тип браузера. Правовое основание – ст. 6(1)(f) GDPR.',
      'Кроме того, наш собственный сервер считает посещения по дням и источникам (напр. поисковая система, соцсеть). Ничего, что позволяет вас идентифицировать, не сохраняется; IP-адрес лишь кратковременно используется в оперативной памяти для ограничения злоупотреблений. Если ваш браузер отправляет сигнал «Do Not Track» или «Global Privacy Control», посещение не учитывается.',
    ],
  },
  {
    id: 'external',
    title: 'Внешний контент',
    body: [
      [
        'Шрифты: шрифт Onest загружается непосредственно с нашего сервера. Запросы к третьим лицам (например, Google) не выполняются.',
        'Изображения: некоторые фотографии загружаются с серверов сервиса Unsplash; при этом ваш IP-адрес передаётся на эти серверы.',
        'Карта: на странице контактов встроена карта OpenStreetMap (OpenStreetMap Foundation, Великобритания); при её загрузке ваш IP-адрес и технические данные передаются OpenStreetMap Foundation.',
        'WhatsApp, телефон и социальные сети представлены только ссылками. Данные передаются лишь после нажатия на ссылку; тогда действуют правила конфиденциальности соответствующего сервиса.',
      ],
      'Правовое основание – ст. 6(1)(f) GDPR (привлекательное и работоспособное представление нашего сервиса).',
    ],
  },
  {
    id: 'contact',
    title: 'Формы связи, запросы и консультации',
    body: [
      'Когда вы связываетесь с нами через форму, по e-mail, телефону или WhatsApp, отправляете запрос на персонал как работодатель или записываетесь на консультацию, мы обрабатываем ваши данные (напр. имя, e-mail, телефон, компания, число нужных работников, сообщение, желаемое время), чтобы обработать запрос.',
      'Правовое основание – ст. 6(1)(b) GDPR, если запрос направлен на заключение договора, в остальных случаях – ст. 6(1)(f) GDPR (ответ на запросы). Данные удаляются после окончательной обработки запроса, если нет законных обязанностей по хранению.',
    ],
  },
  {
    id: 'portal',
    title: 'Личный кабинет и портал кандидата',
    body: [
      'Для трудоустройства и визового процесса мы обрабатываем в вашем кабинете:',
      [
        'Данные учётной записи: имя, e-mail, телефон, пароль (только в виде хеша), язык, настройки уведомлений;',
        'Данные профиля: дата рождения, гражданство, место жительства и адрес, профессия, опыт работы, уровень немецкого, образование, категории водительских прав, сведения о себе;',
        'Документы: паспорт, фотографии, резюме, дипломы и сертификаты, справки с места работы, языковые сертификаты, подтверждение медицинской страховки, трудовой договор, визовая анкета и другие необходимые документы;',
        'Данные процесса: статус заявки, приёмы в посольстве, решения, переписка с нашей командой и замечания наших сотрудников;',
        'Электронная подпись договора: имя, изображение подписи, время, IP-адрес и данные браузера (подтверждение подписания);',
        'Данные безопасности: активные сессии (тип устройства, IP-адрес, время) и – при включённой двухфакторной аутентификации – зашифрованный секрет.',
      ],
      'Цель – исполнение договора о трудоустройстве и сопровождении; правовое основание – ст. 6(1)(b) GDPR. Если мы обязаны хранить данные по закону, применяется ст. 6(1)(c) GDPR.',
      'Особые категории персональных данных: ваши документы могут содержать данные о здоровье (напр. медицинские справки, страховые документы) или другие особые категории по ст. 9 GDPR. Мы обрабатываем их исключительно для визового процесса и трудоустройства на основании вашего явного согласия (ст. 9(2)(a) GDPR), которое вы можете в любой момент отозвать на будущее. [Проверить текст и процесс получения согласия.]',
      'Предоставление этих данных необходимо для визового процесса. Без них мы не сможем трудоустроить вас и подготовить визовое заявление.',
    ],
  },
  {
    id: 'employers',
    title: 'Учётные записи работодателей',
    body: [
      'Для работодателей мы обрабатываем данные компании и контактного лица (компания, адрес, имя, должность, e-mail, телефон), вакансии, отклики на них и платёжные данные. Правовое основание – ст. 6(1)(b) GDPR, для счетов также ст. 6(1)(c) GDPR.',
    ],
  },
  {
    id: 'recipients',
    title: 'Получатели ваших данных',
    body: [
      'Ваши данные получают только лица и органы, которым они нужны для указанных целей:',
      [
        'наши ответственные сотрудники в Германии и Азербайджане (доступ по ролям, дополнительно защищён двухфакторной аутентификацией);',
        'работодатели в Германии, к которым вы откликаетесь или которым мы вас предлагаем (профиль, резюме, документы о квалификации);',
        'дипломатические представительства Германии (в частности, посольство Германии в Баку), ведомства по делам иностранцев, Федеральное агентство по труду и органы по признанию иностранной квалификации – если это необходимо для визы;',
        'технические подрядчики, обрабатывающие данные по нашему поручению (хостинг, Cloudflare, рассылка e-mail, push-уведомления);',
        'государственные органы и суды, если этого требует закон.',
      ],
    ],
  },
  {
    id: 'transfer',
    title: 'Передача в третьи страны',
    body: [
      'Поскольку мы работаем с кандидатами из Азербайджана, данные передаются между Германией и Азербайджаном (напр. нашей команде в Баку и вам). Решения Еврокомиссии об адекватности уровня защиты для Азербайджана нет. Передача осуществляется, если она необходима для исполнения заключённого с вами договора (ст. 49(1)(b) GDPR), в остальных случаях – на основании стандартных договорных условий ЕС (ст. 46(2)(c) GDPR) [проверить].',
      'Для подрядчиков из США (Cloudflare, Akamai/Linode, Expo) передача основана на EU-US Data Privacy Framework (ст. 45 GDPR) или стандартных договорных условиях.',
    ],
  },
  {
    id: 'email',
    title: 'Рассылка e-mail',
    body: [
      'Системные письма (напр. ссылки для подтверждения, изменения статуса, напоминания о приёмах) мы отправляем через SMTP-сервис [укажите почтового провайдера]. Обрабатываются ваш e-mail, содержание письма и технические данные отправки. Правовое основание – ст. 6(1)(b) GDPR. Уведомления по e-mail можно отключить в профиле; письма, необходимые по договору (напр. восстановление пароля), вы будете получать и дальше.',
    ],
  },
  {
    id: 'push',
    title: 'Мобильное приложение и push-уведомления',
    body: [
      'Мобильное приложение использует те же данные, что и портал. Если вы разрешите push-уведомления, мы сохраним push-токен вашего устройства и платформу (iOS/Android). Доставка осуществляется через push-сервис Expo (650 Industries, Inc., США), а также Apple Push Notification Service или Firebase Cloud Messaging (Google). Правовое основание – ваше согласие (ст. 6(1)(a) GDPR, § 25 Abs. 1 TDDDG), которое вы можете в любой момент отозвать в настройках устройства или профиля.',
    ],
  },
  {
    id: 'retention',
    title: 'Срок хранения и удаление',
    body: [
      'Документы, загруженные в рамках заявки (включая подписанные договоры), автоматически удаляются через [[months]] мес. после завершения процесса (виза выдана, отказ или заявка отменена).',
      'Основные данные процесса (номер дела, история статусов, решения) мы храним для подтверждения нашей работы и защиты от претензий до истечения общего срока исковой давности (§§ 195, 199 BGB, как правило три года с конца года). Счета и бухгалтерские документы хранятся до десяти лет согласно § 147 AO и § 257 HGB. [Проверить сроки.]',
      'Ваша учётная запись сохраняется, пока вы не потребуете её удаления. Данные сессий удаляются после истечения их срока.',
    ],
  },
  {
    id: 'security',
    title: 'Безопасность данных',
    body: [
      'Все соединения шифруются по TLS. Документы хранятся в закрытой области и доступны только вам и уполномоченным сотрудникам. Учётные записи сотрудников защищены двухфакторной аутентификацией; действия, важные для безопасности, протоколируются.',
    ],
  },
  {
    id: 'rights',
    title: 'Ваши права',
    body: [
      'Вы имеете право:',
      [
        'получить информацию о хранящихся у нас данных (ст. 15 GDPR);',
        'потребовать исправления неверных данных (ст. 16 GDPR);',
        'потребовать удаления данных (ст. 17 GDPR), если этому не препятствует законная обязанность хранения;',
        'потребовать ограничения обработки (ст. 18 GDPR);',
        'получить свои данные в распространённом машиночитаемом формате (ст. 20 GDPR);',
        'в любой момент отозвать данное согласие на будущее (ст. 7(3) GDPR);',
        'подать жалобу в надзорный орган по защите данных (ст. 77 GDPR).',
      ],
      'Право на возражение (ст. 21 GDPR): если мы обрабатываем данные на основании законных интересов (ст. 6(1)(f) GDPR), вы можете в любой момент возразить по причинам, связанным с вашей особой ситуацией.',
      'Чтобы воспользоваться своими правами, достаточно написать на [[email]].',
      'Компетентный надзорный орган: [[supervisory]]',
    ],
  },
  {
    id: 'dpo',
    title: 'Уполномоченный по защите данных',
    body: [
      '[Проверить, существует ли обязанность назначить уполномоченного по защите данных (§ 38 BDSG, ст. 37 GDPR – напр. при масштабной обработке особых категорий данных). Если назначен: укажите здесь имя и контакты.] До этого обращайтесь, пожалуйста, на [[email]].',
    ],
  },
  {
    id: 'automated',
    title: 'Без автоматизированного принятия решений',
    body: [
      'Мы не принимаем решений, основанных исключительно на автоматизированной обработке (ст. 22 GDPR). Проверка соответствия на нашем сайте носит лишь ориентировочный характер; результат вычисляется в вашем браузере.',
    ],
  },
  {
    id: 'changes',
    title: 'Изменения',
    body: ['Мы обновляем эту политику при изменении нашего сервиса или законодательства. Действует версия, опубликованная на этой странице.'],
  },
];

const wrap = (sections: PolicySection[]) => ({ legalPages: { privacy: { sections } } });

export const pagesLegalPolicy = { az: wrap(azSections), de: wrap(deSections), en: wrap(enSections), ru: wrap(ruSections) };
