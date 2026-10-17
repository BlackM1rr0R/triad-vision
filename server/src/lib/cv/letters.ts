import { z } from 'zod';
import type { CvData, CvEducation, CvExperience } from './schema.js';
import { EDUCATION_LABEL, byNewest } from './texts.js';

/**
 * Motivation letter template engine (pure). Produces a subject line and an editable body (salutation …
 * closing + name) for a visa application, a job application or a recognition (Anerkennung) request, in
 * German or English. The client's own answers are woven in as written; everything else comes from the
 * profile, the CV, the case and the vacancy. The tone is polite and factual — no exaggerated claims.
 */

export const LETTER_KINDS = ['VISA', 'JOB', 'ANERKENNUNG'] as const;
export type LetterKind = (typeof LETTER_KINDS)[number];
export const LETTER_LANGS = ['de', 'en'] as const;
export type LetterLang = (typeof LETTER_LANGS)[number];

const answer = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

export const letterAnswersSchema = z
  .object({
    whyGermany: answer(1200),
    whyJob: answer(1200),
    experience: answer(1200),
    german: answer(800),
    plans: answer(1200),
    family: answer(800),
    /** free recipient block (one line per row); replaces the default recipient */
    recipient: answer(300),
  })
  .strict();
export type LetterAnswers = z.infer<typeof letterAnswersSchema>;

export interface LetterContext {
  kind: LetterKind;
  language: LetterLang;
  person: {
    firstName: string;
    lastName: string;
    profession?: string | null;
    experienceYears?: number | null;
    germanLevel?: string | null;
    education?: string | null;
    drivingLicence?: string | null;
  };
  cv: CvData;
  caseInfo?: { visaTitle?: string | null; profession?: string | null } | null;
  vacancy?: { title: string; city?: string | null; company?: string | null } | null;
  answers: LetterAnswers;
}

// ─── Text helpers ───────────────────────────────────────────────────────

/** Client text as a sentence: single spaces, capitalised, ending with punctuation. */
export const asSentence = (s: string | null | undefined) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const cap = t[0].toLocaleUpperCase('de-DE') + t.slice(1);
  return /[.!?…)"“”»]$/.test(cap) ? cap : `${cap}.`;
};

const join = (parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export const listJoin = (items: string[], lang: LetterLang) => {
  const xs = items.map((x) => x.trim()).filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? '';
  const and = lang === 'de' ? 'und' : 'and';
  return `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`;
};

const NUM_DE = ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];
const NUM_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const yearsText = (n: number, lang: LetterLang) => {
  if (lang === 'de') return n === 1 ? 'ein Jahr' : `${NUM_DE[n] ?? n} Jahre`;
  return n === 1 ? 'one year' : `${NUM_EN[n] ?? n} years`;
};

const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));

/** Years of experience: the profile value, else the sum of the CV positions. */
export const experienceYearsOf = (ctx: Pick<LetterContext, 'person' | 'cv'>, now = new Date()) => {
  if (ctx.person.experienceYears && ctx.person.experienceYears > 0) return ctx.person.experienceYears;
  const nowM = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const months = ctx.cv.experience.reduce((s, e) => s + Math.max(0, monthsBetween(e.from, e.to ?? nowM)), 0);
  return Math.floor(months / 12);
};

const germanLevelOf = (ctx: LetterContext) => {
  const fromCv = ctx.cv.languages.find((l) => /^(deutsch|german|alman|немецк)/i.test(l.language))?.level;
  const level = fromCv ?? ctx.person.germanLevel ?? null;
  return level && level !== 'none' ? level : null;
};

const professionOf = (ctx: LetterContext) =>
  ctx.caseInfo?.profession?.trim() || ctx.person.profession?.trim() || ctx.cv.headline.trim() || ctx.cv.experience[0]?.title || (ctx.language === 'de' ? 'Fachkraft' : 'skilled worker');

const latestJob = (cv: CvData): CvExperience | null => byNewest(cv.experience)[0] ?? null;
const latestEducation = (cv: CvData): CvEducation | null => byNewest(cv.education, false)[0] ?? null;

const isFeminineInstitution = (s: string) => /universit|schule|akademie|hochschule|fakultät/i.test(s);

// ─── Building blocks ────────────────────────────────────────────────────

const backgroundParagraph = (ctx: LetterContext, profession: string) => {
  const de = ctx.language === 'de';
  const years = experienceYearsOf(ctx);
  const job = latestJob(ctx.cv);
  const edu = latestEducation(ctx.cv);
  const parts: string[] = [];

  if (de) parts.push(years > 0 ? `Ich bin ${profession} und verfüge über ${yearsText(years, 'de')} Berufserfahrung.` : `Mein beruflicher Schwerpunkt liegt im Bereich ${profession}.`);
  else parts.push(years > 0 ? `I am a ${profession} with ${yearsText(years, 'en')} of professional experience.` : `My professional focus is ${profession}.`);

  if (job) {
    const at = job.employer ? (de ? ` bei ${job.employer}` : ` at ${job.employer}`) : '';
    const inCity = job.city ? (de ? ` in ${job.city}` : ` in ${job.city}`) : '';
    if (de) parts.push(job.to ? `Zuletzt war ich als ${job.title}${at}${inCity} tätig.` : `Derzeit arbeite ich als ${job.title}${at}${inCity}.`);
    else parts.push(job.to ? `Most recently I worked as ${job.title}${at}${inCity}.` : `I currently work as ${job.title}${at}${inCity}.`);
    const tasks = job.tasks.slice(0, 3);
    if (tasks.length) {
      if (de) parts.push(`Zu meinen Aufgaben ${job.to ? 'gehörten' : 'gehören'} unter anderem ${listJoin(tasks, 'de')}.`);
      else parts.push(`My responsibilities ${job.to ? 'included' : 'include'} ${listJoin(tasks, 'en')}.`);
    }
  }

  const degree = edu?.degree || (ctx.person.education ? EDUCATION_LABEL[ctx.language][ctx.person.education] : '');
  if (degree) {
    const field = edu?.field ? (de ? ` im Bereich ${edu.field}` : ` in ${edu.field}`) : '';
    const inst = edu?.institution ? (de ? (isFeminineInstitution(edu.institution) ? ` an der ${edu.institution}` : ` (${edu.institution})`) : ` at ${edu.institution}`) : '';
    const year = edu?.to ? ` ${de ? 'im Jahr' : 'in'} ${edu.to.slice(0, 4)}` : '';
    parts.push(de ? `Meine Ausbildung habe ich mit dem Abschluss „${degree}“${field}${inst}${year} abgeschlossen.` : `I completed my education with the qualification "${degree}"${field}${inst}${year}.`);
  }
  if (ctx.answers.experience) parts.push(asSentence(ctx.answers.experience));
  return join(parts);
};

const languageAndPlansParagraph = (ctx: LetterContext, extras: string[] = []) => {
  const de = ctx.language === 'de';
  const level = germanLevelOf(ctx);
  const parts: string[] = [];
  if (level === 'native') parts.push(de ? 'Deutsch spreche ich auf muttersprachlichem Niveau.' : 'I speak German at native level.');
  else if (level)
    parts.push(
      de
        ? `Meine Deutschkenntnisse entsprechen derzeit dem Niveau ${level} des Gemeinsamen Europäischen Referenzrahmens.`
        : `My German currently corresponds to level ${level} of the Common European Framework of Reference.`,
    );
  else parts.push(de ? 'Ich lerne derzeit Deutsch und setze den Sprachunterricht konsequent fort.' : 'I am currently learning German and continue my language classes consistently.');
  if (ctx.answers.german) parts.push(asSentence(ctx.answers.german));
  parts.push(...extras);
  parts.push(
    ctx.answers.plans
      ? asSentence(ctx.answers.plans)
      : de
        ? 'Nach meiner Ankunft möchte ich mich zügig einarbeiten, meine Sprachkenntnisse weiter verbessern und mich aktiv in das gesellschaftliche Leben einbringen.'
        : 'After my arrival I would like to settle into my work quickly, keep improving my German and take an active part in community life.',
  );
  if (ctx.answers.family) parts.push(asSentence(ctx.answers.family));
  return join(parts);
};

const skillsSentence = (ctx: LetterContext) => {
  const de = ctx.language === 'de';
  const out: string[] = [];
  const skills = ctx.cv.skills.slice(0, 4);
  if (skills.length) out.push(de ? `Darüber hinaus bringe ich Kenntnisse in folgenden Bereichen mit: ${skills.join(', ')}.` : `In addition, I bring skills in the following areas: ${skills.join(', ')}.`);
  const licences = ctx.cv.drivingLicences.length ? ctx.cv.drivingLicences : (ctx.person.drivingLicence ?? '').split(/[,;\s/]+/).filter(Boolean);
  if (licences.length) out.push(de ? `Ich besitze einen Führerschein der Klasse${licences.length > 1 ? 'n' : ''} ${licences.join(', ')}.` : `I hold a driving licence (category ${licences.join(', ')}).`);
  return out;
};

// ─── Templates ──────────────────────────────────────────────────────────

const visaLetter = (ctx: LetterContext, profession: string) => {
  const de = ctx.language === 'de';
  const visa = ctx.caseInfo?.visaTitle?.trim();
  const v = ctx.vacancy;
  const title = de
    ? `Motivationsschreiben zum Antrag auf ein nationales Visum${visa ? ` – ${visa}` : ''}`
    : `Letter of motivation – application for a national visa${visa ? ` – ${visa}` : ''}`;
  const offer = v
    ? de
      ? ` Konkret geht es um die Stelle als ${v.title}${v.city ? ` in ${v.city}` : ''}${v.company ? ` bei ${v.company}` : ''}.`
      : ` Specifically, this concerns the position of ${v.title}${v.city ? ` in ${v.city}` : ''}${v.company ? ` with ${v.company}` : ''}.`
    : '';
  const p1 = de
    ? `hiermit beantrage ich ein nationales Visum${visa ? ` der Kategorie „${visa}“` : ''}, um in Deutschland als ${profession} zu arbeiten.${offer} Mit diesem Schreiben möchte ich Ihnen meine Beweggründe, meinen beruflichen Werdegang und meine Pläne für den Aufenthalt in Deutschland kurz darlegen.`
    : `I hereby apply for a national visa${visa ? ` in the category "${visa}"` : ''} in order to work in Germany as a ${profession}.${offer} With this letter I would like to briefly explain my motivation, my professional background and my plans for my stay in Germany.`;
  const p3 = join([
    ctx.answers.whyGermany
      ? asSentence(ctx.answers.whyGermany)
      : de
        ? 'Deutschland ist für mich attraktiv, weil in meinem Beruf qualifizierte Fachkräfte gesucht werden und ich mich hier in einem verlässlichen, gut organisierten Arbeitsumfeld weiterentwickeln kann.'
        : 'Germany appeals to me because qualified professionals are needed in my field and I can develop further in a reliable, well-organised working environment.',
    ctx.answers.whyJob
      ? asSentence(ctx.answers.whyJob)
      : de
        ? `Die Tätigkeit als ${profession} entspricht meiner Ausbildung und meiner bisherigen Erfahrung, sodass ich meine Kenntnisse sinnvoll einbringen kann.`
        : `Working as a ${profession} matches my training and experience, so I can put my knowledge to good use.`,
  ]);
  const p5 = de
    ? 'Ich versichere, dass meine Angaben vollständig und wahrheitsgemäß sind. Die erforderlichen Unterlagen reiche ich mit meinem Antrag ein. Für Rückfragen stehe ich Ihnen jederzeit gern zur Verfügung und bedanke mich für die Prüfung meines Antrags.'
    : 'I confirm that the information I have provided is complete and true. I am submitting the required documents together with my application. Please do not hesitate to contact me if you have any questions; thank you for considering my application.';
  return { title, paragraphs: [p1, backgroundParagraph(ctx, profession), p3, languageAndPlansParagraph(ctx), p5] };
};

const jobLetter = (ctx: LetterContext, profession: string) => {
  const de = ctx.language === 'de';
  const v = ctx.vacancy;
  const position = v?.title || profession;
  const title = de ? `Bewerbung als ${position}${v?.city ? ` in ${v.city}` : ''}` : `Application for the position of ${position}${v?.city ? ` in ${v.city}` : ''}`;
  const p1 = v
    ? de
      ? `über Triad Vision bin ich auf Ihre Stelle als ${v.title}${v.city ? ` in ${v.city}` : ''} aufmerksam geworden. Da die Aufgaben gut zu meiner Ausbildung und meiner bisherigen Erfahrung passen, bewerbe ich mich hiermit um diese Position.`
      : `Through Triad Vision I learned about your vacancy for a ${v.title}${v.city ? ` in ${v.city}` : ''}. As the tasks match my training and experience well, I would like to apply for this position.`
    : de
      ? `hiermit bewerbe ich mich bei Ihnen um eine Stelle als ${profession}. Gern möchte ich meine Erfahrung in Ihrem Unternehmen einbringen.`
      : `I would like to apply for a position as a ${profession} with your company and contribute my experience to your team.`;
  const p3 = join([
    ctx.answers.whyJob
      ? asSentence(ctx.answers.whyJob)
      : de
        ? 'An dieser Stelle schätze ich besonders, dass ich meine praktische Erfahrung direkt einbringen und zugleich neue Arbeitsweisen kennenlernen kann.'
        : 'What I value about this position is that I can apply my practical experience directly while learning new ways of working.',
    ctx.answers.whyGermany && asSentence(ctx.answers.whyGermany),
  ]);
  const p5 = de
    ? 'Meinen Lebenslauf finden Sie in der Anlage. Über die Einladung zu einem persönlichen Gespräch, gern auch per Video, würde ich mich sehr freuen.'
    : 'Please find my CV attached. I would be very pleased to be invited to an interview, also by video if convenient.';
  return { title, paragraphs: [p1, backgroundParagraph(ctx, profession), p3, languageAndPlansParagraph(ctx, skillsSentence(ctx)), p5] };
};

const recognitionLetter = (ctx: LetterContext, profession: string) => {
  const de = ctx.language === 'de';
  const edu = latestEducation(ctx.cv);
  const title = de ? `Antrag auf Anerkennung meiner ausländischen Berufsqualifikation als ${profession}` : `Application for recognition of my foreign professional qualification as ${profession}`;
  const where = edu?.country ? (de ? `in ${edu.country}` : `in ${edu.country}`) : de ? 'im Ausland' : 'abroad';
  const qual = edu ? ` („${edu.degree}“${edu.institution ? `, ${edu.institution}` : ''}${edu.to ? `, ${edu.to.slice(0, 4)}` : ''})` : '';
  const qualEn = edu ? ` ("${edu.degree}"${edu.institution ? `, ${edu.institution}` : ''}${edu.to ? `, ${edu.to.slice(0, 4)}` : ''})` : '';
  const p1 = de
    ? `hiermit beantrage ich die Feststellung der Gleichwertigkeit meiner ${where} erworbenen Berufsqualifikation${qual} mit dem deutschen Referenzberuf ${profession}.`
    : `I hereby apply for an assessment of the equivalence of my professional qualification obtained ${where}${qualEn} with the German reference occupation of ${profession}.`;
  const p3 = join([
    ctx.answers.whyJob
      ? asSentence(ctx.answers.whyJob)
      : de
        ? 'Die Anerkennung ist für mich die Voraussetzung, um in Deutschland in meinem erlernten Beruf arbeiten zu können.'
        : 'Recognition is the prerequisite for me to work in Germany in the occupation I have trained for.',
    ctx.answers.whyGermany && asSentence(ctx.answers.whyGermany),
  ]);
  const p5 = de
    ? 'Die erforderlichen Nachweise (Abschlusszeugnis, Fächer- und Notenübersicht sowie Nachweise über meine Berufserfahrung) reiche ich in Kopie mit deutscher Übersetzung ein. Sollten weitere Unterlagen benötigt werden, reiche ich diese gern nach. Für Rückfragen stehe ich Ihnen jederzeit zur Verfügung.'
    : 'I am submitting the required documents (certificate, transcript of subjects and grades, and proof of my work experience) as copies with German translations. Should further documents be needed, I will gladly provide them. Please do not hesitate to contact me with any questions.';
  return { title, paragraphs: [p1, backgroundParagraph(ctx, profession), p3, languageAndPlansParagraph(ctx), p5] };
};

/** Subject line + body (salutation, 5 paragraphs, closing, name). */
export const buildLetter = (ctx: LetterContext): { title: string; body: string } => {
  const de = ctx.language === 'de';
  const profession = professionOf(ctx);
  const built = ctx.kind === 'VISA' ? visaLetter(ctx, profession) : ctx.kind === 'JOB' ? jobLetter(ctx, profession) : recognitionLetter(ctx, profession);
  const name = `${ctx.person.firstName} ${ctx.person.lastName}`.trim();
  const body = [de ? 'Sehr geehrte Damen und Herren,' : 'Dear Sir or Madam,', ...built.paragraphs.filter(Boolean), `${de ? 'Mit freundlichen Grüßen' : 'Yours faithfully,'}\n\n${name}`].join('\n\n');
  return { title: built.title.slice(0, 200), body };
};

/** Recipient block of the letter (the client's own text wins). */
export const letterRecipient = (kind: LetterKind, lang: LetterLang, vacancy: LetterContext['vacancy'], answers: LetterAnswers): string[] => {
  if (answers.recipient) return answers.recipient.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6);
  const de = lang === 'de';
  if (kind === 'VISA') return de ? ['Botschaft der Bundesrepublik Deutschland Baku', 'Visastelle', 'Baku', 'Aserbaidschan'] : ['Embassy of the Federal Republic of Germany Baku', 'Visa Section', 'Baku', 'Azerbaijan'];
  if (kind === 'JOB') {
    const lines = vacancy?.company ? [vacancy.company, de ? 'Personalabteilung' : 'Human Resources'] : [de ? 'Personalabteilung' : 'Human Resources'];
    if (vacancy?.city) lines.push(vacancy.city);
    return lines;
  }
  return de ? ['Zuständige Anerkennungsstelle', 'Deutschland'] : ['Competent recognition authority', 'Germany'];
};
