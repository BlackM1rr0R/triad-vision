import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { nextSort, type QuizQuestion } from './service.js';

/**
 * Starter courses for the team (Azerbaijani: the team language). Created by the idempotent
 * "Başlanğıc kurslarını yarat" button in Admin → Təlim: a course whose title already exists is skipped,
 * so pressing it twice never duplicates anything. Courses start as drafts so the admin can review them.
 */

interface StarterLesson {
  title: string;
  minutes: number;
  body: string;
  quiz?: QuizQuestion[];
}
interface StarterCourse {
  title: string;
  description: string;
  required: boolean;
  lessons: StarterLesson[];
}

export const STARTER_COURSES: StarterCourse[] = [
  {
    title: 'Triad Vision: viza müraciəti necə işləyir',
    description: 'Yeni əməkdaş üçün əsas kurs: müraciətin mərhələləri, statuslar, müştəri ilə ünsiyyət və gündəlik iş axını.',
    required: true,
    lessons: [
      {
        title: 'Müraciətin həyat dövrü',
        minutes: 8,
        body: `# Müraciətin həyat dövrü

Hər müştəri üçün sistemdə **bir müraciət** (Case) açılır. Müraciət aşağıdakı statuslardan keçir:

1. **Sənədlər gözlənilir** — müştəri ilkin sənədləri yükləyir.
2. **Sənədlər yoxlanılır** — biz hər sənədi qəbul və ya rədd edirik.
3. **Müqavilə göndərildi / imzalandı** — xidmət müqaviləsi onlayn imzalanır.
4. **Səfirlik sənədləri** — səfirlik paketi üçün əlavə sənədlər toplanır.
5. **Səfirlik yoxlaması** — paket yoxlanılır (dörd göz qaydası!).
6. **Görüş təyin edildi** — səfirlik görüşünün tarixi və yeri qeyd olunur.
7. **Qərar gözlənilir** — müraciət səfirlikdədir.
8. **Təsdiqləndi / Rədd edildi / Ləğv edildi** — müraciət bağlanır.

> Status dəyişdikdə müştəri avtomatik bildiriş alır. Ona görə də statusu yalnız real vəziyyət dəyişəndə dəyişin.

## Kim nəyə cavabdehdir?

- Hər müraciətin **bir məsul əməkdaşı** var (“Məsul”).
- Məzuniyyətdə olanda müraciətlər avtomatik olaraq həmkarlara **ötürülür** və qayıdanda geri qaytarılır.
`,
        quiz: [
          { q: 'Müştəri ilkin sənədləri yüklədikdən sonra müraciət hansı statusa keçir?', options: ['Sənədlər yoxlanılır', 'Görüş təyin edildi', 'Qərar gözlənilir'], answer: 0 },
          { q: 'Status dəyişdikdə nə baş verir?', options: ['Heç nə', 'Müştəri avtomatik bildiriş alır', 'Müraciət silinir'], answer: 1 },
          { q: 'Bir müraciətin neçə məsul əməkdaşı olur?', options: ['Bir', 'İki', 'Hamı'], answer: 0 },
        ],
      },
      {
        title: 'Gündəlik iş: “Bu günkü işim”',
        minutes: 5,
        body: `# Gündəlik iş

Gününüzə **Admin → Bu gün** səhifəsindən başlayın. Orada sizi gözləyən hər şey bir siyahıdadır:

- yoxlanılmalı sənədlər,
- cavab gözləyən müraciətlər və məktublar,
- tapşırıqlar, imzalar, konsultasiyalar,
- məzuniyyətdə olan həmkarın sizə ötürdüyü müraciətlər (ötürmə qeydi ilə).

Hər sətirdə birbaşa düymə var: **Qəbul et**, **Rədd et**, **Xatırlat**, **Aç**.

## Qaydalar

- Müştəri mesajına **eyni iş günü** cavab verin.
- Sənədi rədd edəndə səbəbi aydın yazın — müştəri onu öz dilində görür.
- Vaxt uçotu üçün taymeri müraciətin üzərindən başladın.
`,
        quiz: [
          { q: 'Müştəri mesajına nə vaxt cavab verilməlidir?', options: ['Bir həftə ərzində', 'Eyni iş günü', 'Yalnız soruşanda'], answer: 1 },
          { q: 'Sənəd rədd ediləndə nə vacibdir?', options: ['Səbəbi aydın yazmaq', 'Heç nə yazmamaq', 'Müştəriyə zəng etmək məcburidir'], answer: 0 },
        ],
      },
      {
        title: 'Müştəri ilə ünsiyyət',
        minutes: 6,
        body: `# Müştəri ilə ünsiyyət

- Bütün yazışma **müraciətin daxilində** aparılır (portal, WhatsApp, SMS bir yerdə görünür).
- Daxili qeydləri müştəri görmür; açıq mesajları görür — fərqə diqqət edin.
- Müştəri hansı dildə yazırsa, o dildə cavab verin (avtomatik tərcümə köməkçidir).
- Qərar (təsdiq / rədd) haqqında müştəriyə **telefonla da** məlumat verin.

Müraciət bağlandıqdan sonra müştəri məmnuniyyət sorğusu alır — nəticələr sizin KPI kartınızda görünür.
`,
      },
    ],
  },
  {
    title: 'Sənədlər və dörd göz qaydası',
    description: 'Sənədlərin yoxlanması, keyfiyyət tələbləri və səfirlik paketinin ikinci əməkdaş tərəfindən təsdiqi.',
    required: true,
    lessons: [
      {
        title: 'Sənədi necə yoxlamalı',
        minutes: 7,
        body: `# Sənədin yoxlanması

Hər yüklənən sənəd üçün sistem avtomatik yoxlama aparır (bulanıqlıq, kəsilmiş kənarlar, müddət). Siz isə yoxlayırsınız:

| Nə | Necə |
| --- | --- |
| Oxunaqlılıq | Bütün mətn aydın oxunur? |
| Tamlıq | Bütün səhifələr var? |
| Etibarlılıq | Müddəti bitməyib? (pasport ən azı 12 ay) |
| Uyğunluq | Ad, soyad, doğum tarixi pasportla eynidir? |

Uyğun deyilsə — **Rədd et** və səbəbi seçin. Müştəri dərhal yeni nüsxə yükləyə bilər.
`,
        quiz: [
          { q: 'Pasportun müddəti ən azı nə qədər olmalıdır?', options: ['1 ay', '12 ay', 'Fərqi yoxdur'], answer: 1 },
          { q: 'Sənəddəki ad pasportdakından fərqlidirsə nə etməli?', options: ['Qəbul etmək', 'Rədd etmək və səbəbi yazmaq', 'Gözləmək'], answer: 1 },
        ],
      },
      {
        title: 'Dörd göz qaydası',
        minutes: 6,
        body: `# Dörd göz qaydası

Səfirliyə gedən paket **iki fərqli əməkdaş** tərəfindən yoxlanılmalıdır:

1. Məsul əməkdaş paketi hazırlayır və **təsdiqə göndərir**.
2. **Başqa** bir əməkdaş paketi yoxlayır, yoxlama siyahısını keçir və **təsdiq edir** və ya qeydlə geri qaytarır.
3. Yalnız təsdiqdən sonra paket “göndərildi / təqdim edildi” kimi qeyd oluna bilər.

> Öz hazırladığınız paketi özünüz təsdiq edə bilməzsiniz. Bu qayda səhvlərin 90%-ni səfirliyə çatmadan tutur.

Verdiyiniz təsdiqlər KPI kartınızda “Dörd göz təsdiqləri” kimi sayılır.
`,
        quiz: [
          { q: 'Səfirlik paketini kim təsdiq edir?', options: ['Paketi hazırlayan əməkdaşın özü', 'Başqa bir əməkdaş', 'Müştəri'], answer: 1 },
          { q: 'Paket nə vaxt “göndərildi” kimi qeyd oluna bilər?', options: ['Təsdiqdən sonra', 'İstənilən vaxt', 'Müştəri istəyəndə'], answer: 0 },
        ],
      },
      {
        title: 'Orijinallar və məxfilik',
        minutes: 4,
        body: `# Orijinallar və məxfilik

- Müştərinin **orijinal sənədləri** ofisə gələndə “Orijinallar” bölməsində qeyd olunur: kimdə, harada, nə vaxt qaytarılacaq.
- Sənədləri yalnız iş üçün açın — hər baxış müştərinin “Sənədlərimə kim baxıb?” jurnalında görünür.
- Sənədləri şəxsi telefon və ya şəxsi poçtla göndərməyin; yalnız sistem daxilində paylaşın.
`,
      },
    ],
  },
];

/** Creates the starter courses that do not exist yet (matched by title). */
export const createStarterCourses = async (actorId: string | null) => {
  const existing = new Set((await prisma.trainingCourse.findMany({ where: { title: { in: STARTER_COURSES.map((c) => c.title) } }, select: { title: true } })).map((c) => c.title));
  const created: string[] = [];
  for (const c of STARTER_COURSES) {
    if (existing.has(c.title)) continue;
    const course = await prisma.trainingCourse.create({
      data: { title: c.title, description: c.description, required: c.required, published: false, roles: undefined, sortOrder: await nextSort('course'), createdById: actorId },
    });
    await prisma.trainingLesson.createMany({
      data: c.lessons.map((l, i) => ({
        courseId: course.id,
        title: l.title,
        body: l.body,
        minutes: l.minutes,
        sortOrder: i,
        quiz: (l.quiz ?? undefined) as Prisma.InputJsonValue | undefined,
        passScore: 70,
      })),
    });
    created.push(course.id);
  }
  return { created: created.length, skipped: STARTER_COURSES.length - created.length, ids: created };
};
