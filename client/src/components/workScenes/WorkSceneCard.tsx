import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, HardHat } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesWorkScenes } from '@/i18n/pagesWorkScenes';
import { SCENE_META, type SceneMeta } from '@/lib/workScenes/meta';

registerCopy(pagesWorkScenes);

/**
 * Link card to one work scene (/work-scenes/<scene>): shown on the profession guides (GuideDetail), the job
 * pages of that profession (JobLanding, JobDetail) and nowhere when `scene` is null, so callers can pass
 * sceneForGuide(…) / sceneForProfession(…) directly.
 */
export const WorkSceneCard = ({ scene, className }: { scene: SceneMeta | null; className?: string }) => {
  const { t } = useTranslation();
  if (!scene) return null;
  const name = t(`ws.scenes.${scene.id}.title`);
  return (
    <Link to={scene.path} className={clsx('group flex items-start gap-3 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-line-strong hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40', className)}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
        <HardHat className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{t('ws.card.title')}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted">{t('ws.card.text', { scene: name })}</span>
        <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
          {t('ws.card.cta')} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </span>
    </Link>
  );
};

/** All five scenes as compact link cards (portal German page, below the learning games). */
export const WorkSceneLinks = () => {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="work-scenes-h" className="space-y-3">
      <h2 id="work-scenes-h" className="font-display text-lg font-semibold text-ink">
        {t('ws.hubTitle')}
      </h2>
      <p className="text-sm text-muted">{t('ws.hubIntro')}</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SCENE_META.map((m) => (
          <li key={m.id}>
            <Link to={m.path} className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-line-strong hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
                <HardHat className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-semibold text-ink">
                  {t(`ws.scenes.${m.id}.title`)} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{t(`ws.scenes.${m.id}.teaser`)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
