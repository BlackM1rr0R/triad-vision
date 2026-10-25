import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Building2, KeyRound, Pencil, Plus, Store, Terminal, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesWhitelabel } from '@/i18n/pagesWhitelabel';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { fmtDate, toastError } from '@/components/admin/labels';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { BadgeTone } from '@/components/ui/status';

registerCopy(pagesWhitelabel);

type CustomerStatus = 'trial' | 'active' | 'past_due' | 'cancelled';
interface TokenInfo {
  valid: boolean;
  reason?: string;
  customer?: string;
  domain?: string;
  plan?: string;
  expiresAt?: string;
}
interface Customer {
  id: string;
  name: string;
  domain: string;
  serverIp: string;
  plan: string;
  pricePerMonth: number;
  currency: string;
  status: CustomerStatus;
  licenseExpiresAt: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  licenseToken: string;
  companyId: string;
  token: TokenInfo | null;
}
interface CustomersView {
  items: Customer[];
  companies: { id: string; name: string }[];
  mrr: Record<string, number>;
  statuses: CustomerStatus[];
  currencies: string[];
}
type Draft = Omit<Customer, 'id' | 'token'>;

const EMPTY: Draft = {
  name: '',
  domain: '',
  serverIp: '',
  plan: '',
  pricePerMonth: 0,
  currency: 'EUR',
  status: 'trial',
  licenseExpiresAt: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  notes: '',
  licenseToken: '',
  companyId: '',
};
/** The editable fields only (the API refuses unknown keys such as id / token). */
const pickDraft = (c: Customer): Draft => Object.fromEntries(Object.keys(EMPTY).map((k) => [k, c[k as keyof Draft] ?? EMPTY[k as keyof Draft]])) as Draft;
const STATUS_TONE: Record<CustomerStatus, BadgeTone> = { trial: 'info', active: 'success', past_due: 'warning', cancelled: 'neutral' };
const DAY = 86_400_000;

const ISSUE_CMD = `node deploy/whitelabel/issue-license.mjs --key license-private.pem \\
  --customer "Agency GmbH" --domain agency.example --plan pro --expires 2027-12-31`;

/** System → Customers (SUPER_ADMIN, owner instance only): agencies that bought the platform. */
export default function SystemCustomers() {
  const { t } = useTranslation();
  usePageTitle(t('wl.customers.title'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['wl-customers'], queryFn: async () => (await api.get<CustomersView>('/admin/whitelabel/customers')).data });
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['wl-customers'] });

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: Draft }) =>
      id ? (await api.patch(`/admin/whitelabel/customers/${id}`, draft)).data : (await api.post('/admin/whitelabel/customers', draft)).data,
    onSuccess: () => {
      setEditing(null);
      refresh();
      toast.success(t('wl.customers.saved'));
    },
    onError: (e) => toastError(e),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/whitelabel/customers/${id}`)).data,
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
    onError: (e) => toastError(e),
  });
  const company = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/whitelabel/customers/${id}/company`)).data,
    onSuccess: () => {
      refresh();
      toast.success(t('wl.customers.companyCreated'));
    },
    onError: (e) => toastError(e),
  });

  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <LoadingBlock />;
  const { items, mrr, statuses, currencies, companies } = q.data;
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name;
  const expiry = (c: Customer) => {
    if (!c.licenseExpiresAt) return '—';
    const days = Math.ceil((new Date(`${c.licenseExpiresAt}T00:00:00Z`).getTime() - Date.now()) / DAY);
    if (days < 0) return <Badge tone="danger">{t('wl.customers.expired')}</Badge>;
    return (
      <span>
        {fmtDate(c.licenseExpiresAt)}
        {days <= 30 && (
          <>
            {' '}
            <Badge tone="warning">{t('wl.customers.expiresSoon', { days })}</Badge>
          </>
        )}
      </span>
    );
  };

  return (
    <div className="stack-page">
      <PageHead
        title={t('wl.customers.title')}
        subtitle={t('wl.customers.intro')}
        actions={
          <Button icon={Plus} onClick={() => setEditing({ id: null, draft: { ...EMPTY } })}>
            {t('wl.customers.add')}
          </Button>
        }
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Card title={t('wl.customers.mrr')} icon={Store}>
          <p className="text-2xl font-bold text-ink tabular-nums">
            {Object.keys(mrr).length ? Object.entries(mrr).map(([cur, v]) => `${v.toLocaleString()} ${cur}`).join(' · ') : '0'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t('wl.customers.count')}: {items.length}
          </p>
        </Card>
        <Card title={t('wl.customers.issueTitle')} icon={Terminal}>
          <p className="mb-2 text-sm text-muted">{t('wl.customers.issueText')}</p>
          <pre className="overflow-x-auto rounded-md bg-sunken p-3 text-xs text-ink">{ISSUE_CMD}</pre>
        </Card>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Store} title={t('wl.customers.empty')} />
      ) : (
        <div className="grid gap-4">
          {items.map((c) => (
            <Card
              key={c.id}
              title={c.name}
              subtitle={[c.domain, c.serverIp].filter(Boolean).join(' · ') || undefined}
              icon={Building2}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing({ id: c.id, draft: pickDraft(c) })}>
                    {t('wl.customers.edit')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleting(c)} aria-label={`${t('wl.customers.delete')}: ${c.name}`}>
                    {t('wl.customers.delete')}
                  </Button>
                </div>
              }
            >
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">{t('wl.customers.status')}</dt>
                  <dd>
                    <Badge tone={STATUS_TONE[c.status]} dot>
                      {t(`wl.customers.statuses.${c.status}`)}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('wl.customers.plan')}</dt>
                  <dd className="font-medium text-ink">{c.plan || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('wl.customers.price')}</dt>
                  <dd className="font-medium text-ink tabular-nums">
                    {c.pricePerMonth.toLocaleString()} {c.currency}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('wl.customers.licenseExpiresAt')}</dt>
                  <dd className="font-medium text-ink">{expiry(c)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('wl.customers.contactName')}</dt>
                  <dd className="text-ink">{[c.contactName, c.contactEmail, c.contactPhone].filter(Boolean).join(' · ') || '—'}</dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs text-muted">{t('wl.customers.company')}</dt>
                  <dd className="flex flex-wrap items-center gap-2 text-ink">
                    {c.companyId && companyName(c.companyId) ? (
                      <>
                        <Link className="text-link underline" to="/admin/companies">
                          {companyName(c.companyId)}
                        </Link>
                        <Link className="text-link underline" to="/admin/invoices">
                          {t('wl.customers.openInvoices')}
                        </Link>
                      </>
                    ) : (
                      <Button size="sm" variant="secondary" icon={Building2} loading={company.isPending && company.variables === c.id} onClick={() => company.mutate(c.id)}>
                        {t('wl.customers.createCompany')}
                      </Button>
                    )}
                  </dd>
                </div>
                {c.token && (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <dt className="text-xs text-muted">{t('wl.customers.licenseToken')}</dt>
                    <dd className={c.token.valid ? 'text-success-fg' : 'text-danger-fg'}>
                      <KeyRound className="mr-1 inline size-3.5" aria-hidden />
                      {c.token.valid
                        ? t('wl.customers.tokenValid', { customer: c.token.customer, domain: c.token.domain, plan: c.token.plan, date: fmtDate(c.token.expiresAt ?? null) })
                        : t('wl.customers.tokenInvalid', { reason: c.token.reason })}
                    </dd>
                  </div>
                )}
                {c.notes && <p className="text-muted whitespace-pre-line sm:col-span-2 lg:col-span-4">{c.notes}</p>}
              </dl>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <CustomerForm
          initial={editing.draft}
          statuses={statuses}
          currencies={currencies}
          busy={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(draft) => save.mutate({ id: editing.id, draft })}
          title={editing.id ? t('wl.customers.edit') : t('wl.customers.add')}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={t('wl.customers.delete')}
        message={t('wl.customers.deleteConfirm', { name: deleting?.name ?? '' })}
        loading={remove.isPending}
      />
    </div>
  );
}

const CustomerForm = ({
  initial,
  statuses,
  currencies,
  busy,
  title,
  onClose,
  onSave,
}: {
  initial: Draft;
  statuses: CustomerStatus[];
  currencies: string[];
  busy: boolean;
  title: string;
  onClose: () => void;
  onSave: (d: Draft) => void;
}) => {
  const { t } = useTranslation();
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(d);
  };
  const text = (k: 'name' | 'domain' | 'serverIp' | 'plan' | 'contactName' | 'contactEmail' | 'contactPhone', label: string, type = 'text') => (
    <Field label={label} required={k === 'name'}>
      <Input type={type} value={d[k]} onChange={(e) => set(k, e.target.value)} required={k === 'name'} maxLength={200} />
    </Field>
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('wl.customers.cancel')}
          </Button>
          <Button type="submit" form="wl-customer-form" loading={busy}>
            {t('wl.customers.save')}
          </Button>
        </>
      }
    >
      <form id="wl-customer-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {text('name', t('wl.customers.name'))}
        {text('domain', t('wl.customers.domain'))}
        {text('serverIp', t('wl.customers.serverIp'))}
        {text('plan', t('wl.customers.plan'))}
        <Field label={t('wl.customers.price')}>
          <Input type="number" min={0} step="0.01" value={String(d.pricePerMonth)} onChange={(e) => set('pricePerMonth', Number(e.target.value) || 0)} />
        </Field>
        <Field label={t('wl.customers.currency')}>
          <Select value={d.currency} onChange={(e) => set('currency', e.target.value)}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('wl.customers.status')}>
          <Select value={d.status} onChange={(e) => set('status', e.target.value as CustomerStatus)}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {t(`wl.customers.statuses.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('wl.customers.licenseExpiresAt')}>
          <Input type="date" value={d.licenseExpiresAt} onChange={(e) => set('licenseExpiresAt', e.target.value)} />
        </Field>
        {text('contactName', t('wl.customers.contactName'))}
        {text('contactEmail', t('wl.customers.contactEmail'), 'email')}
        {text('contactPhone', t('wl.customers.contactPhone'))}
        <div className="sm:col-span-2">
          <Field label={t('wl.customers.licenseToken')}>
            <Textarea rows={3} value={d.licenseToken} onChange={(e) => set('licenseToken', e.target.value.trim())} className="font-mono text-xs" maxLength={4000} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t('wl.customers.notes')}>
            <Textarea rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} maxLength={5000} />
          </Field>
        </div>
      </form>
    </Modal>
  );
};
