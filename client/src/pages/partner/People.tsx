import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertCircle, Check, ChevronRight, Copy, Link2, Mail, Search, ShieldCheck, ShieldOff, UserPlus, Users } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n from '@/i18n';
import { TONE_CLASS } from '@/components/ui/status';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Handshake, SearchEmpty } from '@/components/illustrations';
import { day, money } from '@/components/agents/format';
import { portalError, type PartnerClientRow, type PartnerMe, type PaymentState } from '@/components/partnerPortal/api';
import { ErrorRetry, Loading, Section, StatusPill } from '@/components/partnerPortal/ui';

/** Error text of this page first (partnerClients.errors), then the portal's generic ones. */
const clientError = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`partnerClients.errors.${code}`) ? i18n.t(`partnerClients.errors.${code}`) : portalError(err);
};

const PAYMENT_TONE: Record<PaymentState, string> = {
  NONE: TONE_CLASS.neutral,
  OPEN: TONE_CLASS.info,
  PARTIAL: TONE_CLASS.warning,
  PAID: TONE_CLASS.success,
  OVERDUE: TONE_CLASS.danger,
};

const CLIENTS_KEY = ['partner-portal', 'people'] as const;

/** The partner's sign-up code and links with copy buttons. */
function LinkCard({ me }: { me: PartnerMe }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState('');
  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(v);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      toast.error(t('partnerPortal.common.error'));
    }
  };
  const rows = [
    { label: t('partnerClients.link.code'), value: me.partner.code },
    { label: t('partnerClients.link.short'), value: me.partner.shortLink },
    { label: t('partnerClients.link.full'), value: me.partner.shareLink },
  ].filter((r): r is { label: string; value: string } => !!r.value);
  return (
    <Section title={t('partnerClients.link.title')} icon={Link2}>
      {rows.length ? (
        <>
          <p className="mb-4 text-sm text-muted">{t('partnerClients.link.hint')}</p>
          <dl className="grid gap-3">
            {rows.map((r) => (
              <div key={r.label} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-sunken px-3 py-2">
                <dt className="w-24 shrink-0 text-xs font-semibold text-muted">{r.label}</dt>
                <dd className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{r.value}</dd>
                <button type="button" className="btn-ghost btn-sm" onClick={() => copy(r.value)} aria-label={`${t('partnerClients.link.copy')}: ${r.label}`}>
                  {copied === r.value ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {copied === r.value ? t('partnerClients.link.copied') : t('partnerClients.link.copy')}
                </button>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-sm text-muted">{t('partnerClients.link.none')}</p>
      )}
    </Section>
  );
}

const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', passportNumber: '', locale: 'az', clientAgreed: false };

/** The partner registers a client on their behalf (POST /partner/clients). */
function RegisterForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k: keyof typeof EMPTY_FORM) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post('/partner/clients', {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          passportNumber: form.passportNumber.trim() || null,
          locale: form.locale,
          clientAgreed: true,
        })
      ).data,
    onSuccess: async () => {
      toast.success(t('partnerClients.register.done'));
      setForm(EMPTY_FORM);
      await qc.invalidateQueries({ queryKey: CLIENTS_KEY });
      onDone();
    },
    onError: (err) => {
      const issue = (err as { response?: { data?: { issues?: { message?: string }[] } } }).response?.data?.issues?.[0]?.message;
      toast.error(issue && i18n.exists(`partnerClients.errors.${issue}`) ? t(`partnerClients.errors.${issue}`) : clientError(err));
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.clientAgreed) save.mutate();
  };
  return (
    <Section title={t('partnerClients.register.title')} icon={UserPlus}>
      <p className="mb-4 text-sm text-muted">{t('partnerClients.register.hint')}</p>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t('partnerClients.register.firstName')}</span>
          <input className="input" required maxLength={80} value={form.firstName} onChange={set('firstName')} />
        </label>
        <label className="block">
          <span className="label">{t('partnerClients.register.lastName')}</span>
          <input className="input" required maxLength={80} value={form.lastName} onChange={set('lastName')} />
        </label>
        <label className="block">
          <span className="label">{t('partnerClients.register.email')}</span>
          <input className="input" type="email" required maxLength={191} value={form.email} onChange={set('email')} />
        </label>
        <label className="block">
          <span className="label">{t('partnerClients.register.phone')}</span>
          <input className="input" type="tel" required maxLength={40} placeholder="+994" value={form.phone} onChange={set('phone')} />
        </label>
        <label className="block">
          <span className="label">{t('partnerClients.register.passport')}</span>
          <input className="input font-mono" maxLength={40} value={form.passportNumber} onChange={set('passportNumber')} />
        </label>
        <label className="block">
          <span className="label">{t('partnerClients.register.locale')}</span>
          <select className="input" value={form.locale} onChange={set('locale')}>
            <option value="az">Azərbaycan</option>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </select>
        </label>
        <label className="flex items-start gap-3 text-sm text-ink sm:col-span-2">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={form.clientAgreed} onChange={(e) => setForm((f) => ({ ...f, clientAgreed: e.target.checked }))} required />
          <span>{t('partnerClients.register.agreed')}</span>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={save.isPending || !form.clientAgreed}>
            {save.isPending && <Spinner className="size-4" />} {t('partnerClients.register.submit')}
          </button>
          <button type="button" className="btn-ghost" onClick={onDone}>
            {t('partnerClients.register.cancel')}
          </button>
        </div>
      </form>
    </Section>
  );
}

/**
 * /partner/people — all clients of the partner (signed up with the partner's link, registered by the partner,
 * or linked by the team): registration, latest case, missing documents, next step, payment state; contacts
 * and amounts only with extended visibility and the client's consent. Plus the sign-up link and the form to
 * register a client on their behalf.
 */
export default function PartnerPeoplePage({ me }: { me: PartnerMe }) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(input.trim()), 300);
    return () => window.clearTimeout(id);
  }, [input]);
  const q = useQuery({
    queryKey: [...CLIENTS_KEY, { search }],
    queryFn: async () => (await api.get<{ items: PartnerClientRow[] }>('/partner/clients', { params: { search: search || undefined } })).data,
    placeholderData: keepPreviousData,
  });
  const resend = useMutation({
    mutationFn: async (id: string) => api.post(`/partner/clients/${id}/invite`),
    onSuccess: () => toast.success(t('partnerClients.list.resent')),
    onError: (err) => toast.error(clientError(err)),
  });
  const items = q.data?.items;

  return (
    <div className="space-y-6">
      <LinkCard me={me} />
      {adding && <RegisterForm onDone={() => setAdding(false)} />}
      <Section
        title={t('partnerClients.list.title')}
        icon={Users}
        actions={
          !adding && me.partner.active ? (
            <button type="button" className="btn-primary btn-sm" onClick={() => setAdding(true)}>
              <UserPlus className="size-4" aria-hidden /> {t('partnerClients.register.open')}
            </button>
          ) : undefined
        }
      >
        <label className="relative mb-5 block">
          <span className="sr-only">{t('partnerClients.list.searchPh')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder={t('partnerClients.list.searchPh')} value={input} onChange={(e) => setInput(e.target.value)} />
        </label>
        {q.isLoading ? (
          <Loading />
        ) : q.isError || !items ? (
          <ErrorRetry onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            illustration={search ? <SearchEmpty className="w-32" /> : <Handshake className="w-36" />}
            title={search ? t('partnerPortal.clients.notFound') : t('partnerClients.list.empty')}
            text={search ? undefined : t('partnerClients.list.emptyHint')}
          />
        ) : (
          <ul className="space-y-3">
            {items.map((c) => (
              <li key={c.id} className="rounded-2xl border border-line bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {c.firstName} {c.lastName}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                      <span>
                        {t('partnerClients.list.registered')}: {day(c.registeredAt)}
                      </span>
                      {c.passport && <span className="font-mono">{c.passport}</span>}
                      {!c.owned && <span>{t('partnerClients.list.viaCase')}</span>}
                      {c.contact && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="size-3.5" aria-hidden /> {c.contact.email}
                          {c.contact.phone ? ` · ${c.contact.phone}` : ''}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={clsx('badge whitespace-nowrap', PAYMENT_TONE[c.payment.state])}>
                      {t(`partnerClients.list.payment.${c.payment.state}`)}
                      {c.payment.totalCents ? ` · ${t('partnerClients.list.paid', { paid: money(c.payment.paidCents ?? 0, c.payment.currency), total: money(c.payment.totalCents, c.payment.currency) })}` : ''}
                    </span>
                    {c.latestCase && <StatusPill status={c.latestCase.status} />}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  <span className={clsx('inline-flex items-center gap-1', c.consent ? 'text-success-fg' : 'text-muted')}>
                    {c.consent ? <ShieldCheck className="size-3.5" aria-hidden /> : <ShieldOff className="size-3.5" aria-hidden />}
                    {c.consent === true ? t('partnerClients.list.consentYes') : c.consent === false ? t('partnerClients.list.consentNo') : t('partnerClients.list.consentNone')}
                  </span>
                  {c.owned && !c.activated && (
                    <span className="inline-flex items-center gap-2 text-muted">
                      {t('partnerClients.list.invited')}
                      <button type="button" className="btn-ghost btn-sm" disabled={resend.isPending} onClick={() => resend.mutate(c.id)}>
                        {t('partnerClients.list.resend')}
                      </button>
                    </span>
                  )}
                  {c.cases > 1 && <span className="text-muted">{t('partnerClients.list.cases', { count: c.cases })}</span>}
                </div>
                {c.latestCase ? (
                  <Link to={`/partner/clients/${c.latestCase.id}`} className="group mt-3 flex items-start justify-between gap-2 rounded-xl bg-sunken px-3 py-2 text-xs font-medium text-ink hover:text-link">
                    <span className="flex items-start gap-1.5">
                      <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
                      <span>
                        <span className="font-mono">{c.latestCase.number}</span> · {t('partnerPortal.clients.next')}: {t(`partnerPortal.nextAction.${c.latestCase.nextAction}`)}
                        {c.latestCase.missingDocuments > 0 && ` · ${t('partnerClients.list.missing', { count: c.latestCase.missingDocuments })}`}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                ) : (
                  <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-xs text-muted">{t('partnerClients.list.noCase')}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
