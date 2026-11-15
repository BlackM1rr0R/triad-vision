import type { PrismaClient } from '@prisma/client';

/**
 * Starter rows of the "Study in Germany" catalogue (/study): eight well-known English-taught master's programmes
 * at public universities. Every fact was read on the university's own pages on 2026-11-15 (sources in staffNote;
 * no DAAD / uni-assist / aggregator data). Created UNPUBLISHED: staff review each row in Admin → Study programmes
 * and publish it. Insert-only and once per database (setting `seed.study.v1`), so rows the team edits or deletes
 * are never touched or recreated. Göttingen M.Sc. Applied Computer Science was left out: its tuition is not stated
 * on an official page.
 *
 * Deadlines are those for non-EU applicants with a foreign degree (MM-DD, yearly). Fees: tuition per semester for
 * non-EU students; semesterContribution only where the official figure has a semester label (else null).
 */

type Seed = {
  slug: string;
  university: string;
  city: string;
  federalState: string;
  subjectArea: string;
  name: string;
  teachingLanguage: 'EN' | 'EN_DE';
  languageRequirement: string;
  durationSemesters: number;
  tuitionPerSemester: number;
  semesterContribution: number | null;
  deadlines: { intake: 'WINTER' | 'SUMMER'; from: string | null; to: string; note: string | null }[];
  applicationRoute: 'UNI_ASSIST' | 'DIRECT' | 'VPD';
  officialUrl: string;
  staffNote: string;
};

export const STUDY_PROGRAMME_SEEDS: Seed[] = [
  {
    slug: 'data-engineering-and-analytics-tum',
    university: 'Technical University of Munich (TUM)',
    city: 'Garching bei München',
    federalState: 'BY',
    subjectArea: 'data-science',
    name: 'Data Engineering and Analytics, Master of Science (M.Sc.)',
    teachingLanguage: 'EN',
    languageRequirement: 'TOEFL iBT 88 / IELTS Academic 6.5 / Cambridge CAE or CPE (A–C) / PTE Academic 65',
    durationSemesters: 4,
    tuitionPerSemester: 6000,
    semesterContribution: null,
    deadlines: [
      { intake: 'WINTER', from: '02-01', to: '05-31', note: null },
      { intake: 'SUMMER', from: '10-01', to: '11-30', note: null },
    ],
    applicationRoute: 'VPD',
    officialUrl: 'https://www.tum.de/en/studies/degree-programs/detail/data-engineering-and-analytics-master-of-science-msc',
    staffNote: [
      'Checked 2026-11-15 on tum.de:',
      '- programme (campus Garching, language, 4 semesters, 6,000 € non-EU tuition, deadlines, VPD): https://www.tum.de/en/studies/degree-programs/detail/data-engineering-and-analytics-master-of-science-msc',
      '- English scores: https://www.tum.de/en/studies/application/application-info-portal/admission-requirements/language-certificates',
      '- VPD: https://www.tum.de/en/studies/application/application-info-portal/uni-assist',
      '- fees: https://www.tum.de/en/studies/fees , https://www.tum.de/en/studies/fees/tuition',
      'CHECK BEFORE PUBLISHING: from WS 2027/28 TUM master tuition rises from 4,000 / 6,000 to 4,600 / 6,800 € (the programme page still says 6,000 €). Mostly English, some courses may be German. Semester fee (97 € in SS 2026) + Student Union contribution vary — left empty. VPD needed for a non-German bachelor; application itself via TUMonline.',
    ].join('\n'),
  },
  {
    slug: 'data-science-rwth-aachen',
    university: 'RWTH Aachen University',
    city: 'Aachen',
    federalState: 'NW',
    subjectArea: 'data-science',
    name: 'Data Science M.Sc.',
    teachingLanguage: 'EN',
    languageRequirement: 'English proficiency (proof at enrolment; IELTS must be Academic). GRE required for non-EU/EEA applicants.',
    durationSemesters: 4,
    tuitionPerSemester: 0,
    semesterContribution: null,
    deadlines: [
      { intake: 'WINTER', from: '12-01', to: '03-01', note: 'non-EU' },
      { intake: 'SUMMER', from: '06-01', to: '09-01', note: 'non-EU' },
    ],
    applicationRoute: 'DIRECT',
    officialUrl: 'https://www.rwth-aachen.de/cms/root/studium/vor-dem-studium/studiengaenge/liste-aktuelle-studiengaenge/studiengangbeschreibung/~pzpc/data-science-m-sc/?lidx=1',
    staffNote: [
      'Checked 2026-11-15 on rwth-aachen.de:',
      '- programme (name, 4 semesters, English, intakes): https://www.rwth-aachen.de/cms/root/studium/vor-dem-studium/studiengaenge/liste-aktuelle-studiengaenge/studiengangbeschreibung/~pzpc/data-science-m-sc/?lidx=1',
      '- deadlines, route, GRE, language: https://sc.informatik.rwth-aachen.de/en/studium/master/master-data-science/application-for-admission/',
      '- international deadlines: https://www.rwth-aachen.de/cms/root/studium/vor-dem-studium/bewerbung-um-einen-studienplatz/master-bewerbung/~dqml/bewerbung-master-internationale/?lidx=1',
      '- no tuition: https://www.rwth-aachen.de/cms/root/studium/im-studium/internationales/~inno/faq/?lidx=1',
      'Apply via RWTHonline. GRE (non-EU/EEA): Quantitative > 75th percentile, Verbal > 15th, AW ≥ 3.5. EU applicants: winter 06-01..07-15, summer 12-01..01-15. Semester contribution (AStA table 358.34 €, no semester label; ticket share 226.80 € from WS 2026/27) — left empty.',
    ].join('\n'),
  },
  {
    slug: 'information-technology-infotech-stuttgart',
    university: 'University of Stuttgart',
    city: 'Stuttgart',
    federalState: 'BW',
    subjectArea: 'engineering',
    name: 'Information Technology (INFOTECH), M.Sc.',
    teachingLanguage: 'EN',
    languageRequirement: 'TOEFL iBT 95 / IELTS Academic 7.0 / Cambridge C1 or C2 / PTE Academic 76 (no MOI letters)',
    durationSemesters: 4,
    tuitionPerSemester: 1500,
    semesterContribution: 184,
    deadlines: [
      { intake: 'WINTER', from: '11-15', to: '01-15', note: null },
      { intake: 'SUMMER', from: '05-15', to: '07-15', note: null },
    ],
    applicationRoute: 'DIRECT',
    officialUrl: 'https://www.infotech.uni-stuttgart.de/',
    staffNote: [
      'Checked 2026-11-15 on uni-stuttgart.de:',
      '- programme, language, tuition, WS 2027/28 window (15 Nov 2026 – 15 Jan 2027): https://www.infotech.uni-stuttgart.de/',
      '- duration: https://www.infotech.uni-stuttgart.de/program/',
      '- language / route: https://www.infotech.uni-stuttgart.de/application/requirements/',
      '- deadlines: https://www.uni-stuttgart.de/en/study/application/master/admission/',
      '- fees: https://www.student.uni-stuttgart.de/en/organizing-studies/formalities/tuition-and-fees/',
      'Apply through C@MPUS with the INFOTECH Adjunct form. APS certificate may be needed (China, Vietnam, Mongolia, India).',
    ].join('\n'),
  },
  {
    slug: 'mannheim-master-in-management',
    university: 'University of Mannheim',
    city: 'Mannheim',
    federalState: 'BW',
    subjectArea: 'business',
    name: 'Mannheim Master in Management (MMM), M.Sc.',
    teachingLanguage: 'EN',
    languageRequirement: 'English C1: TOEFL iBT 100 / IELTS Academic 7.0 / CAE / CPE / telc C1, or a degree taught at least 40 % in English',
    durationSemesters: 4,
    tuitionPerSemester: 1500,
    semesterContribution: 194,
    deadlines: [{ intake: 'WINTER', from: '04-01', to: '05-15', note: null }],
    applicationRoute: 'DIRECT',
    officialUrl: 'https://www.uni-mannheim.de/en/academics/before-your-studies/programs/mannheim-master-in-management/',
    staffNote: [
      'Checked 2026-11-15 on uni-mannheim.de:',
      '- programme, duration, tracks, language, fees: https://www.uni-mannheim.de/en/academics/before-your-studies/programs/mannheim-master-in-management/',
      '- deadlines, route, GMAT: https://www.bwl.uni-mannheim.de/en/programs/master/mmm/application-information/',
      'Fall intake only; apply via Portal². GMAT/GRE not required but a selection criterion. English track = EN only; the German-English track needs German C1. Language proof can follow until 15 Aug.',
    ].join('\n'),
  },
  {
    slug: 'intelligent-adaptive-systems-hamburg',
    university: 'Universität Hamburg',
    city: 'Hamburg',
    federalState: 'HH',
    subjectArea: 'computer-science',
    name: 'Intelligent Adaptive Systems M.Sc.',
    teachingLanguage: 'EN',
    languageRequirement: 'IELTS 6.5 (sub-scores ≥ 6.0) / TOEFL iBT 90 (sub-scores ≥ 20) / telc B2 in all parts or C1 / Cambridge CAE or CPE',
    durationSemesters: 4,
    tuitionPerSemester: 0,
    semesterContribution: 402,
    deadlines: [{ intake: 'WINTER', from: '02-15', to: '03-31', note: null }],
    applicationRoute: 'DIRECT',
    officialUrl: 'https://www.uni-hamburg.de/onTEAM/studiengaenge/intelligent-adaptive-systems.pdf',
    staffNote: [
      'Checked 2026-11-15 on uni-hamburg.de:',
      '- programme sheet (name, language, application period, route, language requirement): https://www.uni-hamburg.de/onTEAM/studiengaenge/intelligent-adaptive-systems.pdf',
      '- no tuition since WS 2012/13: https://www.uni-hamburg.de/en/campuscenter/studienorganisation/studienverlauf/beitraege-gebuehren.html',
      '- semester contribution WS 2026/27 = 402 €: https://www.uni-hamburg.de/en/campuscenter/studienorganisation/studienverlauf/beitraege-gebuehren/semesterbeitrag.html',
      'CHECK: the sheet says "2-year research-oriented program" (= 4 semesters; no page states the semester count). Winter term only; the 2027 window (15 Feb – 31 Mar) is expected, confirm when announced. Apply via STiNE.',
    ].join('\n'),
  },
  {
    slug: 'computer-science-freiburg',
    university: 'University of Freiburg',
    city: 'Freiburg im Breisgau',
    federalState: 'BW',
    subjectArea: 'computer-science',
    name: 'Computer Science, Master of Science (M.Sc.)',
    teachingLanguage: 'EN_DE',
    languageRequirement: 'English C1 (IELTS Academic 7.0 / TOEFL iBT 95 / PTE Academic 76 / CAE, CPE …) or German C1 + English B2',
    durationSemesters: 4,
    tuitionPerSemester: 1500,
    semesterContribution: 190,
    deadlines: [
      { intake: 'WINTER', from: '04-15', to: '05-31', note: 'non-EU' },
      { intake: 'SUMMER', from: '11-01', to: '12-15', note: 'non-EU' },
    ],
    applicationRoute: 'DIRECT',
    officialUrl: 'https://uni-freiburg.de/en/studies/degree-programmes/degree-programme/181',
    staffNote: [
      'Checked 2026-11-15 on uni-freiburg.de:',
      '- programme, duration, language, deadlines: https://uni-freiburg.de/en/studies/degree-programmes/degree-programme/181',
      '- route, language scores: https://www.tf.uni-freiburg.de/en/study-programs/computer-science/m-sc-computer-science',
      '- fees: https://uni-freiburg.de/en/studies/during-your-studies/semester-fees-and-tuition/',
      'Apply via campus.uni-freiburg.de. Central page: "German and/or English"; faculty page: English. EU applicants: winter until 07-15, summer until 01-15.',
    ].join('\n'),
  },
  {
    slug: 'nanoelectronic-systems-tu-dresden',
    university: 'TU Dresden',
    city: 'Dresden',
    federalState: 'SN',
    subjectArea: 'engineering',
    name: 'Nanoelectronic Systems (Master), Master of Science',
    teachingLanguage: 'EN',
    languageRequirement: 'English CEFR B2 (non-native speakers)',
    durationSemesters: 4,
    tuitionPerSemester: 0,
    semesterContribution: 361,
    deadlines: [{ intake: 'WINTER', from: '04-01', to: '05-31', note: 'non-EU, foreign degree' }],
    applicationRoute: 'UNI_ASSIST',
    officialUrl: 'https://tu-dresden.de/studium/vor-dem-studium/studienangebot/sins/sins_studiengang?autoid=1858&set_language=en',
    staffNote: [
      'Checked 2026-11-15 on tu-dresden.de:',
      '- programme, duration, language, deadlines: https://tu-dresden.de/studium/vor-dem-studium/studienangebot/sins/sins_studiengang?autoid=1858&set_language=en',
      '- route (uni-assist for foreign degrees), deadlines table: https://tu-dresden.de/ing/elektrotechnik/studium/studieren-an-der-fakultaet/studiengaenge/masters-programme-nanoelectronic-systems/prospective-students/bewerbung?set_language=en',
      '- semester fee: https://tu-dresden.de/studium/im-studium/studienorganisation/rueckmeldung/index?set_language=en',
      'Winter only. EU with a foreign degree: 04-01..07-15. Programme page "valid until May 2027". CHECK: central page shows only "Apply now" (faculty page says uni-assist).',
    ].join('\n'),
  },
  {
    slug: 'statistics-and-data-science-lmu',
    university: 'Ludwig-Maximilians-Universität München (LMU)',
    city: 'München',
    federalState: 'BY',
    subjectArea: 'data-science',
    name: 'Statistics and Data Science (Master), M.Sc.',
    teachingLanguage: 'EN',
    languageRequirement: 'English B2 (common B2 certificate) or an English-taught previous degree',
    durationSemesters: 4,
    tuitionPerSemester: 0,
    semesterContribution: null,
    deadlines: [
      { intake: 'WINTER', from: '04-01', to: '05-15', note: 'department aptitude procedure' },
      { intake: 'SUMMER', from: '10-15', to: '11-15', note: 'department aptitude procedure' },
    ],
    applicationRoute: 'DIRECT',
    officialUrl: 'https://www.lmu.de/de/studium/studienangebot/alle-studienfaecher-und-studiengaenge/statistics-and-data-science-master-hauptfach-18752.html',
    staffNote: [
      'Checked 2026-11-15 on lmu.de:',
      '- programme, duration, language, intakes: https://www.lmu.de/de/studium/studienangebot/alle-studienfaecher-und-studiengaenge/statistics-and-data-science-master-hauptfach-18752.html',
      '- deadlines, language, route: https://www.stat.lmu.de/en/studies/interested-master/',
      '- no tuition (incl. non-EU): https://www.med.lmu.de/en/faculty/global-engagement-alumni-career-development/pulse/standort-muenchen/',
      'Successor of the discontinued M.Sc. Data Science. Two steps: department aptitude portal, then campusLMU / International Office (non-EU: winter by 07-15, summer by 01-15). Semester fee for WS 2026/27 not listed — left empty.',
    ].join('\n'),
  },
];

const FLAG = 'seed.study.v1';

export const seedStudyProgrammes = async (prisma: PrismaClient) => {
  if (await prisma.setting.findUnique({ where: { key: FLAG } })) return;
  const checkedAt = new Date('2026-11-15T00:00:00.000Z');
  for (const p of STUDY_PROGRAMME_SEEDS) {
    if (await prisma.studyProgramme.findUnique({ where: { slug: p.slug }, select: { id: true } })) continue;
    await prisma.studyProgramme.create({ data: { ...p, degree: 'MASTER', published: false, featured: false, checkedAt } });
  }
  await prisma.setting.create({ data: { key: FLAG, value: { at: new Date().toISOString(), count: STUDY_PROGRAMME_SEEDS.length } } });
};
