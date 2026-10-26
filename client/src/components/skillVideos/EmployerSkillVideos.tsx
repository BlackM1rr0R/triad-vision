import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Film } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDuration, type SkillVideoBase } from './api';

/** Employer portal: approved + consented skill videos of the presented candidates, keyed by application id. */
export const useEmployerSkillVideos = () =>
  useQuery({
    queryKey: ['company-skill-videos'],
    queryFn: async () => (await api.get<{ items: { applicationId: string; videos: SkillVideoBase[] }[] }>('/company/skill-videos')).data.items,
    staleTime: 60_000,
    select: (items) => new Map(items.map((i) => [i.applicationId, i.videos])),
  });

const Player = ({ v, applicationId }: { v: SkillVideoBase; applicationId: string }) => {
  const { t } = useTranslation();
  const counted = useRef(false);
  const q = encodeURIComponent(v.updatedAt);
  return (
    <figure className="min-w-0">
      {/* controlsList="nodownload" only hides the browser's download button: a deterrent, not DRM. */}
      <video
        controls
        preload="none"
        playsInline
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onPlay={() => {
          if (counted.current) return;
          counted.current = true;
          void api.post(`/company/skill-videos/${v.id}/view`, { applicationId }).catch(() => undefined);
        }}
        className="aspect-video w-full rounded-lg bg-navy-900"
        poster={v.hasPoster ? `/api/company/skill-videos/${v.id}/poster?v=${q}` : undefined}
        src={`/api/company/skill-videos/${v.id}/file?v=${q}`}
        aria-label={v.title}
      />
      <figcaption className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-semibold text-ink">{v.title}</span>
        <span className="shrink-0 text-muted">
          {t(`skillVideos.skills.${v.skill}`)} · {fmtDuration(v.durationSec)}
        </span>
      </figcaption>
    </figure>
  );
};

export const EmployerSkillVideos = ({ applicationId, videos, className }: { applicationId: string; videos: SkillVideoBase[] | undefined; className?: string }) => {
  const { t } = useTranslation();
  if (!videos?.length) return null;
  return (
    <section className={className ?? 'mt-3 rounded-xl border border-line bg-surface p-3'}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-brand-700 uppercase">
        <Film className="size-3.5" aria-hidden /> {t('skillVideos.employer.title')}
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {videos.map((v) => (
          <Player key={v.id} v={v} applicationId={applicationId} />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">{t('skillVideos.employer.note')}</p>
    </section>
  );
};
