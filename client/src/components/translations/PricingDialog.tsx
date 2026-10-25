import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('trOrders.admin.pricing.title')}
      closeLabel={t('common.close')}
      size="md"
      zIndex={90}
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button type="button" className="text-xs font-semibold text-muted hover:text-link" onClick={() => fill(DEFAULTS)}>
            {t('trOrders.admin.pricing.defaults')}
          </button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      }
    >
        <div className="grid gap-4">
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
    </Modal>
  );
};

export default PricingDialog;
