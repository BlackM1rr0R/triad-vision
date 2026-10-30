import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download, FileText, MessageCircle, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { LoadingBlock, Panel } from '@/components/admin/ui';
import { L10nInput, emptyL10n } from '@/components/admin/L10nInput';
import { registerCopy } from '@/i18n';
import { pagesReferralShare } from '@/i18n/pagesReferralShare';
import { api } from '@/lib/api';
import type { L10n } from '@/lib/types';

registerCopy(pagesReferralShare);

/**
 * Admin editors of the referral programme's sharing side: share messages per profession (STAFF+),
 * the public terms text (ADMIN+) and the payout report for accounting (CSV per period).
 */

interface Template {
  key: string;
  label: L10n;
  text: L10n;
}
const KEY = ['admin', 'growth', 'referrals', 'share'] as const;

export const ReferralTemplatesEditor = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: [...KEY, 'templates'], queryFn: async () => (await api.get<{ items: Template[]; defaults: { items: Template[] } }>('/admin/growth/referrals/templates')).data });
  const [items, setItems] = useState<Template[] | null>(null);
  useEffect(() => {
    if (data && !items) setItems(data.items);
  }, [data, items]);
  const save = useMutation({
    mutationFn: (v: Template[]) => api.put('/admin/growth/referrals/templates', { items: v }),
    onSuccess: () => {
      toast.success(t('gp.common.saved'));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error(t('gp.common.error')),
  });
  if (!data || !items) return <LoadingBlock className="min-h-24" />;
  const set = (i: number, patch: Partial<Template>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const keysOk = items.every((x) => /^[a-z0-9-]{2,30}$/.test(x.key)) && new Set(items.map((x) => x.key)).size === items.length;
  return (
    <Panel
      title={t('rs.admin.templates')}
      icon={MessageCircle}
      actions={
        <button type="button" className="btn-ghost btn-sm" onClick={() => setItems(data.defaults.items)}>
          <RotateCcw className="size-3.5" aria-hidden /> {t('rs.admin.resetDefaults')}
        </button>
      }
    >
      <p className="mb-4 text-xs text-muted">{t('rs.admin.templatesHint')}</p>
      <ul className="space-y-5">
        {items.map((x, i) => (
          <li key={i} className="space-y-2 border-b border-line pb-5 last:border-0">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block w-40">
                <span className="label">{t('rs.admin.key')}</span>
                <input className="input font-mono" maxLength={30} value={x.key} onChange={(e) => set(i, { key: e.target.value.toLowerCase() })} />
              </label>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                <Trash2 className="size-3.5" aria-hidden /> {t('rs.admin.remove')}
              </button>
            </div>
            <L10nInput label={t('rs.admin.label')} value={x.label} onChange={(v) => set(i, { label: v })} />
            <L10nInput label={t('rs.admin.text')} value={x.text} onChange={(v) => set(i, { text: v })} multiline rows={3} />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        {items.length < 30 && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setItems([...items, { key: `new-${items.length + 1}`, label: emptyL10n(), text: { az: '{link}', de: '{link}', en: '{link}', ru: '{link}' } }])}>
            <Plus className="size-4" aria-hidden /> {t('rs.admin.addTemplate')}
          </button>
        )}
        <button type="button" className="btn-primary btn-sm" disabled={save.isPending || !keysOk} onClick={() => save.mutate(items)}>
          {t('gp.common.save')}
        </button>
      </div>
    </Panel>
  );
};

export const ReferralTermsEditor = ({ canEdit }: { canEdit: boolean }) => {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: [...KEY, 'terms'], queryFn: async () => (await api.get<{ body: L10n; defaults: { body: L10n } }>('/admin/growth/referrals/terms')).data });
  const [body, setBody] = useState<L10n | null>(null);
  useEffect(() => {
    if (data && !body) setBody(data.body);
  }, [data, body]);
  const save = useMutation({
    mutationFn: (v: L10n) => api.put('/admin/growth/referrals/terms', { body: v }),
    onSuccess: () => toast.success(t('gp.common.saved')),
    onError: () => toast.error(t('gp.common.error')),
  });
  if (!data || !body) return <LoadingBlock className="min-h-24" />;
  return (
    <Panel
      title={t('rs.admin.terms')}
      icon={FileText}
      actions={
        <Link to="/referral-terms" target="_blank" className="btn-ghost btn-sm">
          {t('rs.admin.openTerms')}
        </Link>
      }
    >
      <p className="mb-3 text-xs text-muted">{t('rs.admin.termsHint')}</p>
      <L10nInput label={t('rs.admin.terms')} value={body} onChange={setBody} multiline rows={10} />
      {canEdit && (
        <div className="mt-4 flex justify-between gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setBody(data.defaults.body)}>
            <RotateCcw className="size-3.5" aria-hidden /> {t('rs.admin.resetDefaults')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate(body)}>
            {t('gp.common.save')}
          </button>
        </div>
      )}
    </Panel>
  );
};

export const ReferralPayoutReport = () => {
  const { t } = useTranslation();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [all, setAll] = useState(false);
  const qs = new URLSearchParams(Object.entries({ from, to, all: all ? '1' : '' }).filter(([, v]) => !!v)).toString();
  return (
    <Panel title={t('rs.admin.payouts')} icon={Download}>
      <p className="mb-3 text-xs text-muted">{t('rs.admin.payoutsHint')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">{t('rp.admin.from')}</span>
          <input type="date" className="input w-auto" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('rp.admin.to')}</span>
          <input type="date" className="input w-auto" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {t('rs.admin.includeDiscounts')}
        </label>
        <a href={`/api/admin/growth/referrals/payouts.csv${qs ? `?${qs}` : ''}`} className="btn-secondary btn-sm" download>
          <Download className="size-3.5" aria-hidden /> {t('rs.admin.csv')}
        </a>
      </div>
    </Panel>
  );
};
