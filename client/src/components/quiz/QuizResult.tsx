import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, CheckCircle2, CircleAlert, ClipboardList, MessageCircle, RotateCcw, Send, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { useL10n } from '@/lib/l10n';
import type { VisaCategory } from '@/lib/types';
import { ReadinessGauge } from './ReadinessGauge';
import type { ChecklistItem, QuizResult as Result } from './scoring';
import { sized } from '@/lib/img';

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: EASE },
});

const TONE_STYLE: Record<ChecklistItem['tone'], { icon: typeof CheckCircle2; box: string; badge: string }> = {
  todo: { icon: CircleAlert, box: 'text-warning', badge: 'bg-warning/10 text-warning' },
  info: { icon: ClipboardList, box: 'text-brand-600', badge: 'bg-brand-50 text-brand-700' },
  ok: { icon: CheckCircle2, box: 'text-success', badge: 'bg-success/10 text-success' },
};

/** Result screen of the eligibility quiz: best match, alternatives, readiness gauge and checklist. */
export const QuizResult = ({
  result,
  visas,
  onRestart,
}: {
  result: Result;
  visas: VisaCategory[];
  onRestart: () => void;
}) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const bySlug = (slug: string) => visas.find((v) => v.slug === slug);
  const top = bySlug(result.top.slug);
  const level = result.readiness < 40 ? 'low' : result.readiness < 70 ? 'mid' : 'high';
  const reasons = [...new Set(result.top.reasons)].slice(0, 4);
  if (!reasons.length) reasons.push('fallback');

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-8">
      {/* ── Left: recommendation ── */}
      <div className="min-w-0 space-y-6">
        <motion.div {...fadeUp(0)}>
          <span className="eyebrow">
            <Sparkles className="size-4" />
            {t('quiz.result.eyebrow')}
          </span>
          <h2 className="mt-2 font-display text-2xl font-extrabold text-navy-900 sm:text-3xl">{t('quiz.result.title')}</h2>
          <p className="mt-1 text-muted">{t('quiz.result.subtitle')}</p>
        </motion.div>

        {top && (
          <motion.article {...fadeUp(0.1)} className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_20px_60px_-30px_rgba(11,31,68,0.45)]">
            <div className="relative h-44 overflow-hidden sm:h-56">
              <motion.img
                src={sized(top.image, 800)}
                alt=""
                className="size-full object-cover"
                initial={{ scale: 1.15 }}
                animate={{ scale: 1 }}
                transition={{ duration: 1.4, ease: EASE }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/30 to-transparent" />
              <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-de-gold px-3 py-1 text-xs font-bold text-navy-950">
                <Sparkles className="size-3.5" />
                {t('quiz.result.topMatch')}
              </span>
              <span className="absolute top-4 right-4 rounded-md bg-white/90 px-2 py-1 text-xs font-bold text-brand-700 backdrop-blur">{top.visaLabel}</span>
              <div className="absolute inset-x-4 bottom-4 flex items-end gap-3 sm:inset-x-6">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-lg">
                  <Icon name={top.icon} className="size-6" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-xl leading-tight font-bold break-words text-white sm:text-2xl">{tr(top.title)}</h3>
                  <p className="text-sm font-semibold text-white/80">{t('quiz.result.match', { score: result.top.score })}</p>
                </div>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <p className="leading-relaxed text-muted">{tr(top.summary)}</p>
              <h4 className="mt-5 text-sm font-bold tracking-wide text-navy-900 uppercase">{t('quiz.result.why')}</h4>
              <ul className="mt-3 space-y-2">
                {reasons.map((r) => (
                  <li key={r} className="flex gap-2.5 text-sm text-ink/90">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{t(`quiz.reasons.${r}`)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link to="/register" className="btn-primary justify-center">
                  <Send className="size-4" />
                  {t('quiz.result.apply')}
                </Link>
                <Link to={`/visas/${top.slug}`} className="btn-ghost justify-center">
                  <BookOpen className="size-4" />
                  {t('quiz.result.read')}
                </Link>
                <Link to="/contact" className="btn justify-center border border-line text-navy-900 hover:bg-surface">
                  <MessageCircle className="size-4" />
                  {t('quiz.result.ask')}
                </Link>
              </div>
            </div>
          </motion.article>
        )}

        {result.alternatives.length > 0 && (
          <motion.div {...fadeUp(0.25)}>
            <h3 className="mb-3 text-sm font-bold tracking-wide text-navy-900 uppercase">{t('quiz.result.alternatives')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {result.alternatives.map((m) => {
                const v = bySlug(m.slug);
                if (!v) return null;
                return (
                  <Link
                    key={m.slug}
                    to={`/visas/${v.slug}`}
                    className="group flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white p-3 transition hover:border-brand-400 hover:shadow-[0_14px_40px_-22px_rgba(11,31,68,0.35)]"
                  >
                    <img src={sized(v.image, 160)} alt="" loading="lazy" decoding="async" className="size-16 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-navy-900">{tr(v.title)}</p>
                      <p className="text-xs text-muted">
                        <span className="font-bold text-brand-700">{v.visaLabel}</span> · {t('quiz.result.match', { score: m.score })}
                      </p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-brand-600" />
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Right: readiness + checklist ── */}
      <div className="min-w-0 space-y-6">
        <motion.div {...fadeUp(0.15)} className="rounded-2xl bg-navy-950 p-6 text-center text-white">
          <p className="text-xs font-bold tracking-[0.18em] text-white/60 uppercase">{t('quiz.result.readiness')}</p>
          <div className="mt-4 rounded-full bg-white p-2 [width:fit-content] [margin-inline:auto]">
            <ReadinessGauge value={result.readiness} size={152} label={t('quiz.result.readiness')} />
          </div>
          <p
            className={clsx(
              'mt-4 font-display text-lg font-bold',
              level === 'low' ? 'text-de-gold' : level === 'mid' ? 'text-brand-400' : 'text-[#4ade80]',
            )}
          >
            {t(`quiz.result.readinessLevel.${level}`)}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-white/70">{t(`quiz.result.readinessText.${level}`)}</p>
        </motion.div>

        <motion.div {...fadeUp(0.3)} className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold text-navy-900">
            <ClipboardList className="size-5 text-brand-600" />
            {t('quiz.result.checklist')}
          </h3>
          <ul className="mt-4 space-y-3">
            {result.checklist.map((c, i) => {
              const s = TONE_STYLE[c.tone];
              const ToneIcon = s.icon;
              return (
                <motion.li
                  key={c.key}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.45, delay: 0.4 + i * 0.06, ease: EASE }}
                  className="flex gap-3"
                >
                  <ToneIcon className={clsx('mt-0.5 size-5 shrink-0', s.box)} />
                  <div className="min-w-0">
                    <span className={clsx('badge mb-1', s.badge)}>{t(`quiz.result.tones.${c.tone}`)}</span>
                    <p className="text-sm leading-relaxed text-ink/90">{t(`quiz.checklist.${c.key}`, c.params)}</p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </motion.div>

        <motion.div {...fadeUp(0.4)} className="space-y-4">
          <button type="button" onClick={onRestart} className="btn w-full justify-center border border-line text-navy-900 hover:bg-surface">
            <RotateCcw className="size-4" />
            {t('quiz.startAgain')}
          </button>
          <p className="text-xs leading-relaxed text-muted">{t('quiz.result.disclaimer')}</p>
        </motion.div>
      </div>
    </div>
  );
};
