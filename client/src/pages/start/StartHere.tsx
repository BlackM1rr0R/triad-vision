import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Baby, Briefcase, Building2, ChevronRight, GraduationCap, Hammer, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { registerCopy } from '@/i18n';
import { pagesStartHere } from '@/i18n/pagesStartHere';
import { pagesProfessionHubs } from '@/i18n/pagesProfessionHubs';
import { usePageTitle } from '@/lib/usePageTitle';
import { LEVELS, PROFESSIONS, WHO, needsLevel, needsProfession, planSearch, type Level, type Profession, type Who } from '@/lib/startPlan/rules';

registerCopy(pagesStartHere);
registerCopy(pagesProfessionHubs);

const WHO_ICON: Record<Who, LucideIcon> = { worker: Hammer, ausbildung: Briefcase, student: GraduationCap, family: Baby, employer: Building2 };

type Q = 'who' | 'profession' | 'level';

/** Questions that apply to an answer to "who are you?". */
const questionsFor = (who: Who | null): Q[] => ['who', ...(who && needsProfession(who) ? (['profession'] as const) : []), ...(!who || needsLevel(who) ? (['level'] as const) : [])];

const Choice = ({ label, text, Icon, onClick, selected }: { label: string; text?: string; Icon?: LucideIcon; onClick: () => void; selected: boolean }) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'flex min-h-16 w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-[var(--tv-shadow-card)] transition-[border-color,box-shadow] sm:p-5',
        selected ? 'border-primary ring-2 ring-primary/25' : 'border-line hover:border-line-strong hover:shadow-[var(--tv-shadow-raised)]',
      )}
    >
      {Icon && (
        <span className="chip-sky grid size-11 shrink-0 place-items-center rounded-xl">
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{label}</span>
        {text && <span className="mt-0.5 block text-sm text-muted">{text}</span>}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
    </button>
  </li>
);

/** /start — "Start here": three questions, then the personal plan (/start/plan?w=…&p=…&l=…). */
export default function StartHere() {
  const { t } = useTranslation();
  usePageTitle(t('startHere.heroTitle'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const pre = params.get('w');
  const [who, setWho] = useState<Who | null>((WHO as readonly string[]).includes(pre ?? '') ? (pre as Who) : null);
  const [profession, setProfession] = useState<Profession | null>(null);
  const [step, setStep] = useState(who ? 1 : 0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const questions = questionsFor(who);
  const q = questions[Math.min(step, questions.length - 1)];

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const finish = (w: Who, p: Profession | null, l: Level | null) => navigate(`/start/plan${planSearch({ who: w, profession: p, level: l })}`);

  const chooseWho = (w: Who) => {
    setWho(w);
    setProfession(null);
    if (!needsProfession(w) && !needsLevel(w)) finish(w, null, null);
    else setStep(1);
  };
  const chooseProfession = (p: Profession) => {
    setProfession(p);
    setStep(2);
  };
  const chooseLevel = (l: Level) => who && finish(who, profession, l);

  return (
    <>
      <PageHero title={t('startHere.heroTitle')} subtitle={t('startHere.heroSubtitle')} />
      <section className="container-x py-10 sm:py-14">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between gap-3 text-sm text-muted">
            <span aria-live="polite">{t('startHere.progress', { n: Math.min(step, questions.length - 1) + 1, total: questions.length })}</span>
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold text-ink hover:bg-sunken">
                <ArrowLeft className="size-4" aria-hidden /> {t('startHere.back')}
              </button>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((Math.min(step, questions.length - 1) + 1) / questions.length) * 100}%` }} />
          </div>

          <h2 ref={headingRef} tabIndex={-1} className="mt-8 font-display text-2xl font-semibold text-ink outline-none sm:text-3xl">
            {t(`startHere.q.${q}.title`)}
          </h2>
          <p className="mt-1 text-muted">{t(`startHere.q.${q}.hint`)}</p>

          <ul className="mt-6 grid gap-3">
            {q === 'who' &&
              WHO.map((w) => <Choice key={w} label={t(`startHere.who.${w}.title`)} text={t(`startHere.who.${w}.text`)} Icon={WHO_ICON[w]} selected={who === w} onClick={() => chooseWho(w)} />)}
            {q === 'profession' &&
              PROFESSIONS.map((p) => (
                <Choice key={p} label={p === 'other' ? t('startHere.otherProfession') : t(`profHub.hubs.${p}.chip`)} selected={profession === p} onClick={() => chooseProfession(p)} />
              ))}
            {q === 'level' && LEVELS.map((l) => <Choice key={l} label={t(`startHere.levels.${l}`)} selected={false} onClick={() => chooseLevel(l)} />)}
          </ul>
        </div>
      </section>
    </>
  );
}
