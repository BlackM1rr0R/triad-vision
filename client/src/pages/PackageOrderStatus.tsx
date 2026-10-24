import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Check, Circle, LinkIcon, Mail, PackageCheck } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesPackages } from '@/i18n/pagesPackages';
import { pagesBilling } from '@/i18n/pagesBilling';
import { usePageTitle } from '@/lib/usePageTitle';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { useScheduleLine } from './Packages';

registerCopy(pagesPackages);
registerCopy(pagesBilling);

interface OrderStatus {
  status: 'STARTED' | 'SIGNED' | 'ACTIVE' | 'CANCELLED';
  firstName: string;
  email: string;
  priceCents: number;
  currency: string;
  package: { slug: string; tier: string; title: L10n; installments: { label: L10n; percent: number; trigger: string }[] } | null;
  signature: { status: string; sentAt: string | null; completedAt: string | null; expiresAt: string | null } | null;
  caseNumber: string | null;
  firstInvoice: { number: string; grossCents: number; status: string } | null;
}

const money = (c: number, cur = 'EUR') => new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur }).format(c / 100);

/** Public status page of a package order (/packages/order/:token): never indexed, works without an account. */
export default function PackageOrderStatus() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { token = '' } = useParams();
  usePageTitle(t('pkgs.status.title'));
  const schedule = useScheduleLine();
  const q = useQuery({
    queryKey: ['package-order', token],
    queryFn: async () => (await api.get<{ order: OrderStatus }>(`/packages/orders/${encodeURIComponent(token)}`)).data.order,
    retry: (n, err) => n < 2 && errorCode(err) === 'NETWORK',
    // Waiting for the signature: refresh now and then so the page moves on by itself.
    refetchInterval: (query) => (query.state.data?.status === 'STARTED' || query.state.data?.status === 'SIGNED' ? 15_000 : false),
  });
  const resend = useMutation({
    mutationFn: async () => api.post(`/packages/orders/${encodeURIComponent(token)}/resend`, {}),
    onSuccess: () => toast.success(t('pkgs.status.resent')),
    onError: (e) => toast.error(i18n.exists(`pkgs.errors.${errorCode(e)}`) ? t(`pkgs.errors.${errorCode(e)}`) : t('pkgs.errors.default')),
  });

  const o = q.data;
  const sigDead = !!o?.signature && ['DECLINED', 'CANCELLED', 'EXPIRED'].includes(o.signature.status);
  const steps = o
    ? [
        { key: 'received', done: true },
        { key: 'contract', done: !!o.signature },
        { key: 'signed', done: o.status === 'SIGNED' || o.status === 'ACTIVE' },
        { key: 'active', done: o.status === 'ACTIVE' },
      ]
    : [];

  return (
    <div className="min-h-screen bg-surface px-4 pt-24 pb-16 sm:pt-28 lg:pt-36">
      <div className="mx-auto max-w-2xl space-y-5">
        {q.isLoading ? (
          <div className="grid min-h-[40vh] place-items-center text-brand-600" role="status" aria-label={t('pkgs.status.title')}>
            <Spinner className="size-8 border-[3px]" />
          </div>
        ) : q.error || !o ? (
          <div className="card flex flex-col items-center px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-danger-bg text-danger-fg">
              <LinkIcon className="size-5" aria-hidden />
            </span>
            <h1 className="mt-3 font-display text-xl font-bold text-navy-900">{t('pkgs.status.invalidTitle')}</h1>
            <p className="mt-1 max-w-md text-sm text-muted">{t('pkgs.status.invalidText')}</p>
          </div>
        ) : (
          <div className="card p-6 sm:p-8">
            <p className="eyebrow inline-flex items-center gap-1.5 text-brand-600">
              <PackageCheck className="size-4" aria-hidden /> {t('pkgs.status.title')}
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold text-navy-900">{t('pkgs.status.hello', { name: o.firstName })}</h1>
            {o.package && (
              <p className="mt-1 text-sm text-muted">
                {tr(o.package.title)} · {money(o.priceCents, o.currency)}
              </p>
            )}
            <ol className="mt-6 space-y-3">
              {steps.map((s) => (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  <span className={clsx('grid size-7 place-items-center rounded-full', s.done ? 'bg-success-bg text-success-fg' : 'bg-surface text-muted')}>
                    {s.done ? <Check className="size-4" aria-hidden /> : <Circle className="size-3" aria-hidden />}
                  </span>
                  <span className={clsx(s.done ? 'font-semibold text-ink' : 'text-muted')}>{t(`pkgs.status.steps.${s.key}`)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-xl bg-surface p-4 text-sm text-ink" aria-live="polite">
              {o.status === 'CANCELLED' ? (
                <p>{t('pkgs.status.cancelled')}</p>
              ) : o.status === 'ACTIVE' ? (
                <>
                  <p>{t('pkgs.status.active', { case: o.caseNumber ?? '' })}</p>
                  {o.firstInvoice && <p className="mt-2 font-semibold">{t('pkgs.status.firstInvoice', { number: o.firstInvoice.number, amount: money(o.firstInvoice.grossCents) })}</p>}
                  <Link to="/login" className="btn-primary btn-sm mt-4">
                    {t('pkgs.status.login')}
                  </Link>
                </>
              ) : o.status === 'SIGNED' ? (
                <p>{t('pkgs.status.signed')}</p>
              ) : sigDead ? (
                <p>{t('pkgs.status.expired')}</p>
              ) : (
                <>
                  <p className="flex items-start gap-2">
                    <Mail className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> {t('pkgs.status.started', { email: o.email })}
                  </p>
                  <button type="button" className="btn-secondary btn-sm mt-4" disabled={resend.isPending} onClick={() => resend.mutate()}>
                    {resend.isPending && <Spinner className="size-3.5" />}
                    {t('pkgs.status.resend')}
                  </button>
                </>
              )}
            </div>
            {o.package && o.package.installments.length > 0 && (
              <div className="mt-5 text-sm">
                <p className="font-semibold text-navy-900">{t('pkgs.schedule')}</p>
                <ul className="mt-1 space-y-0.5 text-muted">
                  {o.package.installments.map((i, k) => (
                    <li key={k}>{schedule(i)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
