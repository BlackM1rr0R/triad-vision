import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FileDown, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { useBlobDownload } from '@/components/cv/CvDownloadButton';
import type { ProfileContent } from './CandidateProfileCard';
import './shared';

/** Employer portal: the candidate profiles Triad Vision shared (read-only), keyed by application id. */

export interface SharedProfileRow {
  applicationId: string;
  language: 'de' | 'en';
  content: ProfileContent | null;
  updatedAt: string;
}

export const useSharedProfiles = () =>
  useQuery({
    queryKey: ['company-ai-profiles'],
    queryFn: async () => (await api.get<{ items: SharedProfileRow[] }>('/company/ai/profiles')).data.items,
    staleTime: 60_000,
    select: (items) => new Map(items.filter((i) => i.content).map((i) => [i.applicationId, i])),
  });

const List = ({ title, items }: { title: string; items: string[] }) =>
  items.length ? (
    <div>
      <p className="text-xs font-semibold text-navy-900">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink/85">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  ) : null;

export const SharedProfile = ({ profile }: { profile: SharedProfileRow }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { busy, run } = useBlobDownload();
  const c = profile.content;
  if (!c) return null;
  return (
    <section className="mt-3 rounded-xl border border-line bg-surface p-3" lang={profile.language}>
      <button type="button" className="flex w-full items-start justify-between gap-2 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-brand-700 uppercase">
            <Sparkles className="size-3.5" aria-hidden /> {t('aiEmployer.company.profileTitle')}
          </span>
          <span className="mt-0.5 block text-sm font-semibold text-navy-900">{c.headline}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700">
          {open ? t('aiEmployer.company.less') : t('aiEmployer.company.more')}
          <ChevronDown className={`size-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {c.summary && <p className="text-xs whitespace-pre-line text-ink/85">{c.summary}</p>}
          <List title={t('aiEmployer.company.whyFit')} items={c.whyFit} />
          {c.experience.length > 0 && (
            <List title={t('aiEmployer.company.experience')} items={c.experience.map((e) => (e.years != null ? `${e.role} (${e.years})` : e.role))} />
          )}
          <List title={t('aiEmployer.company.openPoints')} items={c.openPoints} />
          {c.availability && (
            <p className="text-xs text-ink/85">
              <span className="font-semibold text-navy-900">{t('aiEmployer.company.availability')}: </span>
              {c.availability}
            </p>
          )}
          <button
            type="button"
            onClick={() => void run(`/company/ai/profiles/${profile.applicationId}/pdf`, 'Kandidatenprofil.pdf')}
            disabled={busy}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/80 hover:border-brand-400 disabled:opacity-60"
          >
            {busy ? <Spinner className="size-3.5" /> : <FileDown className="size-3.5" aria-hidden />} {t('aiEmployer.company.pdf')}
          </button>
        </div>
      )}
    </section>
  );
};
