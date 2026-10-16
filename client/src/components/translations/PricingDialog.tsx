import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { SERVICES, useTrError, type TrPricing, type TrService } from './shared';

const DEFAULT_DOC_TYPES = ['DIPLOMA', 'BIRTH_CERT', 'MARRIAGE_CERT', 'POLICE_CLEARANCE', 'DRIVING_LICENCE', 'EMPLOYMENT_REFERENCE', 'OTHER'];
const DEFAULTS: TrPricing = {
  currency: 'EUR',
  perPage: { TRANSLATION: 3500, APOSTILLE: 4500, TRANSLATION_APOSTILLE: 7500, NOTARY: 2500 },
  expressSurchargePct: 50,
  languages: ['az', 'de', 'en', 'ru', 'tr', 'uk'],
  documentTypes: DEFAULT_DOC_TYPES,
};

const list = (s: string) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))];

/** Admin+ dialog editing Setting `translationPricing` (PUT /api/admin/settings/translationPricing). */
export const PricingDialog = ({ open, pricing, onClose }: { open: boolean; pricing: TrPricing | undefined; onClose: () => void }) => {
  const { t } = useTranslation();
  const onError = useTrError();
  const qc = useQueryClient();
  const titleId = useId();
  const [currency, setCurrency] = useState('EUR');
  const [perPage, setPerPage] = useState<Record<TrService, string>>({ TRANSLATION: '', APOSTILLE: '', TRANSLATION_APOSTILLE: '', NOTARY: '' });
  const [express, setExpress] = useState('50');
  const [languages, setLanguages] = useState('');
  const [docTypes, setDocTypes] = useState('');

  const fill = (p: TrPricing) => {
    setCurrency(p.currency);
    setPerPage(Object.fromEntries(SERVICES.map((s) => [s, (p.perPage[s] / 100).toFixed(2)])) as Record<TrService, string>);
    setExpress(String(p.expressSurchargePct));
    setLanguages(p.languages.join(', '));
    setDocTypes(p.documentTypes.join(', '));
  };

  useEffect(() => {
    if (open) fill(pricing ?? DEFAULTS);
  }, [open, pricing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const save = useMutation({
    mutationFn: async () => {
      const value: TrPricing = {
        currency: currency.trim().toUpperCase(),
        perPage: Object.fromEntries(SERVICES.map((s) => [s, Math.max(0, Math.round(Number(perPage[s].replace(',', '.')) * 100) || 0)])) as Record<TrService, number>,
        expressSurchargePct: Math.max(0, Math.min(500, Number(express) || 0)),
        languages: list(languages).map((l) => l.toLowerCase()),
        documentTypes: list(docTypes).map((d) => d.toUpperCase().replace(/[^A-Z0-9_]/g, '_')),
      };
      await api.put('/admin/settings/translationPricing', { value });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['translations', 'pricing'] });
      toast.success(t('trOrders.admin.pricing.saved'));
      onClose();
    },
    onError,
  });

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-navy-950/60" onClick={onClose} aria-hidden />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {t('trOrders.admin.pricing.title')}
          </h2>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface" aria-label={t('common.close')}>
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="pr-cur">
                {t('trOrders.admin.pricing.currency')}
              </label>
              <input id="pr-cur" className="input uppercase" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} required pattern="[A-Za-z]{3}" />
            </div>
            <div>
              <label className="label" htmlFor="pr-exp">
                {t('trOrders.admin.pricing.express')}
              </label>
              <input id="pr-exp" type="number" min={0} max={500} className="input" value={express} onChange={(e) => setExpress(e.target.value)} />
            </div>
          </div>
          <fieldset>
            <legend className="label">{t('trOrders.admin.pricing.perPage')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SERVICES.map((s) => (
                <label key={s} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink">{t(`trOrders.service.${s}`)}</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-24 rounded-md border border-line bg-field px-2 py-1 text-right text-sm text-ink tabular-nums"
                    value={perPage[s]}
                    onChange={(e) => setPerPage((p) => ({ ...p, [s]: e.target.value }))}
                    aria-label={t(`trOrders.service.${s}`)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="pr-lang">
              {t('trOrders.admin.pricing.languages')}
            </label>
            <input id="pr-lang" className="input" value={languages} onChange={(e) => setLanguages(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pr-docs">
              {t('trOrders.admin.pricing.docTypes')}
            </label>
            <textarea id="pr-docs" rows={2} className="input" value={docTypes} onChange={(e) => setDocTypes(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted">{t('trOrders.admin.pricing.docTypesHint', { codes: DEFAULT_DOC_TYPES.join(', ') })}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="text-xs font-semibold text-muted hover:text-brand-700" onClick={() => fill(DEFAULTS)}>
            {t('trOrders.admin.pricing.defaults')}
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
              {save.isPending && <Spinner className="size-4" />} {t('common.save')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default PricingDialog;
