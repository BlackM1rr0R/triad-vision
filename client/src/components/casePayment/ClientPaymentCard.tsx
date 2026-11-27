import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarCheck, CheckCircle2, CreditCard, MapPin, Phone, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { useBrand } from '@/lib/brand';
import { useL10n } from '@/lib/l10n';
import { cpKeys, useCpError } from '@/components/clientProcess/api';
import { SlotPicker } from '@/components/clientProcess/PortalOfficeVisits';

/**
 * Payment step after the Əmək müqaviləsi (case status CONTRACT_SIGNED): the client pays in the office first.
 * "Onlayn ödə" is not available yet (short message → office), "Ofisə yaxınlaş" books an office visit with the reason
 * "payment" through the existing office booking (client-process/office). After staff recorded the payment the card
 * says so. Server: GET /api/client-process/payment (lib/casePayment).
 */
export interface CasePaymentView {
  caseId: string;
  due: boolean;
  paid: boolean;
  paidAt: string | null;
  amountCents: number | null;
  currency: string;
  invoiceNumber: string | null;
  visit: { id: string; startsAt: string; endsAt: string; location: string | null } | null;
}

export const paymentKey = (caseId: string) => ['client-process', 'payment', caseId] as const;

export const useCasePayment = (caseId: string, enabled = true) =>
  useQuery({
    queryKey: paymentKey(caseId),
    queryFn: async () => (await api.get<{ payment: CasePaymentView; offices: { index: number; city: string; address: string }[] }>('/client-process/payment', { params: { caseId } })).data,
    enabled: enabled && !!caseId,
    staleTime: 20_000,
  });

export const ClientPaymentCard = ({ caseId, status }: { caseId: string; status: string }) => {
  const { t, i18n } = useTranslation();
  const { dateTime } = useL10n();
  const brand = useBrand();
  const qc = useQueryClient();
  const onError = useCpError();
  const [mode, setMode] = useState<'online' | 'office' | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const { data } = useCasePayment(caseId, status === 'CONTRACT_SIGNED');

  const book = useMutation({
    mutationFn: () => api.post('/client-process/office/visits', { caseId, slotId, reason: 'payment' }),
    onSuccess: () => {
      toast.success(t('cp.office.booked'));
      setMode(null);
      setSlotId(null);
      void qc.invalidateQueries({ queryKey: paymentKey(caseId) });
      void qc.invalidateQueries({ queryKey: cpKeys.visits(caseId) });
      void qc.invalidateQueries({ queryKey: cpKeys.officeSlots });
    },
    onError: (e) => {
      onError(e);
      void qc.invalidateQueries({ queryKey: cpKeys.officeSlots });
    },
  });

  const p = data?.payment;
  if (!p || status !== 'CONTRACT_SIGNED') return null;

  if (p.paid) {
    return (
      <section id="payment" className="card scroll-mt-24 border-success-border bg-success-bg p-5 sm:p-6" aria-labelledby="payment-title" data-testid="payment-paid">
        <h2 id="payment-title" className="flex items-center gap-2 text-lg font-semibold text-success-fg">
          <CheckCircle2 className="size-5" aria-hidden /> {t('cp.pay.paidTitle')}
        </h2>
        <p className="mt-1 text-sm text-ink/80">{t('cp.pay.paidText')}</p>
      </section>
    );
  }
  if (!p.due) return null;

  const amount = p.amountCents ? new Intl.NumberFormat(i18n.language, { style: 'currency', currency: p.currency }).format(p.amountCents / 100) : null;
  const address = p.visit?.location ?? data?.offices[0]?.address ?? '';

  return (
    <section id="payment" className="card scroll-mt-24 border-warning-border p-5 sm:p-6" aria-labelledby="payment-title" data-testid="payment-due">
      <h2 id="payment-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
        <CreditCard className="size-5 text-primary" aria-hidden /> {t('cp.pay.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{amount ? t('cp.pay.amount', { amount }) : t('cp.pay.noAmount')}</p>

      {p.visit ? (
        <div className="mt-4 space-y-1.5 rounded-xl border border-line bg-sunken p-4 text-sm" data-testid="payment-visit">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <CalendarCheck className="size-4 text-primary" aria-hidden /> {t('cp.pay.booked', { when: dateTime(p.visit.startsAt) })}
          </p>
          {address && (
            <p className="flex items-center gap-2 text-muted">
              <MapPin className="size-4 shrink-0" aria-hidden /> {t('cp.pay.address', { address })}
            </p>
          )}
          <p className="flex items-center gap-2 text-muted">
            <Phone className="size-4 shrink-0" aria-hidden /> {t('cp.pay.phone', { phone: brand.phone })}
          </p>
          <Link to={`/account/cases/${caseId}?tab=other#office-visits`} className="inline-block pt-1 font-semibold text-link underline underline-offset-2">
            {t('cp.pay.change')}
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary w-full sm:w-auto" aria-pressed={mode === 'online'} onClick={() => setMode('online')}>
              <CreditCard className="size-4" aria-hidden /> {t('cp.pay.online')}
            </button>
            <button type="button" className="btn-primary w-full sm:w-auto" aria-pressed={mode === 'office'} onClick={() => setMode('office')}>
              <Store className="size-4" aria-hidden /> {t('cp.pay.office')}
            </button>
          </div>
          {mode === 'online' && (
            <div className="mt-4 rounded-xl border border-info-border bg-info-bg p-4 text-sm text-info-fg" role="status" data-testid="payment-online-soon">
              <p>{t('cp.pay.onlineSoon')}</p>
              <button type="button" className="btn-primary btn-sm mt-3" onClick={() => setMode('office')}>
                <Store className="size-4" aria-hidden /> {t('cp.pay.office')}
              </button>
            </div>
          )}
          {mode === 'office' && (
            <form
              className="mt-4 space-y-3 rounded-xl border border-line p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (slotId) book.mutate();
              }}
            >
              <p className="label">{t('cp.pay.pick')}</p>
              <SlotPicker selected={slotId} onPick={setSlotId} />
              <p className="flex items-center gap-2 text-xs text-muted">
                <Phone className="size-3.5 shrink-0" aria-hidden /> {t('cp.pay.phone', { phone: brand.phone })}
              </p>
              <button type="submit" className="btn-primary w-full sm:w-auto" disabled={!slotId || book.isPending}>
                {t('cp.pay.confirm')}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
};
