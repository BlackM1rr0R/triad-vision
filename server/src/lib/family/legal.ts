/**
 * Familiennachzug — the legal facts in ONE place, plus the pure readiness check and step timeline built on
 * them. Nothing here touches the database (lib/family/readiness.ts loads the data), so the rules are unit
 * tested (tests/unit/familyReunion.test.ts) and the owner can update a number without reading code.
 *
 * Stand: AufenthG as amended by the Fachkräfteeinwanderungsgesetz (stages 18.11.2023 / 01.03.2024 /
 * 01.06.2024), Bürgergeld Regelbedarfe 2024–2026 (unchanged 2025 and 2026). Every value is a simplification of
 * embassy / Ausländerbehörde practice: the check gives staff and the client a direction, the decision is the
 * authority's. Verify before relying on it: legal.ts is listed in the feature report for the owner.
 */

// ─── Facts ─────────────────────────────────────────────────────────────

/** The main applicant's (Bezugsperson's) residence title in Germany. */
export const SPONSOR_TITLES = ['BLUE_CARD', 'SKILLED', 'ICT', 'RESEARCH', 'AUSBILDUNG', 'STUDY', 'JOB_SEEKER', 'SETTLEMENT', 'OTHER'] as const;
export type SponsorTitle = (typeof SPONSOR_TITLES)[number];

export const FAMILY_LAW = {
  /** Date of the facts below (shown in the UI as "rules as of"). */
  asOf: '2026-10',
  titles: {
    BLUE_CARD: { paragraph: '§ 18g AufenthG', reunion: 'yes' },
    SKILLED: { paragraph: '§ 18a / § 18b AufenthG', reunion: 'yes' },
    ICT: { paragraph: '§ 19 AufenthG', reunion: 'yes' },
    RESEARCH: { paragraph: '§ 18d AufenthG', reunion: 'yes' },
    // Trainees and students: spouse reunion at the authority's discretion (§ 30 (1) S. 1 Nr. 3, livelihood + housing).
    AUSBILDUNG: { paragraph: '§ 16a AufenthG', reunion: 'discretion' },
    STUDY: { paragraph: '§ 16b AufenthG', reunion: 'discretion' },
    // Chancenkarte / job seeker: no general family reunion while searching.
    JOB_SEEKER: { paragraph: '§ 20 / § 20a AufenthG', reunion: 'no' },
    SETTLEMENT: { paragraph: '§ 9 / § 18c AufenthG', reunion: 'yes' },
    OTHER: { paragraph: '—', reunion: 'discretion' },
  } satisfies Record<SponsorTitle, { paragraph: string; reunion: 'yes' | 'discretion' | 'no' }>,
  spouse: {
    paragraph: '§ 30 AufenthG',
    /** § 30 (1) S. 1 Nr. 1: both spouses at least 18. */
    minAge: 18,
    /** § 30 (1) S. 1 Nr. 2: simple German (A1). */
    language: 'A1',
    /** § 30 (1) S. 3 Nr. 5 (since 01.03.2024 also § 18a / § 18b): no A1 needed for spouses of these titles. */
    languageExemptTitles: ['BLUE_CARD', 'SKILLED', 'ICT', 'RESEARCH', 'SETTLEMENT'] as SponsorTitle[],
  },
  child: {
    paragraph: '§ 32 AufenthG',
    /** § 32 (1): minor, unmarried. */
    maxAgeExclusive: 18,
    /**
     * § 32 (2): a child aged 16+ who does not move together with both parents (or the sole custodian) needs German C1
     * or a positive integration prognosis — not for children of Blue Card / ICT / researcher titles.
     */
    languageFromAge: 16,
    languageLevel: 'C1',
    languageExemptTitles: ['BLUE_CARD', 'ICT', 'RESEARCH'] as SponsorTitle[],
  },
  parents: {
    paragraph: '§ 36 (3) AufenthG',
    /** Parents (and parents-in-law) may join skilled workers whose title was FIRST issued on or after this day. */
    titleIssuedFrom: '2024-03-01',
    titles: ['BLUE_CARD', 'SKILLED', 'ICT', 'RESEARCH'] as SponsorTitle[],
  },
  /** Other relatives: only to avoid an "extraordinary hardship" (§ 36 (2)). */
  otherRelatives: { paragraph: '§ 36 (2) AufenthG' },
  livingSpace: {
    paragraph: '§ 29 (1) Nr. 2, § 2 (4) AufenthG',
    /** VwV-AufenthG 2.4.2: 12 m² per person from age 6, 10 m² per child under 6, children under 2 not counted. */
    m2PerPerson: 12,
    m2PerChildUnder6: 10,
    childUnder6Age: 6,
    notCountedUnderAge: 2,
    /** Since 01.03.2024 no proof of sufficient living space for the family of these titles. */
    exemptTitles: ['BLUE_CARD', 'SKILLED'] as SponsorTitle[],
  },
  livelihood: {
    paragraph: '§ 5 (1) Nr. 1, § 2 (3) AufenthG',
    /** Bürgergeld Regelbedarfe per month (2024–2026), EUR. */
    regelbedarf: { single: 563, partner: 506, child14to17: 471, child6to13: 390, child0to5: 357 },
    /** Work-related allowance (Erwerbstätigenfreibetrag, § 11b SGB II) added to the need, EUR per month — rough. */
    workAllowance: 330,
    /** Only a gross salary known: net ≈ gross × this (married, tax class III, rough). */
    netFromGross: 0.7,
    /** Within this share below the need → "attention" instead of "not enough". */
    tolerance: 0.1,
  },
  documents: {
    /** Azerbaijani civil-status documents: apostille (Hague Convention 1961) + certified German translation. */
    civilStatus: 'apostille + certified translation',
  },
} as const;

// ─── Readiness check ───────────────────────────────────────────────────

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'missing';
export type ReadinessCode =
  | 'SPONSOR_TITLE'
  | 'LIVING_SPACE'
  | 'INCOME'
  | 'SPOUSE_AGE'
  | 'SPOUSE_LANGUAGE'
  | 'CHILD_AGE'
  | 'CHILD_LANGUAGE'
  | 'PARENT_ALLOWED'
  | 'OTHER_HARDSHIP';

export interface ReadinessCheck {
  code: ReadinessCode;
  status: CheckStatus;
  /** Member the check is about (null: the whole family / the main applicant). */
  memberCaseId: string | null;
  params: Record<string, number | string | boolean | null>;
}

export interface ReadinessMember {
  caseId: string;
  relation: 'spouse' | 'child' | 'parent' | 'other';
  birthDate: Date | null;
  germanExempt: boolean;
  /** The member's GERMAN_CERT requirement has an accepted document. */
  germanCertAccepted: boolean;
}

export interface SponsorFacts {
  title: SponsorTitle | null;
  titleIssuedAt: Date | null;
  livingSpaceM2: number | null;
  warmRent: number | null;
  netMonthly: number | null;
  grossMonthly: number | null;
}

export type ReadinessStatus = 'READY' | 'ATTENTION' | 'INCOMPLETE' | 'BLOCKED';

/** Full years at `now` (birthday on 29 Feb counts on 1 Mar in common years). */
export const ageAt = (birth: Date, now: Date) => {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
};

/** Living space the family needs (main applicant + members), in m². Unknown ages count as adults. */
export const requiredLivingSpace = (memberBirthDates: (Date | null)[], now: Date) => {
  const ls = FAMILY_LAW.livingSpace;
  let m2 = ls.m2PerPerson; // the main applicant
  let persons = 1;
  for (const b of memberBirthDates) {
    const age = b ? ageAt(b, now) : 99;
    if (age < ls.notCountedUnderAge) continue;
    persons++;
    m2 += age < ls.childUnder6Age ? ls.m2PerChildUnder6 : ls.m2PerPerson;
  }
  return { m2, persons };
};

/** Monthly need of the family (Regelbedarfe + warm rent + work allowance), EUR. */
export const livelihoodNeed = (members: Pick<ReadinessMember, 'relation' | 'birthDate'>[], warmRent: number | null, now: Date) => {
  const r = FAMILY_LAW.livelihood.regelbedarf;
  const hasSpouse = members.some((m) => m.relation === 'spouse');
  let need = hasSpouse ? r.partner : r.single;
  for (const m of members) {
    if (m.relation !== 'child') {
      need += r.partner; // spouse, parents and other adults: the partner rate (rough)
      continue;
    }
    const age = m.birthDate ? ageAt(m.birthDate, now) : 17; // unknown: the highest child rate
    need += age >= 14 ? r.child14to17 : age >= 6 ? r.child6to13 : r.child0to5;
  }
  return Math.round(need + (warmRent ?? 0) + FAMILY_LAW.livelihood.workAllowance);
};

const inList = (list: readonly SponsorTitle[], t: SponsorTitle | null) => !!t && list.includes(t);

/** The readiness of a family for the reunion: one check per rule, then the worst status. Pure. */
export const assessReunion = (sponsor: SponsorFacts, members: ReadinessMember[], now = new Date()) => {
  const L = FAMILY_LAW;
  const checks: ReadinessCheck[] = [];
  const add = (code: ReadinessCode, status: CheckStatus, memberCaseId: string | null = null, params: ReadinessCheck['params'] = {}) => checks.push({ code, status, memberCaseId, params });
  const title = sponsor.title;

  if (!title) add('SPONSOR_TITLE', 'missing');
  else {
    const reunion = L.titles[title].reunion;
    add('SPONSOR_TITLE', reunion === 'yes' ? 'ok' : reunion === 'no' ? 'fail' : 'warn', null, { title, paragraph: L.titles[title].paragraph, reunion });
  }

  for (const m of members) {
    const age = m.birthDate ? ageAt(m.birthDate, now) : null;
    if (m.relation === 'spouse') {
      if (age === null) add('SPOUSE_AGE', 'missing', m.caseId);
      else add('SPOUSE_AGE', age >= L.spouse.minAge ? 'ok' : 'fail', m.caseId, { age, min: L.spouse.minAge });
      const titleExempt = inList(L.spouse.languageExemptTitles, title);
      if (m.germanExempt || m.germanCertAccepted) add('SPOUSE_LANGUAGE', 'ok', m.caseId, { exempt: m.germanExempt, level: L.spouse.language });
      // Exemption applies by the title but the spouse is not marked yet: staff should tick "A1 exempt".
      else add('SPOUSE_LANGUAGE', titleExempt ? 'warn' : 'missing', m.caseId, { exemptByTitle: titleExempt, level: L.spouse.language });
    } else if (m.relation === 'child') {
      if (age === null) add('CHILD_AGE', 'missing', m.caseId);
      else {
        add('CHILD_AGE', age < L.child.maxAgeExclusive ? 'ok' : 'fail', m.caseId, { age, max: L.child.maxAgeExclusive - 1 });
        if (age >= L.child.languageFromAge && age < L.child.maxAgeExclusive && !inList(L.child.languageExemptTitles, title)) {
          add('CHILD_LANGUAGE', 'warn', m.caseId, { age, level: L.child.languageLevel });
        }
      }
    } else if (m.relation === 'parent') {
      const titleOk = inList(L.parents.titles, title);
      const issued = sponsor.titleIssuedAt?.toISOString().slice(0, 10) ?? null;
      const status: CheckStatus = !title ? 'missing' : !titleOk ? 'fail' : !issued ? 'missing' : issued >= L.parents.titleIssuedFrom ? 'ok' : 'fail';
      add('PARENT_ALLOWED', status, m.caseId, { issuedFrom: L.parents.titleIssuedFrom, issued });
    } else add('OTHER_HARDSHIP', 'warn', m.caseId);
  }

  const space = requiredLivingSpace(members.map((m) => m.birthDate), now);
  if (inList(L.livingSpace.exemptTitles, title)) add('LIVING_SPACE', 'ok', null, { exempt: true, required: space.m2, actual: sponsor.livingSpaceM2, persons: space.persons });
  else if (sponsor.livingSpaceM2 == null) add('LIVING_SPACE', 'missing', null, { required: space.m2, persons: space.persons });
  else add('LIVING_SPACE', sponsor.livingSpaceM2 >= space.m2 ? 'ok' : 'fail', null, { required: space.m2, actual: sponsor.livingSpaceM2, persons: space.persons });

  const need = livelihoodNeed(members, sponsor.warmRent, now);
  const estimated = sponsor.netMonthly == null && sponsor.grossMonthly != null;
  const available = sponsor.netMonthly ?? (sponsor.grossMonthly != null ? Math.round(sponsor.grossMonthly * L.livelihood.netFromGross) : null);
  if (available === null) add('INCOME', 'missing', null, { need });
  else {
    const status: CheckStatus = available >= need ? (estimated || sponsor.warmRent == null ? 'warn' : 'ok') : available >= need * (1 - L.livelihood.tolerance) ? 'warn' : 'fail';
    add('INCOME', status, null, { need, available, estimated, rentKnown: sponsor.warmRent != null });
  }

  const has = (s: CheckStatus) => checks.some((c) => c.status === s);
  const status: ReadinessStatus = has('fail') ? 'BLOCKED' : has('missing') ? 'INCOMPLETE' : has('warn') ? 'ATTENTION' : 'READY';
  return { status, checks, livingSpace: { required: space.m2, actual: sponsor.livingSpaceM2, persons: space.persons }, income: { need, available, estimated }, asOf: L.asOf };
};
export type ReunionAssessment = ReturnType<typeof assessReunion>;

// ─── Timeline (client portal) ──────────────────────────────────────────

export const TIMELINE_STEPS = ['family', 'worker', 'proof', 'documents', 'appointment', 'decision', 'entry'] as const;
export type TimelineStep = (typeof TIMELINE_STEPS)[number];

export interface TimelineMember {
  status: string;
  appointmentAt: Date | null;
  plannedEntryAt: Date | null;
  /** Required documents still missing or rejected. */
  openItems: number;
}

export interface TimelineInput {
  members: TimelineMember[];
  /** Main applicant's visa approved or arrived (reunion.ts mainReady). */
  workerReady: boolean;
  /** Title, living space and income known and not failing. */
  proofReady: boolean;
}

const LODGED = ['APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED'];

/** Seven steps; the first one not done is "current". Members whose case was closed do not hold the family back. */
export const reunionTimeline = (input: TimelineInput, now = new Date()) => {
  const active = input.members.filter((m) => m.status !== 'CANCELLED' && m.status !== 'REJECTED');
  const all = (f: (m: TimelineMember) => boolean) => active.length > 0 && active.every(f);
  const done: Record<TimelineStep, boolean> = {
    family: input.members.length > 0,
    worker: input.workerReady,
    proof: input.proofReady,
    documents: all((m) => m.openItems === 0 || LODGED.includes(m.status)),
    appointment: all((m) => !!m.appointmentAt || LODGED.includes(m.status)),
    decision: all((m) => m.status === 'APPROVED'),
    entry: all((m) => m.status === 'APPROVED' && !!m.plannedEntryAt && m.plannedEntryAt.getTime() <= now.getTime()),
  };
  const current = TIMELINE_STEPS.find((s) => !done[s]) ?? null;
  const appointment = active.map((m) => m.appointmentAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const entry = active.map((m) => m.plannedEntryAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return TIMELINE_STEPS.map((key) => ({
    key,
    state: done[key] ? ('done' as const) : key === current ? ('current' as const) : ('upcoming' as const),
    date: key === 'appointment' ? (appointment?.toISOString() ?? null) : key === 'entry' ? (entry?.toISOString().slice(0, 10) ?? null) : null,
  }));
};
