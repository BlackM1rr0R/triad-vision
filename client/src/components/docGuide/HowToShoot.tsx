import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Camera, CheckCircle2, ChevronDown, Lightbulb, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesClientPlus } from '@/i18n/pagesClientPlus';
import type { ClientGuide } from '@/components/clientData/api';
import { DocExample, exampleKindOf, type ExampleKind } from './DocExamples';

registerCopy(pagesClientPlus);

/** The guide of a requirement key (same query as the "Necə almalı?" button, so one request serves both). */
export const useClientGuide = (requirementKey: string | null | undefined) => {
  const { locale } = useL10n();
  const key = requirementKey?.toUpperCase() ?? '';
  return useQuery({
    queryKey: ['client-guide', key, locale],
    queryFn: async () => (await api.get<{ guides: Record<string, ClientGuide> }>(`/client-data/guides?keys=${encodeURIComponent(key)}`)).data.guides[key] ?? null,
    enabled: !!key,
    staleTime: 10 * 60 * 1000,
  });
};

const Figure = ({ good, kind, image, alt }: { good: boolean; kind: ExampleKind; image: string | null; alt: string }) => {
  const { t } = useTranslation();
  const Icon = good ? CheckCircle2 : XCircle;
  return (
    <figure className={clsx('overflow-hidden rounded-xl border-2 bg-card', good ? 'border-success-border' : 'border-danger-border')}>
      <div className="aspect-[10/7] w-full bg-sunken">
        {image ? <img src={image} alt={alt} loading="lazy" className="size-full object-contain" /> : <DocExample kind={kind} bad={!good} title={alt} className="size-full" />}
      </div>
      <figcaption className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold', good ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg')}>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {good ? t('cplus.guide.good') : t('cplus.guide.bad')}
      </figcaption>
    </figure>
  );
};

/** The panel body: GOOD / BAD pictures and 3–5 tips (admin overrides, else the built-in set of the kind). */
export const HowToShootBody = ({ requirementKey, title, examples }: { requirementKey: string | null | undefined; title: string; examples?: ClientGuide['examples'] }) => {
  const { t } = useTranslation();
  const kind = exampleKindOf(requirementKey);
  const tips = examples?.tips?.length ? examples.tips : t(`cplus.guide.tip.${kind}`).split('\n').filter(Boolean);
  const illustrated = !examples?.goodImage || !examples?.badImage;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <Figure good kind={kind} image={examples?.goodImage ?? null} alt={t('cplus.guide.goodAlt', { title })} />
        <Figure good={false} kind={kind} image={examples?.badImage ?? null} alt={t('cplus.guide.badAlt', { title })} />
      </div>
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Lightbulb className="size-3.5" aria-hidden /> {t('cplus.guide.tips')}
        </p>
        <ul className="mt-1.5 space-y-1">
          {tips.slice(0, 5).map((tip) => (
            <li key={tip} className="flex gap-2 text-sm text-ink">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> {tip}
            </li>
          ))}
        </ul>
      </div>
      {illustrated && <p className="text-[11px] text-muted">{t('cplus.guide.illustrated')}</p>}
    </div>
  );
};

/**
 * "Necə çəkməli?" next to an upload spot: a toggle that opens an inline panel with a GOOD and a BAD example picture
 * and short tips for the document type. Works without any CMS data (built-in illustrated examples); an admin can
 * replace pictures and tips per requirement key (DocumentGuide content._examples, Admin → Sənəd bələdçiləri).
 */
export const HowToShoot = ({ requirementKey, title, className }: { requirementKey: string | null | undefined; title: string; className?: string }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { data } = useClientGuide(requirementKey);
  return (
    <div className={className}>
      <button
        type="button"
        className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-link hover:bg-sunken hover:underline"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Camera className="size-3.5" aria-hidden /> {t('cplus.guide.button')}
        <ChevronDown className={clsx('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            aria-label={t('cplus.guide.title', { title })}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-line bg-sunken/60 p-3 sm:p-4">
              <HowToShootBody requirementKey={requirementKey} title={title} examples={data?.examples} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HowToShoot;
