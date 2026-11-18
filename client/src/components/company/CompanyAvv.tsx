import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CheckCircle2, Clock3, Download, Eye, PenLine, ShieldCheck } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesAvv } from '@/i18n/pagesAvv';
import { TONE_CLASS } from '@/components/ui/status';
import { Spinner } from '@/components/ui/Spinner';
import { Loading, Section } from './shared';
import { openPdfBlob } from '@/components/officialForms/api';
import { useCompanyAccess } from './access'; // fill / preview / sign need signAvv (server: lib/companyAccess/rules.ts)

registerCopy(pagesAvv);

type AvvStatus = 'DRAFT' | 'SENT' | 'COMPLETED' | 'CANCELLED';
interface AgreementView {
  id: string;
  status: AvvStatus;
  templateVersion: string;
  createdAt: string;
  completedAt: string | null;
  signerId: string | null;
  signerStatus: string | null;
  companySigned: boolean;
  countersigned: boolean;
}
interface AvvOverview {
  available: true;
  templateVersion: string;
  prefill: Partial<Record<FieldKey, string>>;
  current: AgreementView | null;
  items: AgreementView[];
}

const FIELDS = ['legalName', 'street', 'postalCode', 'city', 'country', 'representative', 'privacyContactName', 'privacyContactEmail', 'dpo', 'signatoryName', 'signatoryRole'] as const;
type FieldKey = (typeof FIELDS)[number];
const OPTIONAL = new Set<FieldKey>(['dpo', 'signatoryRole', 'country']);
const WIDE = new Set<FieldKey>(['legalName', 'representative', 'privacyContactEmail', 'dpo']);
const STATUS_TONE: Record<AvvStatus, 'neutral' | 'warning' | 'success' | 'danger'> = { DRAFT: 'neutral', SENT: 'warning', COMPLETED: 'success', CANCELLED: 'neutral' };

/** The AVV query used by the portal nav too: a 404 means "not released yet" (the tab stays hidden). */
export const useCompanyAvv = () =>
  useQuery({
    queryKey: ['company-avv'],
    queryFn: async () => (await api.get<AvvOverview>('/company/avv')).data,
    retry: false,
    staleTime: 60_000,
  });

const avvError = (err: unknown, t: (k: string, o?: { defaultValue: string }) => string) => {
  toast.error(t(`avv.company.errors.${errorCode(err)}`, { defaultValue: t('avv.company.errors.default') }));
};

/** Employer portal /company/avv: fill in, preview, sign; Triad Vision countersigns (server lib/avv). */
export const CompanyAvv = () => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useCompanyAvv();
  const canSign = useCompanyAccess().canDo('signAvv');
  const [values, setValues] = useState<Partial<Record<FieldKey, string>> | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const v = values ?? q.data?.prefill ?? {};

  const preview = useMutation({
    mutationFn: async () => (await api.post<Blob>('/company/avv/preview', { data: v }, { responseType: 'blob' })).data,
    onSuccess: openPdfBlob,
    onError: (err) => {
      setInvalid(((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? '').split(',').filter(Boolean));
      avvError(err, t);
    },
  });
  const sign = useMutation({
    mutationFn: async () => (await api.post<{ signerId: string | null }>('/company/avv/sign', { data: v })).data,
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['company-avv'] });
      if (d.signerId) navigate(`/company/contracts/${d.signerId}`);
    },
    onError: (err) => {
      setInvalid(((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? '').split(',').filter(Boolean));
      avvError(err, t);
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data)
    return (
      <Section title={t('avv.company.title')} icon={ShieldCheck}>
        <p className="text-sm text-muted">{t('avv.company.unavailable')}</p>
        <Link to="/trust" className="mt-3 inline-block text-sm font-semibold text-link hover:underline">
          {t('avv.company.trustLink')}
        </Link>
      </Section>
    );

  const d = q.data;
  const cur = d.current;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const missing = FIELDS.filter((k) => !OPTIONAL.has(k) && !(v[k] ?? '').trim());
    setInvalid(missing);
    if (!missing.length) sign.mutate();
  };

  return (
    <div className="space-y-6">
      <Section title={t('avv.company.title')} icon={ShieldCheck} actions={<span className="badge chip-sky">{t('avv.company.version', { version: d.templateVersion })}</span>}>
        <p className="-mt-3 text-sm text-muted">{t('avv.company.subtitle')}</p>
        {cur?.status === 'COMPLETED' && (
          <div className={clsx('mt-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm', TONE_CLASS.success)}>
            <CheckCircle2 className="size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t('avv.company.completed')}</p>
              {cur.completedAt && <p className="text-xs">{t('avv.company.completedAt', { date: date(cur.completedAt) })}</p>}
            </div>
            <a href={`/api/company/avv/${cur.id}/file?download=1`} className="btn-secondary btn-sm">
              <Download className="size-4" aria-hidden />
              {t('avv.company.download')}
            </a>
          </div>
        )}
        {cur?.status === 'SENT' && (
          <div className={clsx('mt-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm', TONE_CLASS.info)}>
            <Clock3 className="size-5 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">{cur.companySigned ? t('avv.company.waitingCountersign') : canSign ? t('avv.company.waitingYou') : t('avv.company.waitingSigner')}</p>
            {!cur.companySigned && cur.signerId && canSign && (
              <Link to={`/company/contracts/${cur.signerId}`} className="btn-primary btn-sm">
                <PenLine className="size-4" aria-hidden />
                {t('avv.company.signNow')}
              </Link>
            )}
          </div>
        )}
      </Section>

      {cur?.status !== 'COMPLETED' && !(cur?.status === 'SENT' && cur.companySigned) && !canSign && (
        <Section>
          <p className="text-sm text-muted">{t('avv.company.readOnly')}</p>
        </Section>
      )}

      {cur?.status !== 'COMPLETED' && !(cur?.status === 'SENT' && cur.companySigned) && canSign && (
        <form onSubmit={onSubmit} noValidate>
          <Section>
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((k) => {
                const id = `avv-${k}`;
                const bad = invalid.includes(k);
                return (
                  <div key={k} className={clsx(WIDE.has(k) && 'sm:col-span-2')}>
                    <label className="label" htmlFor={id}>
                      {t(`avv.company.fields.${k}`)}
                      {!OPTIONAL.has(k) && <span className="ml-1 text-xs font-normal text-muted">({t('avv.company.required')})</span>}
                    </label>
                    <input
                      id={id}
                      className={clsx('input', bad && 'border-danger ring-1 ring-danger')}
                      type={k === 'privacyContactEmail' ? 'email' : 'text'}
                      autoComplete={k === 'postalCode' ? 'postal-code' : k === 'city' ? 'address-level2' : k === 'street' ? 'street-address' : undefined}
                      maxLength={k === 'dpo' ? 300 : 200}
                      value={v[k] ?? ''}
                      aria-invalid={bad}
                      aria-required={!OPTIONAL.has(k)}
                      onChange={(e) => {
                        setValues({ ...v, [k]: e.target.value });
                        if (bad) setInvalid(invalid.filter((x) => x !== k));
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
              <button type="button" className="btn-secondary" onClick={() => preview.mutate()} disabled={preview.isPending}>
                {preview.isPending ? <Spinner className="size-4" /> : <Eye className="size-4" aria-hidden />}
                {t('avv.company.preview')}
              </button>
              <button type="submit" className="btn-primary" disabled={sign.isPending}>
                {sign.isPending ? <Spinner className="size-4" /> : <PenLine className="size-4" aria-hidden />}
                {t('avv.company.sign')}
              </button>
              <Link to="/trust" className="ml-auto self-center text-sm font-semibold text-link hover:underline">
                {t('avv.company.trustLink')}
              </Link>
            </div>
          </Section>
        </form>
      )}

      {d.items.filter((i) => i.id !== cur?.id).length > 0 && (
        <Section title={t('avv.company.history')}>
          <ul className="divide-y divide-line text-sm">
            {d.items
              .filter((i) => i.id !== cur?.id)
              .map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="text-muted">{date(i.createdAt)}</span>
                  <span className="text-xs text-muted">{i.templateVersion}</span>
                  <span className={clsx('badge ml-auto', TONE_CLASS[STATUS_TONE[i.status]])}>{t(`avv.company.status.${i.status}`)}</span>
                </li>
              ))}
          </ul>
        </Section>
      )}
    </div>
  );
};

export default CompanyAvv;
