import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, SpellCheck, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesNameCheck } from '@/i18n/pagesNameCheck';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesNameCheck);

type Variant = 'mrz' | 'icaoAlt' | 'english' | 'german';
type Status = 'exact' | 'spelling' | 'mismatch';
interface Spelling {
  variant: Variant;
  value: string;
  display: string;
}
interface Comparison {
  status: Status;
  expected: { surname: string; givenNames: string };
  passport: { surname: string; givenNames: string };
  surname: Status;
  givenNames: Status;
}
/** POST /api/name-check (server/src/routes/nameCheck.ts, lib/nameCheck). */
interface NameCheckResponse {
  analysis: {
    firstName: Spelling[];
    lastName: Spelling[];
    letters: { letter: string; mrz: string; icaoAlt: string; english: string; german: string; notInIcao: boolean }[];
    mrzField: { field: string; truncated: boolean };
    comparison: Comparison | null;
  };
  onFile: { surname: string; givenNames: string; valid: boolean; uploadedAt: string } | null;
  profile: { firstName: string; lastName: string } | null;
  profileComparison: Comparison | null;
}

const AS_OF = '2026-11-15';
const ICAO_URL = 'https://www.icao.int/publications/pages/publication.aspx?docnum=9303';
const STATUS_TONE: Record<Status, string> = {
  exact: 'border-success/30 bg-success-bg text-success-fg',
  spelling: 'border-warning-border bg-warning-bg text-warning-fg',
  mismatch: 'border-danger-border bg-danger-bg text-danger-fg',
};
const STATUS_ICON = { exact: CheckCircle2, spelling: AlertTriangle, mismatch: XCircle } as const;

const useDebounced = <T,>(value: T, ms: number) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
};

/** Both name parts' spellings of one variant ("ELVIN MAMMADOV"). */
const joined = (r: NameCheckResponse['analysis'], v: Variant) => {
  const pick = (list: Spelling[]) => list.find((s) => s.variant === v)?.display ?? list.find((s) => s.variant === 'mrz')?.display ?? '';
  return [pick(r.firstName), pick(r.lastName)].filter(Boolean).join(' ');
};

/**
 * Name transliteration checker: type a name in Azerbaijani letters → the passport MRZ form (ICAO Doc 9303),
 * the ICAO alternative, English-style and German-by-ear spellings, the special letters, and — when the passport
 * MRZ was read from an upload — a comparison with it (plus the profile name vs. the passport). No AI.
 * Client: own case (`caseId` optional); staff: the case view (`caseId` required for the passport on file).
 */
export const NameChecker = ({ caseId, audience = 'client', defaultOpen = false }: { caseId?: string; audience?: 'client' | 'staff'; defaultOpen?: boolean }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const touched = useRef(false);
  const name = useDebounced({ firstName, lastName }, 350);

  const q = useQuery({
    queryKey: ['name-check', caseId ?? 'mine', name.firstName, name.lastName],
    queryFn: async () => (await api.post<NameCheckResponse>('/name-check', { ...name, ...(caseId ? { caseId } : {}) })).data,
    enabled: open,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  // Start from the profile name (the client can overwrite it).
  useEffect(() => {
    const p = q.data?.profile;
    if (!p || touched.current) return;
    touched.current = true;
    setFirstName(p.firstName);
    setLastName(p.lastName);
  }, [q.data?.profile]);

  const d = q.data;
  const typed = !!(firstName.trim() || lastName.trim());
  const variants = d ? (['mrz', 'icaoAlt', 'english', 'german'] as Variant[]).filter((v) => v === 'mrz' || d.analysis.firstName.some((s) => s.variant === v) || d.analysis.lastName.some((s) => s.variant === v)) : [];
  const cmp = d?.analysis.comparison;
  const profileDiff = d?.profileComparison && d.profileComparison.status !== 'exact' && d.profile ? `${d.profile.firstName} ${d.profile.lastName}` : null;

  return (
    <section className="card overflow-hidden" aria-labelledby={`${panelId}-title`}>
      <button type="button" className="flex w-full items-start gap-3 px-4 py-4 text-left sm:px-5" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
          <SpellCheck className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span id={`${panelId}-title`} className="block font-semibold text-ink">
            {t('nameCheck.title')}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{audience === 'staff' ? t('nameCheck.staffIntro') : t('nameCheck.intro')}</span>
        </span>
        <ChevronDown className={clsx('mt-1 size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div id={panelId} className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${panelId}-first`} className="label">
                {t('nameCheck.firstName')}
              </label>
              <input
                id={`${panelId}-first`}
                className="input"
                lang="az"
                autoComplete="off"
                maxLength={80}
                value={firstName}
                onChange={(e) => {
                  touched.current = true;
                  setFirstName(e.target.value);
                }}
              />
            </div>
            <div>
              <label htmlFor={`${panelId}-last`} className="label">
                {t('nameCheck.lastName')}
              </label>
              <input
                id={`${panelId}-last`}
                className="input"
                lang="az"
                autoComplete="off"
                maxLength={80}
                value={lastName}
                onChange={(e) => {
                  touched.current = true;
                  setLastName(e.target.value);
                }}
              />
            </div>
          </div>

          {q.isFetching && !d && (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <Spinner className="size-4" /> {t('nameCheck.checking')}
            </p>
          )}

          {d && typed && (
            <div className="space-y-4" aria-live="polite">
              <ul className="grid gap-2 sm:grid-cols-2">
                {variants.map((v) => (
                  <li key={v} className={clsx('rounded-xl border px-3 py-2.5', v === 'mrz' ? 'border-primary/40 bg-sunken' : 'border-line bg-card')}>
                    <p className="text-[11px] font-semibold text-muted uppercase">{t(`nameCheck.variants.${v}`)}</p>
                    <p className={clsx('mt-0.5 font-semibold break-words text-ink', (v === 'mrz' || v === 'icaoAlt') && 'font-mono tracking-wide')}>{joined(d.analysis, v)}</p>
                    <p className="mt-1 text-xs text-muted">{t(`nameCheck.variantHint.${v}`)}</p>
                  </li>
                ))}
              </ul>

              <div>
                <p className="text-xs font-semibold text-muted">{t('nameCheck.mrzField')}</p>
                <p className="mt-1 overflow-x-auto rounded-lg bg-sunken px-3 py-2 font-mono text-xs tracking-wider whitespace-nowrap text-ink sm:text-sm">P&lt;AZE{d.analysis.mrzField.field}</p>
                {d.analysis.mrzField.truncated && <p className="mt-1 text-xs text-warning-fg">{t('nameCheck.truncated')}</p>}
              </div>

              {d.analysis.letters.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <caption className="pb-1 text-left text-xs font-semibold text-muted">{t('nameCheck.letters')}</caption>
                    <thead className="text-xs text-muted">
                      <tr>
                        <th scope="col" className="py-1 pr-3 font-semibold">{t('nameCheck.letter')}</th>
                        <th scope="col" className="py-1 pr-3 font-semibold">{t('nameCheck.variants.mrz')}</th>
                        <th scope="col" className="py-1 pr-3 font-semibold">{t('nameCheck.variants.icaoAlt')}</th>
                        <th scope="col" className="py-1 pr-3 font-semibold">{t('nameCheck.variants.english')}</th>
                        <th scope="col" className="py-1 font-semibold">{t('nameCheck.variants.german')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.analysis.letters.map((l) => (
                        <tr key={l.letter} className="border-t border-line">
                          <th scope="row" className="py-1.5 pr-3 font-semibold text-ink" lang="az">
                            {l.letter.toLocaleUpperCase('az')} {l.letter}
                          </th>
                          <td className="py-1.5 pr-3 font-mono">{l.mrz}</td>
                          <td className="py-1.5 pr-3 font-mono">{l.icaoAlt}</td>
                          <td className="py-1.5 pr-3">{l.english}</td>
                          <td className="py-1.5">{l.german}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {d.analysis.letters.some((l) => l.notInIcao) && <p className="mt-1 text-xs text-muted">{t('nameCheck.notInIcao')}</p>}
                </div>
              )}

              <div className="rounded-xl border border-line p-3">
                <p className="text-xs font-semibold text-muted uppercase">{t('nameCheck.onFile')}</p>
                {d.onFile ? (
                  <>
                    <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-ink">
                      {d.onFile.surname} &lt;&lt; {d.onFile.givenNames}
                      <span className="ml-2 font-sans text-xs font-normal text-muted">{date(d.onFile.uploadedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </p>
                    {!d.onFile.valid && <p className="mt-1 text-xs text-muted">{t('nameCheck.notValid')}</p>}
                    {cmp && <ComparisonView c={cmp} />}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted">{t('nameCheck.noPassport')}</p>
                )}
              </div>

              {profileDiff && (
                <p className="flex gap-2 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-fg" role="alert">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{audience === 'staff' ? t('nameCheck.staffProfileWarn', { name: profileDiff }) : t('nameCheck.profileWarn', { name: profileDiff })}</span>
                </p>
              )}
            </div>
          )}

          <p className="text-[11px] text-muted">
            {t('nameCheck.source', { date: date(AS_OF, { day: 'numeric', month: 'long', year: 'numeric' }) })}{' '}
            <a href={ICAO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-link hover:underline">
              ICAO Doc 9303 <ExternalLink className="size-3" aria-hidden />
            </a>
          </p>
        </div>
      )}
    </section>
  );
};

const ComparisonView = ({ c }: { c: Comparison }) => {
  const { t } = useTranslation();
  const Icon = STATUS_ICON[c.status];
  return (
    <div className="mt-2 space-y-2">
      <p className={clsx('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-semibold', STATUS_TONE[c.status])} role="status">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden /> {t(`nameCheck.status.${c.status}`)}
      </p>
      {c.status !== 'exact' && (
        <dl className="grid gap-1 text-xs sm:grid-cols-2">
          {(['surname', 'givenNames'] as const).map((k) => (
            <div key={k} className="rounded-lg bg-sunken px-3 py-2">
              <dt className="font-semibold text-muted">
                {t(`nameCheck.part.${k}`)} · {t(`nameCheck.status.${c[k]}`)}
              </dt>
              <dd className="mt-0.5 font-mono text-ink">
                {t('nameCheck.expected')}: {c.expected[k] || '—'}
              </dd>
              <dd className="font-mono text-ink">
                {t('nameCheck.passport')}: {c.passport[k] || '—'}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};

export default NameChecker;
