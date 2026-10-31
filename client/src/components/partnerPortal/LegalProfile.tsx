import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Download, FilePen, FileSignature, Landmark, MapPin, Scale } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPartnerHub } from '@/i18n/pagesPartnerHub';
import { pagesPartnerProfile } from '@/i18n/pagesPartnerProfile';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate } from '@/components/admin/labels';
import { portalError } from './api';
import { Section } from './ui';

registerCopy(pagesPartnerProfile);
registerCopy(pagesPartnerHub);

/**
 * Partner portal: the partner's legal data (what contracts are generated from), editing of the contact /
 * address fields, change requests for legal data and the partner's own contracts (server
 * lib/partners/portalProfileRoutes.ts). Bank data is only shown masked; internal fields never arrive.
 */

const EDITABLE = ['contactPerson', 'phone', 'phone2', 'whatsapp', 'email', 'website', 'street', 'postalCode', 'city', 'country', 'address'] as const;
type Editable = (typeof EDITABLE)[number];
const REQUESTABLE = ['name', 'companyName', 'legalForm', 'registerNumber', 'registerCourt', 'vatId', 'taxId', 'betriebsnummer', 'signatoryName', 'signatoryRole'] as const;
type Requestable = (typeof REQUESTABLE)[number];

interface PortalProfile extends Record<Editable | Requestable, string | null> {
  id: string;
  partnerType: 'INDIVIDUAL' | 'COMPANY';
  preferredLanguage: string | null;
  bank: { bankName: string | null; iban: string | null } | null;
  extraFields: { label: string; value: string }[];
  readiness: { required: string[]; missing: string[]; percent: number };
}

interface PortalContract {
  id: string;
  title: string;
  status: 'SENT' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  startDate: string | null;
  endDate: string | null;
  signedAt: string | null;
  hasFile: boolean;
  hasSignedFile: boolean;
}

const PROFILE_KEY = ['partner-portal', 'legal-profile'] as const;
const CONTRACTS_KEY = ['partner-portal', 'contracts'] as const;

const STATUS_TONE: Record<PortalContract['status'], string> = {
  SENT: 'bg-info-bg text-info-fg',
  ACTIVE: 'bg-success-bg text-success-fg',
  EXPIRED: 'bg-sunken text-muted',
  TERMINATED: 'bg-danger-bg text-danger-fg',
};

/** Field labels: the admin form's labels (shared copy). */
const useLabel = () => {
  const { t } = useTranslation();
  return (k: string, type?: string) => (k === 'taxId' ? t(type === 'COMPANY' ? 'partnerForm.f.taxIdCompany' : 'partnerForm.f.taxIdIndividual') : t(`partnerHub.fields.${k}`));
};

const ChangeRequestDialog = ({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: PortalProfile }) => {
  const { t } = useTranslation();
  const label = useLabel();
  const [values, setValues] = useState<Partial<Record<Requestable, string>>>({});
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) {
      setValues({});
      setNote('');
    }
  }, [open]);
  const fields = REQUESTABLE.filter((k) => profile.partnerType === 'COMPANY' || !['companyName', 'legalForm', 'registerNumber', 'registerCourt', 'vatId', 'betriebsnummer', 'signatoryName', 'signatoryRole'].includes(k));
  const changes = Object.fromEntries(Object.entries(values).filter(([, v]) => v && v.trim())) as Record<string, string>;
  const empty = !Object.keys(changes).length && !note.trim();
  const send = useMutation({
    mutationFn: async () => (await api.post('/partner/profile/change-request', { changes, note: note.trim() || undefined })).data,
    onSuccess: () => {
      toast.success(t('partnerPortalLegal.requestSent'));
      onClose();
    },
    onError: (err) => toast.error(portalError(err)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={send.isPending}
      size="lg"
      mobile="full"
      as="form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (!empty) send.mutate();
      }}
      title={t('partnerPortalLegal.requestTitle')}
      description={t('partnerPortalLegal.requestHint')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={send.isPending}>
            {t('partnerForm.cancel')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={empty || send.isPending}>
            {send.isPending && <Spinner className="size-3.5" />} {t('partnerPortalLegal.requestSend')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((k) => (
          <label key={k} className="block min-w-0">
            <span className="label">{label(k, profile.partnerType)}</span>
            <input className="input" maxLength={200} placeholder={profile[k] ?? '—'} value={values[k] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
          </label>
        ))}
        <label className="block sm:col-span-2">
          <span className="label">{t('partnerPortalLegal.requestNote')}</span>
          <textarea className="input min-h-20" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          <span className="mt-1 block text-xs text-muted">{t('partnerPortalLegal.bankHint')}</span>
        </label>
        {empty && <p className="text-xs text-muted sm:col-span-2">{t('partnerPortalLegal.requestEmpty')}</p>}
      </div>
    </Modal>
  );
};

export const PortalLegalProfile = () => {
  const { t } = useTranslation();
  const label = useLabel();
  const qc = useQueryClient();
  const [requesting, setRequesting] = useState(false);
  const profileQ = useQuery({ queryKey: PROFILE_KEY, queryFn: async () => (await api.get<{ profile: PortalProfile }>('/partner/profile')).data.profile });
  const contractsQ = useQuery({ queryKey: CONTRACTS_KEY, queryFn: async () => (await api.get<{ items: PortalContract[] }>('/partner/contracts')).data.items });
  const p = profileQ.data;
  const [form, setForm] = useState<Record<Editable, string>>(() => Object.fromEntries(EDITABLE.map((k) => [k, ''])) as Record<Editable, string>);
  useEffect(() => {
    if (p) setForm(Object.fromEntries(EDITABLE.map((k) => [k, p[k] ?? ''])) as Record<Editable, string>);
  }, [p]);
  const changed = p ? EDITABLE.filter((k) => (form[k] ?? '').trim() !== (p[k] ?? '')) : [];
  const save = useMutation({
    mutationFn: async () => (await api.patch<{ profile: PortalProfile; changed: string[] }>('/partner/profile', Object.fromEntries(changed.map((k) => [k, form[k].trim()])))).data,
    onSuccess: (r) => {
      qc.setQueryData(PROFILE_KEY, r.profile);
      toast.success(r.changed.length ? t('partnerPortalLegal.saved') : t('partnerPortalLegal.nothing'));
    },
    onError: (err) => toast.error(portalError(err)),
  });

  if (profileQ.isLoading)
    return (
      <div className="flex justify-center py-10">
        <Spinner className="size-5" />
      </div>
    );
  if (!p) return null;
  const company = p.partnerType === 'COMPANY';
  const legal: Requestable[] = company ? [...REQUESTABLE] : ['name', 'taxId'];

  return (
    <div className="grid gap-6 lg:col-span-2 lg:grid-cols-2">
      <Section
        title={t('partnerPortalLegal.title')}
        icon={Scale}
        actions={
          <button type="button" className="btn-secondary btn-sm" onClick={() => setRequesting(true)}>
            <FilePen className="size-3.5" aria-hidden /> {t('partnerPortalLegal.request')}
          </button>
        }
      >
        <p className="mb-4 text-xs text-muted">{t('partnerPortalLegal.hint')}</p>
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted">{t('partnerPortalLegal.readiness', { percent: p.readiness.percent })}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.readiness.percent}>
            <div className={clsx('h-full rounded-full', p.readiness.missing.length ? 'bg-warning' : 'bg-success')} style={{ width: `${p.readiness.percent}%` }} />
          </div>
          {p.readiness.missing.length > 0 && (
            <p className="mt-1 text-[11px] text-muted">{t('partnerPortalLegal.readinessMissing', { fields: p.readiness.missing.map((k) => label(k, p.partnerType)).join(', ') })}</p>
          )}
        </div>
        <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-muted">{t('partnerForm.f.partnerType')}</dt>
            <dd className="mt-0.5 text-sm text-ink">{t(`partnerPortalLegal.types.${p.partnerType}`)}</dd>
          </div>
          {legal.map((k) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs font-semibold text-muted">{label(k, p.partnerType)}</dt>
              <dd className={clsx('mt-0.5 text-sm break-words', p[k] ? 'text-ink' : 'text-muted')}>{p[k] || '—'}</dd>
            </div>
          ))}
        </dl>
        {p.bank?.iban && (
          <p className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-muted">
            <Landmark className="size-3.5 shrink-0" aria-hidden /> {t('partnerPortalLegal.bankOnFile', { iban: p.bank.iban })}
          </p>
        )}
      </Section>

      <Section title={t('partnerPortalLegal.contactTitle')} icon={MapPin}>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (changed.length && !save.isPending) save.mutate();
          }}
        >
          {EDITABLE.map((k) => (
            <label key={k} className={clsx('block min-w-0', (k === 'street' || k === 'website' || k === 'address') && 'sm:col-span-2')}>
              <span className="label">{k === 'street' ? t('partnerForm.f.street') : label(k)}</span>
              <input
                className="input"
                type={k === 'email' ? 'email' : k.startsWith('phone') || k === 'whatsapp' ? 'tel' : 'text'}
                maxLength={k === 'address' ? 255 : k === 'postalCode' ? 12 : 160}
                autoComplete={k === 'email' ? 'email' : k === 'postalCode' ? 'postal-code' : k === 'street' ? 'street-address' : 'off'}
                value={form[k]}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={!changed.length || save.isPending}>
              {save.isPending && <Spinner className="size-4" />} {t('partnerPortalLegal.save')}
            </button>
          </div>
        </form>
      </Section>

      <Section title={t('partnerPortalLegal.contracts')} icon={FileSignature} className="lg:col-span-2">
        {contractsQ.isLoading ? (
          <Spinner className="size-4" />
        ) : !contractsQ.data?.length ? (
          <p className="text-sm text-muted">{t('partnerPortalLegal.contractsEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {contractsQ.data.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {c.title} <span className={clsx('badge', STATUS_TONE[c.status])}>{t(`partnerPortalLegal.statuses.${c.status}`)}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {t('partnerPortalLegal.period')}: {c.startDate ? fmtDate(c.startDate) : '—'} – {c.endDate ? fmtDate(c.endDate) : t('partnerPortalLegal.openEnded')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.hasFile && (
                    <a href={`/api/partner/contracts/${c.id}/file`} className="btn-secondary btn-sm" download>
                      <Download className="size-3.5" aria-hidden /> {t('partnerPortalLegal.download')}
                    </a>
                  )}
                  {c.hasSignedFile && (
                    <a href={`/api/partner/contracts/${c.id}/file?signed=1`} className="btn-secondary btn-sm" download>
                      <Download className="size-3.5" aria-hidden /> {t('partnerPortalLegal.downloadSigned')}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ChangeRequestDialog open={requesting} onClose={() => setRequesting(false)} profile={p} />
    </div>
  );
};
