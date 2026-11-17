/**
 * Grade converter (/grade-converter). All six site languages. Registered with registerCopy(pagesGradeConverter).
 * Keys under gradeConverter.*; gradeConverter.faq is an array (also the FAQPage JSON-LD).
 */
const bandRange = { veryGood: '1,0 – 1,5', good: '1,6 – 2,5', satisfactory: '2,6 – 3,5', sufficient: '3,6 – 4,0', fail: '> 4,0' };
const bandRangeEn = { veryGood: '1.0 – 1.5', good: '1.6 – 2.5', satisfactory: '2.6 – 3.5', sufficient: '3.6 – 4.0', fail: '> 4.0' };

const az = {
  gradeConverter: {
    heroTitle: 'Qiymət çevirici: Azərbaycan qiyməti → alman qiyməti',
    heroSubtitle: 'Məktəb attestatınızı (5 ballıq) və ya universitet qiymətinizi (100 ballıq) alman 1,0–4,0 şkalasına çevirin. Hesablama “modifikasiya olunmuş Bavariya formulu” ilədir və Almaniyada təhsil müraciəti üçündür.',
    form: {
      title: 'Qiymətiniz',
      system: 'Qiymət sistemi',
      max: 'Ən yaxşı qiymət (Nmax)',
      min: 'Ən aşağı keçid qiyməti (Nmin)',
      grade: 'Sizin qiymət / orta bal',
      gradeHint: 'Şkala: ən yaxşı {{max}}, keçid {{min}}.',
      subjects: 'Fənn qiymətləri (istəyə bağlı)',
      subjectsHint: 'Attestatdakı qiymətləri boşluqla yazın — orta balı hesablayaq.',
      useAverage: 'Orta balı götür: {{avg}}',
    },
    systems: {
      azSchool: { label: 'Azərbaycan məktəbi / attestat', scale: '5 ballıq: 5 əla, 3 keçid, 2 qeyri-kafi' },
      azUniversity: { label: 'Azərbaycan universiteti', scale: '100 ballıq: 91–100 əla, 51 keçid' },
      custom: { label: 'Başqa sistem', scale: 'Ən yaxşı və keçid qiymətini özünüz daxil edin' },
    },
    result: {
      title: 'Alman qiyməti (təxmini)',
      raw: 'Formulun dəqiq nəticəsi: {{raw}} — bir onluq rəqəmə qədər kəsilir (yuvarlaqlaşdırılmır).',
      fail: 'Bu qiymət keçid qiymətindən aşağıdır — Almaniyada müsbət qiymətə çevrilmir.',
      invalid: 'Şkala düzgün deyil: ən yaxşı və keçid qiyməti fərqli olmalıdır.',
    },
    bands: { veryGood: 'sehr gut (əla)', good: 'gut (yaxşı)', satisfactory: 'befriedigend (kafi)', sufficient: 'ausreichend (keçid)', fail: 'nicht bestanden (keçməyib)' },
    bandRange,
    formula: {
      title: 'Formul necə işləyir',
      max: 'Nmax = sistemdə ən yaxşı qiymət ({{max}}).',
      min: 'Nmin = ən aşağı keçid qiyməti ({{min}}).',
      d: 'Nd = sizin qiymətiniz ({{d}}).',
      cut: 'Nəticə 1,0 (ən yaxşı) ilə 4,0 (keçid) arasındadır; adətən bir onluq rəqəmə qədər kəsilir.',
    },
    table: { caption: 'Alman qiymət şkalası', de: 'Qiymət', meaning: 'Mənası' },
    official: {
      title: 'Rəsmi çevirmə kimdə?',
      text: 'Rəsmi qiyməti universitet və ya uni-assist müəyyən edir (bəzən Studienkolleg və ya imtahanla). Bəzi universitetlər fərqli qaydalar tətbiq edir. Bu kalkulyator yalnız şansınızı əvvəlcədən qiymətləndirmək üçündür.',
    },
    actions: { study: 'Almaniyada təhsil kataloqu', anerkennung: 'Diplomun tanınması' },
    disclaimer: 'Təxmini istiqamət: modifikasiya olunmuş Bavariya formulu (KMK). Məcburi qiymət universitet və ya uni-assist tərəfindən verilir. Azərbaycan şkalaları 2026-cı ilin noyabrına yoxlanılıb.',
    faq: [
      { q: 'Azərbaycan attestatını alman qiymətinə necə çevirmək olar?', a: 'Modifikasiya olunmuş Bavariya formulu ilə: N = 1 + 3 × (5 − orta bal) / (5 − 3). Məsələn, orta bal 4,5 təxminən 1,7 alman qiymətinə bərabərdir.' },
      { q: 'Universitetin 100 ballıq qiyməti necə çevrilir?', a: 'Ən yaxşı 100, keçid 51 götürülür: N = 1 + 3 × (100 − bal) / 49. 75 bal ≈ 2,5, 91 bal ≈ 1,5.' },
      { q: 'Bu nəticə rəsmidirmi?', a: 'Xeyr. Rəsmi çevirməni universitet və ya uni-assist edir və qaydalar fərqlənə bilər. Nəticə yalnız istiqamət üçündür.' },
    ],
  },
};

const de = {
  gradeConverter: {
    heroTitle: 'Notenumrechnung: aserbaidschanische Noten → deutsche Note',
    heroSubtitle: 'Schulzeugnis (Attestat, 5-Punkte-Skala) oder Hochschulnote (100-Punkte-Skala) mit der modifizierten bayerischen Formel in die deutsche Note 1,0–4,0 umrechnen – für die Studienbewerbung.',
    form: {
      title: 'Ihre Note',
      system: 'Notensystem',
      max: 'Beste Note (Nmax)',
      min: 'Unterste Bestehensnote (Nmin)',
      grade: 'Ihre Note / Durchschnitt',
      gradeHint: 'Skala: beste {{max}}, bestanden ab {{min}}.',
      subjects: 'Fachnoten (optional)',
      subjectsHint: 'Noten aus dem Zeugnis mit Leerzeichen eintragen – wir berechnen den Durchschnitt.',
      useAverage: 'Durchschnitt übernehmen: {{avg}}',
    },
    systems: {
      azSchool: { label: 'Aserbaidschan: Schule / Attestat', scale: '5-Punkte-Skala: 5 sehr gut, 3 bestanden, 2 ungenügend' },
      azUniversity: { label: 'Aserbaidschan: Hochschule', scale: '100-Punkte-Skala: 91–100 sehr gut, ab 51 bestanden' },
      custom: { label: 'Anderes System', scale: 'Beste und unterste Bestehensnote selbst eingeben' },
    },
    result: {
      title: 'Deutsche Note (Schätzung)',
      raw: 'Genaues Ergebnis der Formel: {{raw}} – auf eine Nachkommastelle abgeschnitten (nicht gerundet).',
      fail: 'Die Note liegt unter der Bestehensgrenze – sie ergibt keine deutsche Bestehensnote.',
      invalid: 'Ungültige Skala: beste und unterste Bestehensnote müssen sich unterscheiden.',
    },
    bands: { veryGood: 'sehr gut', good: 'gut', satisfactory: 'befriedigend', sufficient: 'ausreichend', fail: 'nicht bestanden' },
    bandRange,
    formula: {
      title: 'So funktioniert die Formel',
      max: 'Nmax = beste Note im System ({{max}}).',
      min: 'Nmin = unterste Bestehensnote ({{min}}).',
      d: 'Nd = Ihre Note ({{d}}).',
      cut: 'Das Ergebnis liegt zwischen 1,0 (beste) und 4,0 (bestanden); meist wird nach der ersten Nachkommastelle abgeschnitten.',
    },
    table: { caption: 'Deutsche Notenskala', de: 'Note', meaning: 'Bedeutung' },
    official: {
      title: 'Wer rechnet offiziell um?',
      text: 'Die verbindliche Note legt die Hochschule oder uni-assist fest (teils über Studienkolleg oder Feststellungsprüfung). Einzelne Hochschulen haben eigene Regeln. Der Rechner hilft nur, Chancen vorab einzuschätzen.',
    },
    actions: { study: 'Studium in Deutschland', anerkennung: 'Anerkennung' },
    disclaimer: 'Orientierungswert nach der modifizierten bayerischen Formel (KMK). Verbindlich ist nur die Umrechnung der Hochschule bzw. von uni-assist. Aserbaidschanische Skalen geprüft im November 2026.',
    faq: [
      { q: 'Wie rechne ich ein aserbaidschanisches Attestat in eine deutsche Note um?', a: 'Mit der modifizierten bayerischen Formel: N = 1 + 3 × (5 − Durchschnitt) / (5 − 3). Ein Durchschnitt von 4,5 entspricht etwa der deutschen Note 1,7.' },
      { q: 'Wie wird die 100-Punkte-Note einer Hochschule umgerechnet?', a: 'Beste Note 100, bestanden ab 51: N = 1 + 3 × (100 − Punkte) / 49. 75 Punkte ≈ 2,5, 91 Punkte ≈ 1,5.' },
      { q: 'Ist das Ergebnis verbindlich?', a: 'Nein. Verbindlich rechnet die Hochschule oder uni-assist um, die Regeln können abweichen. Das Ergebnis dient der Orientierung.' },
    ],
  },
};

const en = {
  gradeConverter: {
    heroTitle: 'Grade converter: Azerbaijani grades → German grade',
    heroSubtitle: 'Convert your school certificate (attestat, 5-point scale) or university grade (100-point scale) into the German 1.0–4.0 scale with the modified Bavarian formula — for university applications.',
    form: {
      title: 'Your grade',
      system: 'Grading system',
      max: 'Best grade (Nmax)',
      min: 'Lowest pass grade (Nmin)',
      grade: 'Your grade / average',
      gradeHint: 'Scale: best {{max}}, pass from {{min}}.',
      subjects: 'Subject grades (optional)',
      subjectsHint: 'Type the grades from your certificate separated by spaces — we calculate the average.',
      useAverage: 'Use the average: {{avg}}',
    },
    systems: {
      azSchool: { label: 'Azerbaijan: school / attestat', scale: '5-point scale: 5 excellent, 3 pass, 2 fail' },
      azUniversity: { label: 'Azerbaijan: university', scale: '100-point scale: 91–100 excellent, pass from 51' },
      custom: { label: 'Other system', scale: 'Enter the best and the lowest pass grade yourself' },
    },
    result: {
      title: 'German grade (estimate)',
      raw: 'Exact result of the formula: {{raw}} — cut to one decimal (not rounded).',
      fail: 'This grade is below the pass mark — it does not convert into a German pass grade.',
      invalid: 'Invalid scale: the best and the lowest pass grade must differ.',
    },
    bands: { veryGood: 'sehr gut (very good)', good: 'gut (good)', satisfactory: 'befriedigend (satisfactory)', sufficient: 'ausreichend (sufficient)', fail: 'nicht bestanden (fail)' },
    bandRange: bandRangeEn,
    formula: {
      title: 'How the formula works',
      max: 'Nmax = best grade of the system ({{max}}).',
      min: 'Nmin = lowest pass grade ({{min}}).',
      d: 'Nd = your grade ({{d}}).',
      cut: 'The result lies between 1.0 (best) and 4.0 (pass); it is usually cut after the first decimal.',
    },
    table: { caption: 'German grading scale', de: 'Grade', meaning: 'Meaning' },
    official: {
      title: 'Who converts officially?',
      text: 'The binding grade is set by the university or uni-assist (sometimes via a Studienkolleg or an assessment exam). Some universities use their own rules. This calculator only helps you judge your chances beforehand.',
    },
    actions: { study: 'Study in Germany', anerkennung: 'Recognition' },
    disclaimer: 'Orientation value with the modified Bavarian formula (KMK). Only the university’s or uni-assist’s conversion is binding. Azerbaijani scales checked in November 2026.',
    faq: [
      { q: 'How do I convert an Azerbaijani attestat into a German grade?', a: 'With the modified Bavarian formula: N = 1 + 3 × (5 − average) / (5 − 3). An average of 4.5 equals roughly the German grade 1.7.' },
      { q: 'How is a 100-point university grade converted?', a: 'Best grade 100, pass from 51: N = 1 + 3 × (100 − points) / 49. 75 points ≈ 2.5, 91 points ≈ 1.5.' },
      { q: 'Is the result binding?', a: 'No. The university or uni-assist does the binding conversion and rules can differ. The result is for orientation.' },
    ],
  },
};

const ru = {
  gradeConverter: {
    heroTitle: 'Пересчёт оценок: азербайджанская оценка → немецкая',
    heroSubtitle: 'Пересчитайте школьный аттестат (5-балльная шкала) или вузовскую оценку (100-балльная шкала) по модифицированной баварской формуле в немецкую шкалу 1,0–4,0 — для поступления.',
    form: {
      title: 'Ваша оценка',
      system: 'Система оценок',
      max: 'Лучшая оценка (Nmax)',
      min: 'Минимальная проходная (Nmin)',
      grade: 'Ваша оценка / средний балл',
      gradeHint: 'Шкала: лучшая {{max}}, проходная от {{min}}.',
      subjects: 'Оценки по предметам (необязательно)',
      subjectsHint: 'Введите оценки из аттестата через пробел — мы посчитаем средний балл.',
      useAverage: 'Взять средний балл: {{avg}}',
    },
    systems: {
      azSchool: { label: 'Азербайджан: школа / аттестат', scale: '5-балльная: 5 отлично, 3 проходная, 2 неуд.' },
      azUniversity: { label: 'Азербайджан: вуз', scale: '100-балльная: 91–100 отлично, проходной 51' },
      custom: { label: 'Другая система', scale: 'Введите лучшую и проходную оценку сами' },
    },
    result: {
      title: 'Немецкая оценка (оценка)',
      raw: 'Точный результат формулы: {{raw}} — обрезается до одного знака после запятой (без округления).',
      fail: 'Оценка ниже проходной — она не даёт положительной немецкой оценки.',
      invalid: 'Неверная шкала: лучшая и проходная оценки должны различаться.',
    },
    bands: { veryGood: 'sehr gut (отлично)', good: 'gut (хорошо)', satisfactory: 'befriedigend (удовлетворительно)', sufficient: 'ausreichend (достаточно)', fail: 'nicht bestanden (не сдано)' },
    bandRange,
    formula: {
      title: 'Как работает формула',
      max: 'Nmax = лучшая оценка системы ({{max}}).',
      min: 'Nmin = минимальная проходная оценка ({{min}}).',
      d: 'Nd = ваша оценка ({{d}}).',
      cut: 'Результат — от 1,0 (лучшая) до 4,0 (проходная); обычно обрезается после первого знака.',
    },
    table: { caption: 'Немецкая шкала оценок', de: 'Оценка', meaning: 'Значение' },
    official: {
      title: 'Кто пересчитывает официально?',
      text: 'Обязательную оценку устанавливает вуз или uni-assist (иногда через Studienkolleg или экзамен). У отдельных вузов свои правила. Калькулятор помогает лишь заранее оценить шансы.',
    },
    actions: { study: 'Учёба в Германии', anerkennung: 'Признание диплома' },
    disclaimer: 'Ориентировочное значение по модифицированной баварской формуле (KMK). Обязателен только пересчёт вуза или uni-assist. Азербайджанские шкалы проверены в ноябре 2026.',
    faq: [
      { q: 'Как пересчитать азербайджанский аттестат в немецкую оценку?', a: 'По модифицированной баварской формуле: N = 1 + 3 × (5 − средний балл) / (5 − 3). Средний балл 4,5 соответствует примерно немецкой оценке 1,7.' },
      { q: 'Как пересчитывается 100-балльная вузовская оценка?', a: 'Лучшая 100, проходная 51: N = 1 + 3 × (100 − баллы) / 49. 75 баллов ≈ 2,5, 91 балл ≈ 1,5.' },
      { q: 'Результат официальный?', a: 'Нет. Официально пересчитывает вуз или uni-assist, правила могут отличаться. Результат — для ориентира.' },
    ],
  },
};

const tr = {
  gradeConverter: {
    heroTitle: 'Not dönüştürücü: Azerbaycan notu → Alman notu',
    heroSubtitle: 'Okul diplomanızı (attestat, 5’lik sistem) veya üniversite notunuzu (100’lük sistem) değiştirilmiş Bavyera formülüyle Alman 1,0–4,0 ölçeğine çevirin — üniversite başvurusu için.',
    form: {
      title: 'Notunuz',
      system: 'Not sistemi',
      max: 'En iyi not (Nmax)',
      min: 'En düşük geçer not (Nmin)',
      grade: 'Notunuz / ortalamanız',
      gradeHint: 'Ölçek: en iyi {{max}}, geçer not {{min}}.',
      subjects: 'Ders notları (isteğe bağlı)',
      subjectsHint: 'Diplomadaki notları boşlukla yazın — ortalamayı hesaplayalım.',
      useAverage: 'Ortalamayı kullan: {{avg}}',
    },
    systems: {
      azSchool: { label: 'Azerbaycan: okul / attestat', scale: '5’lik: 5 pekiyi, 3 geçer, 2 başarısız' },
      azUniversity: { label: 'Azerbaycan: üniversite', scale: '100’lük: 91–100 pekiyi, 51’den geçer' },
      custom: { label: 'Başka sistem', scale: 'En iyi ve en düşük geçer notu kendiniz girin' },
    },
    result: {
      title: 'Alman notu (tahmin)',
      raw: 'Formülün tam sonucu: {{raw}} — bir ondalığa kesilir (yuvarlanmaz).',
      fail: 'Bu not geçme sınırının altında — Alman geçer notuna çevrilmez.',
      invalid: 'Geçersiz ölçek: en iyi not ile geçer not farklı olmalı.',
    },
    bands: { veryGood: 'sehr gut (pekiyi)', good: 'gut (iyi)', satisfactory: 'befriedigend (orta)', sufficient: 'ausreichend (geçer)', fail: 'nicht bestanden (başarısız)' },
    bandRange,
    formula: {
      title: 'Formül nasıl çalışır',
      max: 'Nmax = sistemdeki en iyi not ({{max}}).',
      min: 'Nmin = en düşük geçer not ({{min}}).',
      d: 'Nd = sizin notunuz ({{d}}).',
      cut: 'Sonuç 1,0 (en iyi) ile 4,0 (geçer) arasındadır; genelde ilk ondalıktan sonra kesilir.',
    },
    table: { caption: 'Alman not ölçeği', de: 'Not', meaning: 'Anlamı' },
    official: {
      title: 'Resmî dönüşümü kim yapar?',
      text: 'Bağlayıcı notu üniversite veya uni-assist belirler (bazen Studienkolleg veya sınavla). Bazı üniversitelerin kendi kuralları vardır. Bu hesaplayıcı yalnızca şansınızı önceden değerlendirmenize yardımcı olur.',
    },
    actions: { study: 'Almanya’da eğitim', anerkennung: 'Diploma denkliği' },
    disclaimer: 'Değiştirilmiş Bavyera formülüne (KMK) göre yön gösterici değer. Yalnızca üniversitenin veya uni-assist’in dönüşümü bağlayıcıdır. Azerbaycan ölçekleri Kasım 2026’da kontrol edildi.',
    faq: [
      { q: 'Azerbaycan attestatını Alman notuna nasıl çeviririm?', a: 'Değiştirilmiş Bavyera formülüyle: N = 1 + 3 × (5 − ortalama) / (5 − 3). 4,5 ortalama yaklaşık Alman notu 1,7’ye denk gelir.' },
      { q: '100’lük üniversite notu nasıl çevrilir?', a: 'En iyi 100, 51’den geçer: N = 1 + 3 × (100 − puan) / 49. 75 puan ≈ 2,5, 91 puan ≈ 1,5.' },
      { q: 'Sonuç bağlayıcı mı?', a: 'Hayır. Bağlayıcı dönüşümü üniversite veya uni-assist yapar, kurallar farklı olabilir. Sonuç yön göstermek içindir.' },
    ],
  },
};

const uk = {
  gradeConverter: {
    heroTitle: 'Перерахунок оцінок: азербайджанська оцінка → німецька',
    heroSubtitle: 'Перерахуйте шкільний атестат (5-бальна шкала) або оцінку вишу (100-бальна шкала) за модифікованою баварською формулою в німецьку шкалу 1,0–4,0 — для вступу.',
    form: {
      title: 'Ваша оцінка',
      system: 'Система оцінювання',
      max: 'Найкраща оцінка (Nmax)',
      min: 'Мінімальна прохідна (Nmin)',
      grade: 'Ваша оцінка / середній бал',
      gradeHint: 'Шкала: найкраща {{max}}, прохідна від {{min}}.',
      subjects: 'Оцінки з предметів (необовʼязково)',
      subjectsHint: 'Введіть оцінки з атестата через пробіл — ми порахуємо середній бал.',
      useAverage: 'Взяти середній бал: {{avg}}',
    },
    systems: {
      azSchool: { label: 'Азербайджан: школа / атестат', scale: '5-бальна: 5 відмінно, 3 прохідна, 2 незадовільно' },
      azUniversity: { label: 'Азербайджан: виш', scale: '100-бальна: 91–100 відмінно, прохідний 51' },
      custom: { label: 'Інша система', scale: 'Введіть найкращу й прохідну оцінку самі' },
    },
    result: {
      title: 'Німецька оцінка (орієнтовно)',
      raw: 'Точний результат формули: {{raw}} — обрізається до одного знака після коми (без округлення).',
      fail: 'Оцінка нижча за прохідну — вона не дає позитивної німецької оцінки.',
      invalid: 'Неправильна шкала: найкраща й прохідна оцінки мають відрізнятися.',
    },
    bands: { veryGood: 'sehr gut (відмінно)', good: 'gut (добре)', satisfactory: 'befriedigend (задовільно)', sufficient: 'ausreichend (достатньо)', fail: 'nicht bestanden (не складено)' },
    bandRange,
    formula: {
      title: 'Як працює формула',
      max: 'Nmax = найкраща оцінка системи ({{max}}).',
      min: 'Nmin = мінімальна прохідна оцінка ({{min}}).',
      d: 'Nd = ваша оцінка ({{d}}).',
      cut: 'Результат — від 1,0 (найкраща) до 4,0 (прохідна); зазвичай обрізається після першого знака.',
    },
    table: { caption: 'Німецька шкала оцінок', de: 'Оцінка', meaning: 'Значення' },
    official: {
      title: 'Хто перераховує офіційно?',
      text: 'Обовʼязкову оцінку встановлює виш або uni-assist (іноді через Studienkolleg чи іспит). Окремі виші мають власні правила. Калькулятор лише допомагає заздалегідь оцінити шанси.',
    },
    actions: { study: 'Навчання в Німеччині', anerkennung: 'Визнання диплома' },
    disclaimer: 'Орієнтовне значення за модифікованою баварською формулою (KMK). Обовʼязковий лише перерахунок вишу або uni-assist. Азербайджанські шкали перевірено в листопаді 2026.',
    faq: [
      { q: 'Як перерахувати азербайджанський атестат у німецьку оцінку?', a: 'За модифікованою баварською формулою: N = 1 + 3 × (5 − середній бал) / (5 − 3). Середній бал 4,5 відповідає приблизно німецькій оцінці 1,7.' },
      { q: 'Як перераховується 100-бальна оцінка вишу?', a: 'Найкраща 100, прохідна 51: N = 1 + 3 × (100 − бали) / 49. 75 балів ≈ 2,5, 91 бал ≈ 1,5.' },
      { q: 'Чи результат офіційний?', a: 'Ні. Офіційно перераховує виш або uni-assist, правила можуть відрізнятися. Результат — для орієнтиру.' },
    ],
  },
};

export const pagesGradeConverter = { az, de, en, ru, tr, uk };
