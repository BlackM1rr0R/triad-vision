import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MapPin, Send, SearchX, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { buttonClass } from '@/components/ui/Button';
import { Success } from '@/components/illustrations';
import { ConfirmDialog } from '@/components/portal/ConfirmDialog';
import { fmtDate } from '@/components/admin/labels';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { leadContext } from '@/lib/leadVisitor';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesVacancyRequest } from '@/i18n/pagesVacancyRequest';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { useAlertOptions } from './JobAlertForm';

registerCopy(pagesVacancyRequest);

export const REQUEST_SECTORS = ['logistics', 'courier', 'industry', 'construction', 'hospitality', 'healthcare', 'agriculture', 'other'] as const;
export const REQUEST_TYPES = ['WORK', 'AUSBILDUNG'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export const REQUEST_STATUSES = ['NEW', 'IN_PROGRESS', 'OFFERED', 'CLOSED'] as const;
const LEVELS = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const FREE = '__other';

/** One entry of GET /api/vacancy-requests/mine (server lib/vacancyRequests/service.ts → requestView). */
export interface MyVacancyRequest {
  id: string;
  type: RequestType;
  sector: string | null;
  profession: string | null;
  city: string | null;
  germanLevel: string | null;
  note: string | null;
  status: (typeof REQUEST_STATUSES)[number];
  cancelled: boolean;
  createdAt: string;
  lastOfferedAt: string | null;
  offers: { slug: string; title: L10n; city: string | null; sentAt: string }[];
}

export const VACANCY_REQUESTS_KEY = ['vacancy-requests', 'mine'];

/**
 * "Vakansiya sorğusu" — I want this kind of job (server lib/vacancyRequests). Shown on the public vacancies page (also
 * Ausbildung: it is the same list with a type filter), in its empty state and on deactivated vacancy pages (prefilled
 * from the vacancy with `sourceVacancySlug`). Signed-in clients send with one click when the request is prefilled (details
 * can be edited); guests give a name, a phone and / or e-mail and tick the consent box (honeypot + rate limit on the
 * server; the request also reaches the team as a lead). No visa application is opened by a request.
 */
export const VacancyRequestForm = ({
  type: initialType,
  sector: initialSector,
  profession: initialProfession,
  city: initialCity,
  sourceVacancySlug,
  variant = 'default',
  className,
  bare,
  onDone,
}: {
  type?: RequestType;
  sector?: string | null;
  profession?: string | null;
  city?: string | null;
  sourceVacancySlug?: string;
  variant?: 'default' | 'deactivated' | 'empty';
  className?: string;
  bare?: boolean;
  onDone?: () => void;
}) => {
  const { t } = useTranslation();
  const id = useId();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isClient = user?.role === 'CLIENT';
  const { data: options } = useAlertOptions();
  const sectorKnown = initialSector && (REQUEST_SECTORS as readonly string[]).includes(initialSector) ? initialSector : '';
  const prefilled = !!(sourceVacancySlug || sectorKnown || initialProfession);
  const quick = isClient && prefilled;
  const [editing, setEditing] = useState(!quick);
  const [type, setType] = useState<RequestType>(initialType ?? 'WORK');
  const [sector, setSector] = useState<string>(sectorKnown);
  const known = (k: string | null | undefined) => (k && options?.professions.some((p) => p.key === k) ? k : '');
  const [profKey, setProfKey] = useState<string>(initialProfession ? (known(initialProfession) || (options ? FREE : '')) : '');
  const [profFree, setProfFree] = useState(initialProfession && !known(initialProfession) ? initialProfession : '');
  const [city, setCity] = useState(initialCity ?? '');
  const [germanLevel, setGermanLevel] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<{ s: 'idle' | 'sending' | 'error' | 'done'; msg?: string; already?: boolean }>({ s: 'idle' });

  const profession = profKey === FREE ? profFree.trim() : profKey;
  const needsPick = !sourceVacancySlug && !sector && !profession;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (needsPick) return setState({ s: 'error', msg: t('vreq.errors.pickProfession') });
    if (!isClient) {
      if (!name.trim()) return setState({ s: 'error', msg: t('vreq.errors.name') });
      if (!phone.trim() && !email.trim()) return setState({ s: 'error', msg: t('vreq.errors.contact') });
      if (!consent) return setState({ s: 'error', msg: t('vreq.errors.consent') });
    }
    setState({ s: 'sending' });
    try {
      const { data } = await api.post<{ already?: boolean }>('/vacancy-requests', {
        type,
        sector: sector || null,
        profession: profession || null,
        city: city.trim() || null,
        germanLevel: germanLevel || null,
        note: note.trim() || null,
        lng: currentSiteLocale(),
        sourceVacancySlug,
        ...(isClient ? {} : { name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined, consent, website, ...leadContext() }),
      });
      setState({ s: 'done', already: !!data.already });
      if (isClient) await qc.invalidateQueries({ queryKey: VACANCY_REQUESTS_KEY });
      onDone?.();
    } catch (err) {
      const code = errorCode(err);
      setState({ s: 'error', msg: code === 'TOO_MANY_REQUESTS' ? t('vreq.errors.tooMany') : code === 'INVALID_PHONE' ? t('vreq.errors.phone') : code === 'PROFESSION_REQUIRED' ? t('vreq.errors.pickProfession') : t('vreq.errors.generic') });
    }
  };

  const frame = bare ? className : clsx('card card-pad rounded-3xl', className);

  if (state.s === 'done') {
    return (
      <div className={clsx(frame, 'text-center')} role="status" data-testid="vreq-done">
        <Success className="mx-auto w-28" />
        <p className="mt-3 font-display text-lg font-semibold text-ink">{t('vreq.doneTitle')}</p>
        <p className="mt-1 text-sm text-muted">{state.already ? t('vreq.already') : t('vreq.doneText')}</p>
        <button type="button" className="mt-3 min-h-11 text-sm font-semibold text-link hover:underline" onClick={() => setState({ s: 'idle' })}>
          {t('vreq.another')}
        </button>
      </div>
    );
  }

  const intro = variant === 'deactivated' ? t('vreq.textDeactivated') : variant === 'empty' ? t('vreq.textEmpty') : t('vreq.text');
  const title = variant === 'deactivated' ? t('vreq.deactivatedCta') : t('vreq.title');

  return (
    <section className={frame} aria-labelledby={`${id}-title`} data-testid="vreq-form">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-soft" aria-hidden>
          <SearchX className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted">{intro}</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        {quick && !editing ? (
          <p className="text-sm text-ink">
            <span className="font-semibold">{t(`vreq.type.${type}`)}</span>
            {sector && <span className="text-muted"> · {t(`vreq.sectors.${sector}`)}</span>}
            {profession && <span className="text-muted"> · {options?.professions.find((p) => p.key === profession)?.label ?? profession}</span>}
          </p>
        ) : (
          <>
            <fieldset>
              <legend className="label">{t('vreq.type.label')}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {REQUEST_TYPES.map((k) => (
                  <label key={k} className={clsx('flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm', type === k ? 'border-primary bg-primary/5 font-semibold text-ink' : 'border-line text-muted')}>
                    <input type="radio" name={`${id}-type`} className="accent-primary" checked={type === k} onChange={() => setType(k)} />
                    {t(`vreq.type.${k}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-sector`} className="label">
                  {t('vreq.sector')}
                </label>
                <select id={`${id}-sector`} className="input" value={sector} onChange={(e) => setSector(e.target.value)}>
                  <option value="">{t('vreq.sectorAny')}</option>
                  {REQUEST_SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {t(`vreq.sectors.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-prof`} className="label">
                  {t('vreq.profession')}
                </label>
                <select id={`${id}-prof`} className="input" value={profKey} onChange={(e) => setProfKey(e.target.value)}>
                  <option value="">{t('vreq.professionChoose')}</option>
                  {(options?.professions ?? []).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                  <option value={FREE}>{t('vreq.professionOther')}</option>
                </select>
              </div>
            </div>
            {profKey === FREE && (
              <div>
                <label htmlFor={`${id}-free`} className="label">
                  {t('vreq.professionFree')}
                </label>
                <input id={`${id}-free`} className="input" maxLength={120} value={profFree} onChange={(e) => setProfFree(e.target.value)} />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-city`} className="label">
                  {t('vreq.city')}
                </label>
                <input id={`${id}-city`} className="input" maxLength={80} autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} aria-describedby={`${id}-city-hint`} />
                <p id={`${id}-city-hint`} className="mt-1 text-xs text-muted">
                  {t('vreq.cityHint')}
                </p>
              </div>
              <div>
                <label htmlFor={`${id}-de`} className="label">
                  {t('vreq.german')}
                </label>
                <select id={`${id}-de`} className="input" value={germanLevel} onChange={(e) => setGermanLevel(e.target.value)}>
                  <option value="">{t('vreq.germanAny')}</option>
                  {LEVELS.filter((l) => l !== 'none' && l !== 'C2').map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                  <option value="none">{t('vreq.germanNone')}</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor={`${id}-note`} className="label">
                {t('vreq.note')}
              </label>
              <textarea id={`${id}-note`} className="input min-h-20" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={`${id}-note-hint`} />
              <p id={`${id}-note-hint`} className="mt-1 text-xs text-muted">
                {t('vreq.noteHint')}
              </p>
            </div>
          </>
        )}

        {isClient ? (
          <p className="text-sm text-muted">{t('vreq.account', { email: user?.email ?? '' })}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor={`${id}-name`} className="label">
                  {t('vreq.name')}
                </label>
                <input id={`${id}-name`} required maxLength={120} autoComplete="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${id}-phone`} className="label">
                  {t('vreq.phone')}
                </label>
                <input id={`${id}-phone`} type="tel" maxLength={40} autoComplete="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${id}-email`} className="label">
                  {t('vreq.email')}
                </label>
                <input id={`${id}-email`} type="email" maxLength={190} autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted">{t('vreq.contactHint')}</p>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>
                {t('vreq.consent')}{' '}
                <Link to="/privacy" target="_blank" className="text-link underline">
                  {t('vreq.privacyLink')}
                </Link>
              </span>
            </label>
            {/* honeypot for bots */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} />
          </>
        )}

        {state.s === 'error' && (
          <p className="rounded-xl bg-danger-bg p-3 text-sm text-danger-fg" role="alert">
            {state.msg}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClass({ className: 'w-full sm:w-auto' })} disabled={state.s === 'sending'}>
            <Send className="size-4" aria-hidden /> {state.s === 'sending' ? t('vreq.sending') : t(quick && !editing ? 'vreq.quick' : 'vreq.submit')}
          </button>
          {quick && !editing && (
            <button type="button" className="min-h-11 text-sm font-semibold text-link hover:underline" onClick={() => setEditing(true)}>
              {t('vreq.details')}
            </button>
          )}
        </div>
      </form>
    </section>
  );
};

/** What a request asks for, as one line ("Work · Logistics · truck driver · Hamburg"). */
export const useRequestLine = () => {
  const { t } = useTranslation();
  const { data: options } = useAlertOptions();
  return (r: Pick<MyVacancyRequest, 'type' | 'sector' | 'profession' | 'city'>) =>
    [t(`vreq.type.${r.type}`), r.sector ? t(`vreq.sectors.${r.sector}`) : null, r.profession ? (options?.professions.find((p) => p.key === r.profession)?.label ?? r.profession) : null, r.city].filter(Boolean).join(' · ');
};

/**
 * Cabinet (Home › My applications): the client's own vacancy requests with their status and the vacancies offered to them,
 * cancel with a confirmation, and a new request. Read-only GET (no writes while staff view the account).
 */
export const MyVacancyRequests = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const l10n = useL10n();
  const qc = useQueryClient();
  const line = useRequestLine();
  const [adding, setAdding] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: VACANCY_REQUESTS_KEY,
    queryFn: async () => (await api.get<{ items: MyVacancyRequest[] }>('/vacancy-requests/mine')).data.items,
  });
  const cancel = useMutation({
    mutationFn: async (rid: string) => api.post(`/vacancy-requests/mine/${rid}/cancel`),
    onSuccess: async () => {
      toast.success(t('vreq.mine.cancelDone'));
      setCancelId(null);
      await qc.invalidateQueries({ queryKey: VACANCY_REQUESTS_KEY });
    },
    onError: () => toast.error(t('vreq.errors.generic')),
  });

  return (
    <section className={clsx('card card-pad rounded-3xl', className)} aria-labelledby="vreq-mine-title" data-testid="vreq-mine">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="vreq-mine-title" className="font-display text-lg font-semibold text-ink">
            {t('vreq.mine.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('vreq.mine.text')}</p>
        </div>
        <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => setAdding((v) => !v)}>
          <Send className="size-4" aria-hidden /> {t('vreq.mine.new')}
        </button>
      </div>

      {adding && (
        <VacancyRequestForm
          bare
          className="mt-4 rounded-2xl border border-line p-4"
          onDone={() => setAdding(false)}
        />
      )}

      {isLoading ? null : !data?.length ? (
        <p className="mt-4 text-sm text-muted">{t('vreq.mine.empty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {data.map((r) => (
            <li key={r.id} className="px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{line(r)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden /> {r.city || t('vreq.mine.anyCity')}
                    </span>
                    <span>{t('vreq.mine.sentOn', { date: fmtDate(r.createdAt) })}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', r.status === 'OFFERED' ? 'bg-success-bg text-success-fg' : r.status === 'CLOSED' ? 'bg-sunken text-muted' : 'chip-soft')}>
                    {r.cancelled ? t('vreq.mine.cancelled') : t(`vreq.mine.status.${r.status}`)}
                  </span>
                  {r.status !== 'CLOSED' && (
                    <button type="button" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-muted hover:bg-sunken hover:text-danger-fg" onClick={() => setCancelId(r.id)}>
                      <Trash2 className="size-4" aria-hidden />
                      <span className="sr-only">{t('vreq.mine.cancel')}</span>
                    </button>
                  )}
                </div>
              </div>
              {r.offers.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-ink">{t('vreq.mine.offers')}</p>
                  <ul className="mt-1 space-y-1">
                    {r.offers.map((o) => (
                      <li key={o.slug}>
                        <Link to={`/jobs/${o.slug}`} className="text-sm font-semibold text-link hover:underline">
                          {l10n.tr(o.title)}
                        </Link>
                        {o.city && <span className="text-xs text-muted"> · {o.city}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog open={!!cancelId} title={t('vreq.mine.cancelTitle')} confirmLabel={t('vreq.mine.cancel')} danger busy={cancel.isPending} onConfirm={() => cancelId && cancel.mutate(cancelId)} onClose={() => setCancelId(null)}>
        {t('vreq.mine.cancelText')}
      </ConfirmDialog>
    </section>
  );
};

export default VacancyRequestForm;
