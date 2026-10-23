import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock, ExternalLink, HelpCircle, Languages, MapPin, Stamp, Wallet, Lightbulb, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { Drawer } from '@/components/admin/Drawer';
import './api'; // registers the copy
import type { ClientGuide, GuideField } from './api';

const ICONS: Partial<Record<GuideField, typeof MapPin>> = { where: MapPin, duration: Clock, cost: Wallet, apostille: Stamp, translation: Languages, tips: Lightbulb };

/** The guide body (portal drawer and the admin preview). */
export const GuideView = ({ guide }: { guide: Pick<ClientGuide, 'text' | 'links' | 'sampleImage' | 'verified'> }) => {
  const { t } = useTranslation();
  const g = guide.text;
  const mistakes = g.mistakes.split('\n').map((s) => s.trim()).filter(Boolean);
  return (
    <div className="space-y-4">
      {!guide.verified && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('clientData.guide.unverified')}
        </p>
      )}
      {g.summary && <p className="text-sm leading-relaxed text-ink">{g.summary}</p>}
      {guide.sampleImage && (
        <figure>
          <img src={guide.sampleImage} alt={t('clientData.guide.sample')} loading="lazy" className="max-h-72 w-full rounded-lg border border-line bg-surface object-contain" />
          <figcaption className="mt-1 text-[11px] text-muted">{t('clientData.guide.sample')}</figcaption>
        </figure>
      )}
      <dl className="space-y-3">
        {(['where', 'duration', 'cost', 'apostille', 'translation', 'tips'] as const).map((k) => {
          if (!g[k]) return null;
          const Icon = ICONS[k]!;
          return (
            <div key={k} className="flex gap-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs font-semibold text-muted">{t(`clientData.guide.${k}`)}</dt>
                <dd className="text-sm whitespace-pre-line text-ink">{g[k]}</dd>
              </div>
            </div>
          );
        })}
      </dl>
      {mistakes.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 dark:border-red-900/50 dark:bg-red-950/20">
          <p className="text-xs font-semibold text-red-800 dark:text-red-300">{t('clientData.guide.mistakes')}</p>
          <ul className="mt-1.5 space-y-1">
            {mistakes.map((m) => (
              <li key={m} className="flex gap-2 text-sm text-ink">
                <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-500" aria-hidden /> {m}
              </li>
            ))}
          </ul>
        </div>
      )}
      {guide.links.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted">{t('clientData.guide.links')}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {guide.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-brand-700 hover:border-brand-400">
                  {l.label} <ExternalLink className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/** "Necə almalı?" next to the upload button of a requirement; renders nothing when there is no guide. */
export default function DocGuideButton({ requirementKey, title }: { requirementKey: string | null | undefined; title: string }) {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const [open, setOpen] = useState(false);
  const key = requirementKey?.toUpperCase() ?? '';
  const { data } = useQuery({
    queryKey: ['client-guide', key, locale],
    queryFn: async () => (await api.get<{ guides: Record<string, ClientGuide> }>(`/client-data/guides?keys=${encodeURIComponent(key)}`)).data.guides[key] ?? null,
    enabled: !!key,
    staleTime: 10 * 60 * 1000,
  });
  if (!data) return null;
  return (
    <>
      <button type="button" className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 hover:underline dark:hover:bg-brand-950/30" onClick={() => setOpen(true)}>
        <HelpCircle className="size-3.5" aria-hidden /> {t('clientData.guide.button')}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`${t('clientData.guide.button')} — ${title}`}>
        <GuideView guide={data} />
      </Drawer>
    </>
  );
}
