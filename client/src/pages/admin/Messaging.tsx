import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileText, Inbox, MessageCircle, Plug, RefreshCw, RotateCcw, Save, Search, Send, Smartphone, XCircle } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { LOCALES, registerCopy, type Locale } from '@/i18n';
import { pagesMessaging } from '@/i18n/pagesMessaging';
import { Flag } from '@/components/ui/Flag';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime, fmtRelative, fullName, toastError } from '@/components/admin/labels';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, StatTile } from '@/components/admin/ui';

registerCopy(pagesMessaging);

// ─── Types (API: server/src/routes/admin/messaging.ts) ────────────────

type Channel = 'WHATSAPP' | 'SMS';
type OutboundStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'CONSOLE';

interface OutboundItem {
  id: string;
  channel: Channel;
  to: string;
  body: string;
  status: OutboundStatus;
  templateKey: string | null;
  providerId: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
  case: { id: string; number: string } | null;
}
interface OutboundResponse {
  items: OutboundItem[];
  total: number;
  pageSize: number;
  counts: Partial<Record<OutboundStatus, number>>;
}
interface ProvidersResponse {
  providers: {
    whatsapp: { configured: boolean; phoneNumberId: string; apiVersion: string; webhookVerify: boolean; webhookSignature: boolean; webhookSecret: boolean };
    sms: { configured: boolean; provider: string | null; from: string | null; url: string | null; accountSid: string | null };
    defaultCountryCode: string;
  };
}
interface TemplateLocale {
  default: { title: string; body: string };
  override: { title: string; body: string; updatedAt: string; updatedBy: { firstName: string; lastName: string } | null } | null;
}
interface TemplateType {
  type: string;
  placeholders: string[];
  locales: Record<Locale, TemplateLocale>;
}
interface TemplatesResponse {
  types: TemplateType[];
  samples: Record<Locale, Record<string, string>>;
}

const TABS = ['outbound', 'providers', 'templates'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON = { outbound: Inbox, providers: Plug, templates: FileText } as const;

const STATUS_TONE: Record<OutboundStatus, string> = {
  QUEUED: 'bg-slate-100 text-slate-700',
  SENT: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
  CONSOLE: 'bg-amber-100 text-amber-800',
};

const OUTBOUND_KEY = 'admin-messaging-outbound';
const PROVIDERS_KEY = ['admin-messaging-providers'] as const;
const TEMPLATES_KEY = ['admin-messaging-templates'] as const;

/** Same interpolation as the server (lib/messaging/templates.ts): unknown placeholders render empty. */
const render = (tpl: string, params: Record<string, string>) => tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => params[k] ?? '');
const placeholdersIn = (tpl: string) => Array.from(new Set(Array.from(tpl.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g), (m) => m[1])));

// ─── Outbound log ──────────────────────────────────────────────────────

const ChannelLabel = ({ channel }: { channel: Channel }) => (
  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', channel === 'WHATSAPP' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700')}>
    {channel === 'WHATSAPP' ? <MessageCircle className="size-3" aria-hidden /> : <Smartphone className="size-3" aria-hidden />}
    {channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}
  </span>
);

const OutboundTab = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const channel = (params.get('channel') as Channel | null) ?? '';
  const status = (params.get('status') as OutboundStatus | null) ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [q, setQ] = useState(search);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [OUTBOUND_KEY, { channel, status, page, q }],
    queryFn: async () =>
      (await api.get<OutboundResponse>('/admin/messaging/outbound', { params: { page, channel: channel || undefined, status: status || undefined, search: q || undefined } })).data,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  const resend = useMutation({
    mutationFn: async (id: string) => (await api.post<{ item: OutboundItem }>(`/admin/messaging/outbound/${id}/resend`)).data.item,
    onSuccess: (item) => {
      toast.success(t('messaging.admin.outbound.resent', { status: t(`messaging.admin.outbound.statuses.${item.status}`) }));
      void qc.invalidateQueries({ queryKey: [OUTBOUND_KEY] });
    },
    onError: (err) => toastError(err),
  });

  const items = data?.items ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const canResend = hasMinRole(user?.role, 'ADMIN');
  const counts = data?.counts ?? {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {(['SENT', 'FAILED', 'QUEUED', 'CONSOLE'] as OutboundStatus[]).map((s) => (
          <StatTile
            key={s}
            label={t(`messaging.admin.outbound.statuses.${s}`)}
            value={counts[s] ?? 0}
            tone={s === 'FAILED' && (counts[s] ?? 0) > 0 ? 'danger' : s === 'SENT' ? 'good' : undefined}
            icon={s === 'SENT' ? CheckCircle2 : s === 'FAILED' ? XCircle : s === 'QUEUED' ? RefreshCw : AlertTriangle}
          />
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">{t('admin.common.search')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" className="input pl-9" placeholder={t('messaging.admin.outbound.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <select aria-label={t('messaging.admin.outbound.channel')} className="input sm:w-48" value={channel} onChange={(e) => setParam('channel', e.target.value || null)}>
            <option value="">{t('messaging.admin.outbound.allChannels')}</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="SMS">SMS</option>
          </select>
          <button type="button" className="btn-white btn-sm border border-line" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={clsx('size-3.5', isFetching && 'animate-spin')} /> {t('admin.common.refresh')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('messaging.admin.outbound.status')}>
          <Chip active={!status} onClick={() => setParam('status', null)}>
            {t('messaging.admin.outbound.allStatuses')}
          </Chip>
          {(['SENT', 'FAILED', 'QUEUED', 'CONSOLE'] as OutboundStatus[]).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setParam('status', status === s ? null : s)} count={counts[s] ?? 0}>
              {t(`messaging.admin.outbound.statuses.${s}`)}
            </Chip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState icon={Inbox} title={t('messaging.admin.outbound.empty')}>
            {t('messaging.admin.outbound.emptyHint')}
          </EmptyState>
        </Panel>
      ) : (
        <Panel bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface text-left text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t('messaging.admin.outbound.channel')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('messaging.admin.outbound.to')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('messaging.admin.outbound.user')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('messaging.admin.outbound.case')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('messaging.admin.outbound.status')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('messaging.admin.outbound.time')}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((m) => (
                  <RowGroup key={m.id} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} item={m} canResend={canResend} resend={resend} />
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs" aria-label={t('admin.common.pagination')}>
              <button type="button" className="btn-white btn-sm border border-line" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
                {t('admin.common.prev')}
              </button>
              <span className="text-muted">{t('admin.common.pageOf', { page, pages })}</span>
              <button type="button" className="btn-white btn-sm border border-line" disabled={page >= pages} onClick={() => setParam('page', String(page + 1))}>
                {t('admin.common.next')}
              </button>
            </nav>
          )}
        </Panel>
      )}
      {data && <p className="text-xs text-muted">{t('messaging.admin.outbound.total', { count: data.total })}</p>}
    </div>
  );
};

const RowGroup = ({
  item: m,
  open,
  onToggle,
  canResend,
  resend,
}: {
  item: OutboundItem;
  open: boolean;
  onToggle: () => void;
  canResend: boolean;
  resend: { mutate: (id: string) => void; isPending: boolean; variables?: string };
}) => {
  const { t } = useTranslation();
  return (
    <>
      <tr className={clsx('cursor-pointer align-top transition hover:bg-surface/60', open && 'bg-surface/40')} onClick={onToggle}>
        <td className="px-4 py-3">
          <ChannelLabel channel={m.channel} />
        </td>
        <td className="px-4 py-3 font-mono text-xs tabular-nums">{m.to}</td>
        <td className="px-4 py-3">
          {m.user ? (
            <span className="block">
              <span className="font-medium text-navy-900">{fullName(m.user)}</span>
              <span className="block text-[11px] text-muted">{m.user.email}</span>
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          {m.case ? (
            <Link to={`/admin/cases/${m.case.id}`} className="font-semibold text-brand-600 hover:underline" onClick={(e) => e.stopPropagation()}>
              {m.case.number}
            </Link>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_TONE[m.status])} title={m.status === 'CONSOLE' ? t('messaging.admin.outbound.consoleHint') : undefined}>
            {t(`messaging.admin.outbound.statuses.${m.status}`)}
          </span>
          {m.error && <span className="mt-1 block max-w-[220px] truncate text-[11px] text-red-700" title={m.error}>{m.error}</span>}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted" title={fmtDateTime(m.sentAt ?? m.createdAt)}>
          {fmtRelative(m.sentAt ?? m.createdAt)}
        </td>
        <td className="px-4 py-3 text-right">
          {canResend && (m.status === 'FAILED' || m.status === 'QUEUED') && (
            <button
              type="button"
              className="btn-white btn-sm border border-line"
              disabled={resend.isPending && resend.variables === m.id}
              onClick={(e) => {
                e.stopPropagation();
                resend.mutate(m.id);
              }}
            >
              {resend.isPending && resend.variables === m.id ? <Spinner className="size-3.5" /> : <RotateCcw className="size-3.5" />} {t('messaging.admin.outbound.resend')}
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-surface/40">
          <td colSpan={7} className="px-4 pb-4">
            <dl className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div className="text-xs text-muted">
                <dt className="font-semibold">{t('messaging.admin.outbound.time')}</dt>
                <dd>{fmtDateTime(m.createdAt)}</dd>
                {m.templateKey && (
                  <>
                    <dt className="mt-2 font-semibold">Template</dt>
                    <dd className="font-mono">{m.templateKey}</dd>
                  </>
                )}
                {m.providerId && (
                  <>
                    <dt className="mt-2 font-semibold">Provider ID</dt>
                    <dd className="font-mono break-all">{m.providerId}</dd>
                  </>
                )}
                {m.error && (
                  <>
                    <dt className="mt-2 font-semibold text-red-700">{t('messaging.admin.outbound.error')}</dt>
                    <dd className="break-words text-red-700">{m.error}</dd>
                  </>
                )}
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted">{t('messaging.admin.outbound.body')}</dt>
                <dd className="mt-1 rounded-lg border border-line bg-white p-3 text-sm break-words whitespace-pre-wrap text-ink">{m.body}</dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
};

// ─── Providers ─────────────────────────────────────────────────────────

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
    <dt className="shrink-0 text-xs text-muted">{label}</dt>
    <dd className="min-w-0 text-right font-medium text-navy-900">{children}</dd>
  </div>
);

const YesNo = ({ v }: { v: boolean }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('inline-flex items-center gap-1', v ? 'text-emerald-700' : 'text-muted')}>
      {v ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
      {v ? t('messaging.admin.providers.yes') : t('messaging.admin.providers.no')}
    </span>
  );
};

const ConfiguredBadge = ({ ok }: { ok: boolean }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>
      {ok ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
      {ok ? t('messaging.admin.providers.configured') : t('messaging.admin.providers.notConfigured')}
    </span>
  );
};

const ProvidersTab = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: async () => (await api.get<ProvidersResponse>('/admin/messaging/providers')).data,
  });
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<Channel>('WHATSAPP');
  const test = useMutation({
    mutationFn: async () => (await api.post<{ item: OutboundItem | null }>('/admin/messaging/providers/test', { channel, to, text: text.trim() || undefined })).data.item,
    onSuccess: (item) => {
      if (item) toast.success(t('messaging.admin.providers.testResult', { status: t(`messaging.admin.outbound.statuses.${item.status}`) }));
      else toast.error(t('messaging.admin.providers.testFailed'));
    },
    onError: (err) => (errorCode(err) === 'INVALID_PHONE' ? toast.error(t('messaging.admin.providers.invalidPhone')) : toastError(err)),
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  const p = data.providers;
  const webhookUrl = `${window.location.origin}/api/messaging/webhooks/whatsapp`;
  const isRoot = user?.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-5">
      <p className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-xs leading-relaxed text-ink/80">{t('messaging.admin.providers.envHint')}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t('messaging.admin.providers.whatsapp')} icon={MessageCircle} actions={<ConfiguredBadge ok={p.whatsapp.configured} />}>
          <dl className="divide-y divide-line">
            <Row label={t('messaging.admin.providers.phoneNumberId')}>
              <span className="font-mono">{p.whatsapp.phoneNumberId || '—'}</span>
            </Row>
            <Row label={t('messaging.admin.providers.apiVersion')}>{p.whatsapp.apiVersion}</Row>
            <Row label={t('messaging.admin.providers.webhookUrl')}>
              <span className="font-mono text-xs break-all">{webhookUrl}</span>
            </Row>
            <Row label={t('messaging.admin.providers.webhookVerify')}>
              <YesNo v={p.whatsapp.webhookVerify} />
            </Row>
            <Row label={t('messaging.admin.providers.webhookSignature')}>
              <YesNo v={p.whatsapp.webhookSignature} />
            </Row>
            <Row label={t('messaging.admin.providers.webhookSecret')}>
              <YesNo v={p.whatsapp.webhookSecret} />
            </Row>
          </dl>
          <p className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t('messaging.admin.providers.window')}
          </p>
        </Panel>
        <Panel title={t('messaging.admin.providers.sms')} icon={Smartphone} actions={<ConfiguredBadge ok={p.sms.configured} />}>
          <dl className="divide-y divide-line">
            <Row label={t('messaging.admin.providers.provider')}>{p.sms.provider ?? '—'}</Row>
            {p.sms.from && <Row label={t('messaging.admin.providers.from')}>{p.sms.from}</Row>}
            {p.sms.accountSid && (
              <Row label={t('messaging.admin.providers.accountSid')}>
                <span className="font-mono">{p.sms.accountSid}</span>
              </Row>
            )}
            {p.sms.url && (
              <Row label={t('messaging.admin.providers.url')}>
                <span className="font-mono text-xs break-all">{p.sms.url}</span>
              </Row>
            )}
            <Row label={t('messaging.admin.providers.defaultCountry')}>+{p.defaultCountryCode}</Row>
          </dl>
        </Panel>
      </div>

      {isRoot && (
        <Panel title={t('messaging.admin.providers.test')} icon={Send}>
          <p className="mb-3 text-xs text-muted">{t('messaging.admin.providers.testHint')}</p>
          <form
            className="grid gap-3 sm:grid-cols-[10rem_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              test.mutate();
            }}
          >
            <select aria-label={t('messaging.admin.outbound.channel')} className="input" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SMS">SMS</option>
            </select>
            <input className="input" placeholder={`${t('messaging.admin.providers.testTo')} (+994…)`} value={to} onChange={(e) => setTo(e.target.value)} required aria-label={t('messaging.admin.providers.testTo')} />
            <input className="input" placeholder={t('messaging.admin.providers.testText')} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label={t('messaging.admin.providers.testText')} />
            <button type="submit" className="btn-primary btn-sm" disabled={!to.trim() || test.isPending}>
              {test.isPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />} {t('messaging.admin.providers.testSend')}
            </button>
          </form>
        </Panel>
      )}
    </div>
  );
};

// ─── Templates ─────────────────────────────────────────────────────────

type Draft = Record<Locale, { title: string; body: string }>;

const draftOf = (tt: TemplateType): Draft =>
  Object.fromEntries(LOCALES.map((l) => [l, { title: tt.locales[l].override?.title ?? '', body: tt.locales[l].override?.body ?? '' }])) as Draft;

const sameDraft = (a: Draft, b: Draft) => LOCALES.every((l) => a[l].title === b[l].title && a[l].body === b[l].body);

const TemplatesTab = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: async () => (await api.get<TemplatesResponse>('/admin/messaging/templates')).data,
  });
  const [selected, setSelected] = useState<string>('CASE_CREATED');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focusLocale, setFocusLocale] = useState<Locale>('az');
  const lastInput = useRef<{ locale: Locale; field: 'title' | 'body'; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);

  const current = useMemo(() => data?.types.find((x) => x.type === selected) ?? data?.types[0] ?? null, [data, selected]);
  const saved = useMemo(() => (current ? draftOf(current) : null), [current]);
  const dirty = !!draft && !!saved && !sameDraft(draft, saved);

  // Draft follows the selected type; a fresh server copy resets it when nothing was edited.
  useEffect(() => {
    if (saved) setDraft((d) => (d && current && dirtyRef.current ? d : saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const select = (type: string) => {
    if (type === selected) return;
    if (dirty && !window.confirm(t('messaging.admin.templates.unsavedLeave'))) return;
    setSelected(type);
    setDraft(null);
  };

  const save = useMutation({
    mutationFn: async ({ locale, title, body }: { locale: Locale; title: string; body: string }) =>
      (await api.put(`/admin/messaging/templates/${current!.type}/${locale}`, { title, body })).data,
    onSuccess: (_d, v) => {
      toast.success(v.title.trim() || v.body.trim() ? t('messaging.admin.templates.saved') : t('messaging.admin.templates.resetDone'));
      void qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
    onError: (err) => {
      const code = errorCode(err);
      if (code === 'TITLE_AND_BODY_REQUIRED') toast.error(t('messaging.admin.templates.bothRequired'));
      else if (code === 'UNKNOWN_PLACEHOLDER') toast.error(t('messaging.admin.templates.unknown', { list: '' }));
      else toastError(err);
    },
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data || !current || !draft || !saved) return <ErrorBlock error={error} onRetry={() => refetch()} />;

  const samples = data.samples;
  const insert = (ph: string) => {
    const target = lastInput.current;
    const token = `{{${ph}}}`;
    if (!target) {
      setDraft((d) => d && { ...d, [focusLocale]: { ...d[focusLocale], body: `${d[focusLocale].body}${token}` } });
      return;
    }
    const { locale, field, el } = target;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const value = `${el.value.slice(0, start)}${token}${el.value.slice(end)}`;
    setDraft((d) => d && { ...d, [locale]: { ...d[locale], [field]: value } });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const localeDirty = (l: Locale) => draft[l].title !== saved[l].title || draft[l].body !== saved[l].body;
  const unknownIn = (l: Locale) => [...placeholdersIn(draft[l].title), ...placeholdersIn(draft[l].body)].filter((p) => !current.placeholders.includes(p));

  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Panel title={t('messaging.admin.templates.type')} bodyClassName="p-2">
        <ul className="space-y-0.5" role="listbox" aria-label={t('messaging.admin.templates.type')}>
          {data.types.map((tt) => {
            const overridden = LOCALES.filter((l) => tt.locales[l].override).length;
            const active = tt.type === current.type;
            return (
              <li key={tt.type}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => select(tt.type)}
                  className={clsx(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition',
                    active ? 'bg-navy-900 text-white' : 'text-ink hover:bg-surface',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t(`messaging.admin.templates.types.${tt.type}`)}</span>
                    <span className={clsx('block truncate font-mono text-[10px]', active ? 'text-white/60' : 'text-muted')}>{tt.type}</span>
                  </span>
                  {overridden > 0 && (
                    <span className={clsx('shrink-0 rounded-full px-1.5 text-[10px] font-semibold tabular-nums', active ? 'bg-white/20' : 'bg-brand-100 text-brand-700')} title={t('messaging.admin.templates.overridden')}>
                      {overridden}/4
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="min-w-0 space-y-4">
        <p className="text-sm text-muted">{t('messaging.admin.templates.intro')}</p>
        <Panel
          title={
            <span className="flex items-center gap-2">
              {t(`messaging.admin.templates.types.${current.type}`)}
              <span className="font-mono text-[11px] font-normal text-muted">{current.type}</span>
            </span>
          }
          icon={FileText}
          actions={dirty ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><AlertTriangle className="size-3.5" aria-hidden /> {t('messaging.admin.templates.unsaved')}</span> : undefined}
        >
          <div className="mb-4">
            <p className="text-xs font-semibold text-navy-900">{t('messaging.admin.templates.placeholders')}</p>
            <p className="text-[11px] text-muted">{t('messaging.admin.templates.placeholderHint')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {current.placeholders.map((ph) => (
                <button
                  key={ph}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => insert(ph)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 text-xs font-medium text-brand-800 transition hover:border-brand-400 disabled:opacity-60"
                  title={t(`messaging.admin.templates.vars.${ph}`)}
                >
                  <code>{`{{${ph}}}`}</code>
                  <span className="text-[10px] text-brand-700/70">{t(`messaging.admin.templates.vars.${ph}`)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {LOCALES.map((l) => {
              const loc = current.locales[l];
              const d = draft[l];
              const hasOverride = !!(d.title.trim() || d.body.trim());
              const previewTitle = hasOverride ? render(d.title, samples[l]) : loc.default.title;
              const previewBody = hasOverride ? render(d.body, samples[l]) : loc.default.body;
              const unknown = unknownIn(l);
              const isDirty = localeDirty(l);
              const halfFilled = hasOverride && (!d.title.trim() || !d.body.trim());
              return (
                <section key={l} className={clsx('rounded-xl border p-4', isDirty ? 'border-amber-300 bg-amber-50/30' : 'border-line')} aria-label={t('messaging.admin.templates.editorFor', { type: current.type, locale: l })}>
                  <header className="mb-3 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                      <Flag code={l} /> {l.toUpperCase()}
                      {loc.override ? (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">{t('messaging.admin.templates.overridden')}</span>
                      ) : (
                        <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted">{t('messaging.admin.templates.default')}</span>
                      )}
                    </span>
                    {loc.override && (
                      <span className="text-[10px] text-muted">
                        {t('messaging.admin.templates.updatedBy', { name: loc.override.updatedBy ? fullName(loc.override.updatedBy) : t('admin.common.system'), date: fmtDateTime(loc.override.updatedAt) })}
                      </span>
                    )}
                  </header>
                  <label className="block">
                    <span className="text-[11px] font-semibold text-muted">{t('messaging.admin.templates.title')}</span>
                    <input
                      className="input mt-1"
                      value={d.title}
                      maxLength={200}
                      placeholder={loc.default.title}
                      disabled={!canEdit}
                      onFocus={(e) => {
                        setFocusLocale(l);
                        lastInput.current = { locale: l, field: 'title', el: e.currentTarget };
                      }}
                      onChange={(e) => setDraft((x) => x && { ...x, [l]: { ...x[l], title: e.target.value } })}
                    />
                  </label>
                  <label className="mt-2 block">
                    <span className="text-[11px] font-semibold text-muted">{t('messaging.admin.templates.body')}</span>
                    <textarea
                      className="input mt-1 min-h-28 resize-y font-normal"
                      value={d.body}
                      maxLength={4000}
                      rows={4}
                      placeholder={loc.default.body}
                      disabled={!canEdit}
                      onFocus={(e) => {
                        setFocusLocale(l);
                        lastInput.current = { locale: l, field: 'body', el: e.currentTarget };
                      }}
                      onChange={(e) => setDraft((x) => x && { ...x, [l]: { ...x[l], body: e.target.value } })}
                    />
                  </label>
                  {unknown.length > 0 && <p className="mt-1 text-[11px] text-red-700">{t('messaging.admin.templates.unknown', { list: unknown.map((u) => `{{${u}}}`).join(', ') })}</p>}
                  {halfFilled && <p className="mt-1 text-[11px] text-amber-700">{t('messaging.admin.templates.bothRequired')}</p>}

                  <div className="mt-3 rounded-lg border border-line bg-white p-3">
                    <p className="flex items-center justify-between text-[10px] font-semibold tracking-wide text-muted uppercase">
                      {t('messaging.admin.templates.preview')}
                      <span className="font-normal normal-case">{hasOverride ? t('messaging.admin.templates.previewHint') : t('messaging.admin.templates.usingDefault')}</span>
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-navy-900">{previewTitle}</p>
                    <p className="mt-1 text-xs leading-relaxed break-words whitespace-pre-wrap text-ink/80">{previewBody}</p>
                  </div>

                  {canEdit && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={!isDirty || halfFilled || unknown.length > 0 || save.isPending}
                        onClick={() => save.mutate({ locale: l, title: d.title, body: d.body })}
                      >
                        {save.isPending && save.variables?.locale === l ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('messaging.admin.templates.save')}
                      </button>
                      {(loc.override || hasOverride) && (
                        <button
                          type="button"
                          className="btn-white btn-sm border border-line"
                          disabled={save.isPending}
                          onClick={() => {
                            if (loc.override) {
                              if (!window.confirm(t('messaging.admin.templates.resetConfirm', { locale: l.toUpperCase() }))) return;
                              save.mutate({ locale: l, title: '', body: '' });
                            } else {
                              setDraft((x) => x && { ...x, [l]: { title: '', body: '' } });
                            }
                          }}
                        >
                          <RotateCcw className="size-3.5" /> {t('messaging.admin.templates.reset')}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] text-muted">{t('messaging.admin.templates.emailNote')}</p>
        </Panel>
      </div>
    </div>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

export default function Messaging() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && TABS.includes(requested) ? requested : 'outbound';
  const setTab = (next: Tab) => {
    const p = new URLSearchParams();
    p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <div>
      <PageHead title={t('messaging.admin.title')} subtitle={t('messaging.admin.subtitle')} />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1" role="tablist" aria-label={t('messaging.admin.title')}>
        {TABS.map((k) => {
          const Icon = TAB_ICON[k];
          const active = tab === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(k)}
              className={clsx(
                'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition',
                active ? 'bg-navy-900 text-white' : 'text-ink/75 hover:bg-surface hover:text-navy-900',
              )}
            >
              <Icon className="size-4" aria-hidden /> {t(`messaging.admin.tabs.${k}`)}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">
        {tab === 'outbound' && <OutboundTab />}
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'templates' && <TemplatesTab />}
      </div>
    </div>
  );
}
