import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  AlertTriangle,
  BriefcaseBusiness,
  Clock,
  Database,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  History,
  Languages,
  Mail,
  MessageCircle,
  MessageSquareText,
  Monitor,
  Send,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesPrivacy } from '@/i18n/pagesPrivacy';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/portal/ConfirmDialog';
import { PublicStatusSettings } from '@/components/site/PublicStatusSettings';
import { AccessLogSection } from '@/components/privacy/AccessLogSection'; // "who viewed my documents"
import { LegalVersions } from '@/components/legal/LegalVersions';
import { useHashScroll } from '@/components/portal/useOverview';
import {
  CLIENT_REQUEST_TYPES,
  STATUS_TONE,
  TOGGLE_TYPES,
  isOpenStatus,
  type ClientRequestType,
  type MyPrivacyRequest,
  type PrivacyState,
  type ToggleType,
} from '@/components/privacy/types';

registerCopy(pagesPrivacy);

const KEY = ['privacy-center'] as const;

const TOGGLE_ICON: Record<ToggleType, LucideIcon> = {
  MARKETING_EMAIL: Mail,
  WHATSAPP: MessageCircle,
  SMS: MessageSquareText,
  EMPLOYER_SHARING: BriefcaseBusiness,
};

const usePrivacyError = () => {
  const { t, i18n } = useTranslation();
  return (err: unknown) => {
    const key = `privacy.errors.${errorCode(err)}`;
    toast.error(i18n.exists(key) ? t(key) : t('privacy.errors.generic'));
  };
};

const Panel = ({ title, icon: Icon, intro, children, id }: { title: string; icon: LucideIcon; intro?: ReactNode; children: ReactNode; id?: string }) => (
  <section className="card card-pad" aria-labelledby={id}>
    <h2 id={id} className="type-card-title flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-soft">
        <Icon className="size-4.5" aria-hidden />
      </span>
      {title}
    </h2>
    {intro && <p className="mt-2 text-sm leading-relaxed text-muted">{intro}</p>}
    <div className="mt-5">{children}</div>
  </section>
);

const StatusBadge = ({ status }: { status: MyPrivacyRequest['status'] }) => {
  const { t } = useTranslation();
  return <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', STATUS_TONE[status])}>{t(`privacy.status.${status}`)}</span>;
};

// ─── Consents ──────────────────────────────────────────────────────────

const ConsentSwitch = ({
  type,
  state,
  busy,
  onChange,
}: {
  type: ToggleType;
  state: PrivacyState;
  busy: boolean;
  onChange: (type: ToggleType, v: boolean) => void;
}) => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const id = useId();
  const c = state.consents[type];
  const checked = !!c.granted;
  const Icon = TOGGLE_ICON[type];
  const phoneMissing = (type === 'WHATSAPP' || type === 'SMS') && !state.hasPhone;
  return (
    <div className="flex items-start gap-4 rounded-xl border border-line bg-card p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p id={`${id}-l`} className="text-sm font-semibold text-ink">
          {t(`privacy.consentType.${type}`)}
        </p>
        <p id={`${id}-h`} className="text-xs leading-relaxed text-muted">
          {t(`privacy.consents.hint.${type}`)}
        </p>
        <p className="mt-1 text-[11px] text-muted">{c.at ? t('privacy.consents.lastChange', { date: dateTime(c.at) }) : t('privacy.consents.never')}</p>
        {phoneMissing && checked && <p className="mt-1 text-[11px] text-warning-fg">{t('privacy.consents.noPhone')}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={`${id}-h`}
        disabled={busy}
        onClick={() => onChange(type, !checked)}
        className={clsx(
          'relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60',
          checked ? 'bg-primary' : 'bg-line-strong',
        )}
      >
        <span className={clsx('inline-block size-5 rounded-full bg-card shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
      </button>
    </div>
  );
};

const ConsentsPanel = ({ state }: { state: PrivacyState }) => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const qc = useQueryClient();
  const onError = usePrivacyError();
  const m = useMutation({
    mutationFn: async (body: Partial<Record<ToggleType, boolean>>) => (await api.put<PrivacyState & { changed: number }>('/privacy/consents', body)).data,
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
      if (data.changed) toast.success(t('privacy.consents.saved'));
    },
    onError,
  });
  const given = (['PRIVACY_POLICY', 'TERMS', 'PASSPORT_OCR'] as const).filter((k) => state.consents[k].granted !== null);
  return (
    <Panel id="privacy-consents" title={t('privacy.consents.title')} icon={ShieldCheck} intro={t('privacy.consents.intro')}>
      <div className="space-y-3">
        {TOGGLE_TYPES.map((type) => (
          <ConsentSwitch key={type} type={type} state={state} busy={m.isPending} onChange={(k, v) => m.mutate({ [k]: v })} />
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">{t('privacy.consents.serviceMail')}</p>
      {given.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-ink">{t('privacy.consents.given')}</h3>
          <ul className="mt-2 space-y-1.5">
            {given.map((k) => {
              const c = state.consents[k];
              return (
                <li key={k} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className={clsx('font-medium', c.granted ? 'text-ink' : 'text-muted line-through')}>{t(`privacy.consentType.${k}`)}</span>
                  <span className="text-xs text-muted">{c.at && t('privacy.consents.givenAt', { date: dateTime(c.at), version: c.version ?? '—' })}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
};

const HistoryPanel = ({ state }: { state: PrivacyState }) => {
  const { t, i18n } = useTranslation();
  const { dateTime } = useL10n();
  const [all, setAll] = useState(false);
  const rows = all ? state.history : state.history.slice(0, 8);
  const sourceLabel = (s: string) =>
    i18n.exists(`privacy.source.${s}`) ? t(`privacy.source.${s}`) : i18n.exists(`legalDocs.sources.${s}`) ? t(`legalDocs.sources.${s}`) : t('privacy.source.other');
  // Cookie-banner rows (COOKIES*) are labelled by the legal-docs copy.
  const typeLabel = (type: string) => (i18n.exists(`privacy.consentType.${type}`) ? t(`privacy.consentType.${type}`) : t(`legalDocs.consentTypes.${type}`, { defaultValue: type }));
  return (
    <Panel id="privacy-history" title={t('privacy.history.title')} icon={History}>
      {state.history.length === 0 ? (
        <p className="text-sm text-muted">{t('privacy.history.empty')}</p>
      ) : (
        <>
          <ol className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{typeLabel(r.type)}</p>
                  <p className={clsx('text-xs font-semibold', r.granted ? 'text-success-fg' : 'text-warning-fg')}>
                    {r.granted ? t('privacy.history.granted') : t('privacy.history.withdrawn')}
                  </p>
                </div>
                <p className="text-right text-xs text-muted">
                  {dateTime(r.createdAt)}
                  <br />
                  {sourceLabel(r.source)} · v{r.version}
                </p>
              </li>
            ))}
          </ol>
          {state.history.length > 8 && (
            <button type="button" className="mt-3 min-h-10 text-sm font-semibold text-link hover:underline" onClick={() => setAll((v) => !v)}>
              {all ? '−' : `+${state.history.length - 8}`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
};

// ─── Requests ──────────────────────────────────────────────────────────

const RequestForm = ({ state }: { state: PrivacyState }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = usePrivacyError();
  const uid = useId();
  const [type, setType] = useState<ClientRequestType | null>(null);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [understood, setUnderstood] = useState(false);
  const openTypes = new Set(state.requests.filter((r) => isOpenStatus(r.status)).map((r) => r.type));

  const m = useMutation({
    mutationFn: async () => (await api.post('/privacy/requests', { type, message: message.trim() || undefined, currentPassword: type === 'DELETION' ? password : undefined })).data,
    onSuccess: () => {
      toast.success(t('privacy.requests.sent'));
      setType(null);
      setMessage('');
      setPassword('');
      setUnderstood(false);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError,
  });

  const deletion = type === 'DELETION';
  const canSubmit = !!type && !openTypes.has(type) && (type !== 'RECTIFICATION' || message.trim().length >= 5) && (!deletion || (password.length > 0 && understood));

  return (
    <Panel id="privacy-requests" title={t('privacy.requests.title')} icon={Send} intro={t('privacy.requests.intro')}>
      <fieldset>
        <legend className="sr-only">{t('privacy.requests.title')}</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {CLIENT_REQUEST_TYPES.map((k) => {
            const busyType = openTypes.has(k);
            return (
              <label
                key={k}
                className={clsx(
                  'flex cursor-pointer gap-3 rounded-xl border p-3.5 transition',
                  type === k ? (k === 'DELETION' ? 'border-danger-border bg-danger-bg' : 'border-line-strong bg-sunken') : 'border-line bg-card hover:border-line-strong',
                  busyType && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-type`}
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={type === k}
                  disabled={busyType}
                  onChange={() => setType(k)}
                />
                <span className="min-w-0">
                  <span className={clsx('block text-sm font-semibold', k === 'DELETION' ? 'text-danger-fg' : 'text-ink')}>{t(`privacy.requests.type.${k}.label`)}</span>
                  <span className="block text-xs leading-relaxed text-muted">{busyType ? t('privacy.requests.open') : t(`privacy.requests.type.${k}.hint`)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {type && (
        <form
          className="mt-5 space-y-4 border-t border-line pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) m.mutate();
          }}
        >
          {deletion && (
            <div className="rounded-xl border border-danger-border bg-danger-bg p-4 text-sm text-danger-fg" role="note">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                {t('privacy.deletion.title')}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
                <li>{t('privacy.deletion.c1')}</li>
                <li>{t('privacy.deletion.c2', { months: state.retention.months })}</li>
                <li>{t('privacy.deletion.c3')}</li>
                <li className="font-semibold">{t('privacy.deletion.c4')}</li>
              </ul>
              <p className="mt-2 text-xs">{t('privacy.deletion.review')}</p>
            </div>
          )}
          <div>
            <label htmlFor={`${uid}-msg`} className="label">
              {type === 'RECTIFICATION' ? t('privacy.requests.message') : t('privacy.requests.messageOptional')}
            </label>
            <textarea
              id={`${uid}-msg`}
              className="input min-h-24"
              maxLength={3000}
              value={message}
              placeholder={t(`privacy.requests.placeholder.${type}`)}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          {deletion && (
            <>
              <div>
                <label htmlFor={`${uid}-pw`} className="label">
                  {t('privacy.deletion.password')}
                </label>
                <input id={`${uid}-pw`} type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <label className="flex items-start gap-2.5 text-sm text-ink">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-danger" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                {t('privacy.deletion.understand')}
              </label>
            </>
          )}
          <div className="flex justify-end">
            <button type="submit" className={clsx('min-h-11 w-full sm:w-auto', deletion ? 'btn-danger' : 'btn-primary')} disabled={!canSubmit || m.isPending}>
              {m.isPending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />}
              {deletion ? t('privacy.deletion.submit') : t('privacy.requests.submit')}
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
};

const MyRequests = ({ state }: { state: PrivacyState }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const qc = useQueryClient();
  const onError = usePrivacyError();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async (id: string) => (await api.post(`/privacy/requests/${id}/cancel`)).data,
    onSuccess: () => {
      toast.success(t('privacy.requests.cancelled'));
      setCancelId(null);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError,
  });
  return (
    <Panel id="privacy-mine" title={t('privacy.requests.mine')} icon={FileText}>
      {state.requests.length === 0 ? (
        <p className="text-sm text-muted">{t('privacy.requests.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {state.requests.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{t(`privacy.typeName.${r.type}`)}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {t('privacy.requests.created', { date: date(r.createdAt) })}
                {' · '}
                {r.completedAt ? t('privacy.requests.completed', { date: date(r.completedAt) }) : t('privacy.requests.due', { date: date(r.dueAt) })}
              </p>
              {r.message && <p className="mt-2 text-sm whitespace-pre-line text-ink/80">{r.message}</p>}
              {r.decisionNote && r.type !== 'EXPORT' && (
                <p className="mt-2 rounded-lg bg-sunken px-3 py-2 text-sm whitespace-pre-line text-ink">
                  <span className="font-semibold">{t('privacy.requests.decision')}: </span>
                  {r.decisionNote}
                </p>
              )}
              {r.status === 'OPEN' && (
                <button type="button" className="mt-2 min-h-10 text-sm font-semibold text-link hover:underline" onClick={() => setCancelId(r.id)}>
                  {t('privacy.requests.cancel')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!cancelId}
        title={t('privacy.requests.cancelTitle')}
        confirmLabel={t('privacy.requests.cancel')}
        busy={m.isPending}
        onConfirm={() => cancelId && m.mutate(cancelId)}
        onClose={() => setCancelId(null)}
      >
        <p>{t('privacy.requests.cancelText')}</p>
      </ConfirmDialog>
    </Panel>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

export default function AccountPrivacyCenter() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  usePageTitle(t('privacy.page.title'));
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<PrivacyState>('/privacy')).data,
  });
  useHashScroll(!!data); // "#legal" from the portal home ("Accept the new terms")

  if (isLoading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-primary" role="status">
        <Spinner className="size-8 border-[3px]" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="card card-pad text-center" role="alert">
        <p className="text-sm text-muted">{t('privacy.errors.generic')}</p>
        <button type="button" className="btn-primary mt-4 min-h-11" onClick={() => refetch()}>
          {t('privacy.errors.retry')}
        </button>
      </div>
    );
  }

  const cards: { key: keyof PrivacyState['overview']; icon: LucideIcon }[] = [
    { key: 'cases', icon: FolderOpen },
    { key: 'documents', icon: FileText },
    { key: 'messages', icon: MessageSquareText },
    { key: 'translationOrders', icon: Languages },
    { key: 'sessions', icon: Monitor },
    { key: 'devices', icon: Smartphone },
  ];

  return (
    <div className="space-y-6">
      <section className="card card-pad">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-ink sm:text-2xl">
          <ShieldCheck className="size-6 shrink-0 text-primary" aria-hidden />
          {t('privacy.page.title')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('privacy.page.subtitle')}</p>
        <dl className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            { k: 'what', icon: Database, text: t('privacy.page.what') },
            { k: 'why', icon: ShieldCheck, text: t('privacy.page.why') },
            { k: 'howLong', icon: Clock, text: t('privacy.page.howLong', { months: data.retention.months }) },
          ].map(({ k, icon: Icon, text }) => (
            <div key={k} className="rounded-xl bg-sunken p-4">
              <dt className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon className="size-4 text-link" aria-hidden />
                {t(`privacy.page.${k}Title`)}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-ink/80">{text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link to="/privacy" target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-link hover:underline">
            {t('privacy.page.policyLink')}
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
          <span className="text-xs text-muted">{t('privacy.page.policyVersion', { version: data.policyVersion })}</span>
        </p>
        {/* Versioned legal texts: current AGB / privacy version vs. the version accepted. */}
        {data.legal?.length ? (
          <div id="legal" className="scroll-mt-28 lg:scroll-mt-36">
            <LegalVersions items={data.legal} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="privacy-overview">
        <h2 id="privacy-overview" className="mb-3 text-lg font-semibold text-ink">
          {t('privacy.overview.title')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cards.map(({ key, icon: Icon }) => (
            <div key={key} className="rounded-xl border border-line bg-card p-4">
              <Icon className="size-4.5 text-primary" aria-hidden />
              <p className="mt-2 font-display text-2xl font-bold text-ink tabular-nums">{data.overview[key]}</p>
              <p className="text-xs text-muted">{t(`privacy.overview.${key}`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Public status check (/status) + family link + browser notifications (site features) */}
      <PublicStatusSettings />

      <Panel id="privacy-export" title={t('privacy.export.title')} icon={Download} intro={t('privacy.export.text')}>
        <a
          href="/api/privacy/export"
          download
          className="btn-primary min-h-11 w-full sm:w-auto"
          onClick={() => window.setTimeout(() => void qc.invalidateQueries({ queryKey: KEY }), 1500)}
        >
          <Download className="size-4" aria-hidden />
          {t('privacy.export.button')}
        </a>
        <p className="mt-2 text-xs text-muted">{t('privacy.export.note')}</p>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <ConsentsPanel state={data} />
        <HistoryPanel state={data} />
      </div>

      <RequestForm state={data} />
      <MyRequests state={data} />

      <Panel id="privacy-access-log" title={t('accessLog.title')} icon={ShieldCheck} intro={t('accessLog.subtitle')}>
        <AccessLogSection endpoint="/privacy/access-log" />
      </Panel>
    </div>
  );
}
