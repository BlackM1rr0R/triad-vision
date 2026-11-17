// /r/rate/:token — the one-click satisfaction rating of the Google review request (lib/googleReview on the API).
// Not registered with i18next: the page speaks the language the request was sent in (the client's locale from
// the API), which can differ from the browser's UI language. az / de / en / ru (User.locale), else English.
const az = {
  title: 'Triad Vision ilə təcrübəniz necə idi?',
  hello: 'Salam, {{name}}!',
  question: 'Bizimlə işləməkdən nə dərəcədə razı qaldınız?',
  labels: ['Heç razı deyiləm', 'Razı deyiləm', 'Orta', 'Razıyam', 'Çox razıyam'],
  saving: 'Yadda saxlanılır…',
  thanks: 'Qiymətləndirdiyiniz üçün təşəkkür edirik!',
  change: 'Qiyməti dəyişmək üçün başqa rəqəmə klikləyin.',
  highTitle: 'Bunu Google-da da paylaşarsınız?',
  highText: 'Bir neçə cümlə Almaniyaya yol axtaran başqa insanlara çox kömək edir. Cəmi bir dəqiqə çəkir.',
  lowTitle: 'Təəssüf ki, hər şey istədiyiniz kimi olmayıb',
  lowText: 'Nəyin yaxşı getmədiyini yazın — bunu yalnız komandamız görəcək və sizinlə əlaqə saxlayacağıq.',
  feedbackLabel: 'Sizin rəyiniz (yalnız komanda üçün)',
  feedbackSend: 'Göndər',
  feedbackDone: 'Təşəkkür edirik! Komandamız tezliklə sizinlə əlaqə saxlayacaq.',
  publicNote: 'Təcrübənizi açıq şəkildə Google-da da paylaşa bilərsiniz — hər bir fikir bizim üçün dəyərlidir.',
  google: 'Google-da rəy yazın',
  direct: 'Qiymət vermədən birbaşa Google-da rəy yazmaq da olar:',
  optOut: 'Belə xahişlər almaq istəmirəm',
  invalid: 'Link səhvdir və ya köhnəlib.',
  error: 'Alınmadı. Yenidən cəhd edin.',
  home: 'Ana səhifəyə',
  demo: 'Bu, nümunə səhifədir (test e-poçtu) — heç nə yadda saxlanılmır.',
  redirect: 'Google-a yönləndirilir…',
};
type Copy = typeof az;

const de: Copy = {
  title: 'Wie war Ihre Erfahrung mit Triad Vision?',
  hello: 'Hallo {{name}}!',
  question: 'Wie zufrieden sind Sie mit unserer Zusammenarbeit?',
  labels: ['Gar nicht zufrieden', 'Unzufrieden', 'Neutral', 'Zufrieden', 'Sehr zufrieden'],
  saving: 'Wird gespeichert…',
  thanks: 'Vielen Dank für Ihre Bewertung!',
  change: 'Zum Ändern einfach eine andere Zahl anklicken.',
  highTitle: 'Teilen Sie das auch auf Google?',
  highText: 'Ein paar Sätze helfen anderen Menschen auf ihrem Weg nach Deutschland sehr. Es dauert nur eine Minute.',
  lowTitle: 'Das tut uns leid',
  lowText: 'Schreiben Sie uns, was nicht gut lief — nur unser Team sieht das, und wir melden uns bei Ihnen.',
  feedbackLabel: 'Ihre Rückmeldung (nur für unser Team)',
  feedbackSend: 'Senden',
  feedbackDone: 'Danke! Unser Team meldet sich bald bei Ihnen.',
  publicNote: 'Sie können Ihre Erfahrung auch öffentlich auf Google teilen — jede Meinung ist uns wichtig.',
  google: 'Bewertung auf Google schreiben',
  direct: 'Sie können auch ohne Bewertung hier direkt auf Google schreiben:',
  optOut: 'Ich möchte keine solchen Anfragen erhalten',
  invalid: 'Der Link ist falsch oder veraltet.',
  error: 'Das hat nicht geklappt. Bitte erneut versuchen.',
  home: 'Zur Startseite',
  demo: 'Dies ist eine Beispielseite (Test-E-Mail) — es wird nichts gespeichert.',
  redirect: 'Weiterleitung zu Google…',
};

const en: Copy = {
  title: 'How was your experience with Triad Vision?',
  hello: 'Hello {{name}}!',
  question: 'How satisfied are you with working with us?',
  labels: ['Not satisfied at all', 'Not satisfied', 'Neutral', 'Satisfied', 'Very satisfied'],
  saving: 'Saving…',
  thanks: 'Thank you for your rating!',
  change: 'To change it, just click another number.',
  highTitle: 'Would you share it on Google too?',
  highText: 'A few sentences help other people on their way to Germany a lot. It only takes a minute.',
  lowTitle: 'We are sorry to hear that',
  lowText: 'Tell us what went wrong — only our team sees this, and we will get back to you.',
  feedbackLabel: 'Your feedback (for our team only)',
  feedbackSend: 'Send',
  feedbackDone: 'Thank you! Our team will get in touch soon.',
  publicNote: 'You are also welcome to share your experience publicly on Google — every opinion matters to us.',
  google: 'Write a Google review',
  direct: 'You can also go straight to Google without rating here:',
  optOut: 'I do not want such requests',
  invalid: 'The link is wrong or outdated.',
  error: 'That did not work. Please try again.',
  home: 'Home page',
  demo: 'This is a sample page (test e-mail) — nothing is saved.',
  redirect: 'Redirecting to Google…',
};

const ru: Copy = {
  title: 'Как вам работа с Triad Vision?',
  hello: 'Здравствуйте, {{name}}!',
  question: 'Насколько вы довольны работой с нами?',
  labels: ['Совсем не доволен', 'Не доволен', 'Нейтрально', 'Доволен', 'Очень доволен'],
  saving: 'Сохраняем…',
  thanks: 'Спасибо за оценку!',
  change: 'Чтобы изменить оценку, нажмите другую цифру.',
  highTitle: 'Поделитесь этим и в Google?',
  highText: 'Несколько предложений очень помогут другим людям на пути в Германию. Это займёт минуту.',
  lowTitle: 'Нам очень жаль',
  lowText: 'Напишите, что пошло не так, — это увидит только наша команда, и мы с вами свяжемся.',
  feedbackLabel: 'Ваш отзыв (только для команды)',
  feedbackSend: 'Отправить',
  feedbackDone: 'Спасибо! Наша команда скоро свяжется с вами.',
  publicNote: 'Вы также можете открыто поделиться опытом в Google — нам важно любое мнение.',
  google: 'Написать отзыв в Google',
  direct: 'Можно и сразу написать отзыв в Google, без оценки здесь:',
  optOut: 'Я не хочу получать такие просьбы',
  invalid: 'Ссылка неверна или устарела.',
  error: 'Не получилось. Попробуйте ещё раз.',
  home: 'На главную',
  demo: 'Это пример страницы (тестовое письмо) — ничего не сохраняется.',
  redirect: 'Переход в Google…',
};

export const RATE_COPY = { az, de, en, ru };
export type RateLang = keyof typeof RATE_COPY;
export const rateLang = (l: string | null | undefined): RateLang => {
  const k = (l ?? '').slice(0, 2);
  return k in RATE_COPY ? (k as RateLang) : 'en';
};
