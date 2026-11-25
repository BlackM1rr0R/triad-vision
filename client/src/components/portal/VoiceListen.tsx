import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Square, Volume2 } from 'lucide-react';
import { api } from '@/lib/api';

/** Which journey steps have a recorded narration (GET /api/journey/voice; key -> version for cache busting). */
export const useVoiceSteps = () =>
  useQuery({
    queryKey: ['journey-voice'],
    queryFn: async () => Object.fromEntries((await api.get<{ steps: { key: string; v: number }[] }>('/journey/voice')).data.steps.map((s) => [s.key, s.v])) as Record<string, number>,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

/** One clip plays at a time. */
let playing: HTMLAudioElement | null = null;

/** Small "Dinlə" button; renders nothing unless the owner recorded audio for this step. */
export function VoiceListen({ stepKey, steps }: { stepKey: string; steps: Record<string, number> | undefined }) {
  const { t } = useTranslation();
  const [on, setOn] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );
  const v = steps?.[stepKey];
  if (v === undefined) return null;
  const toggle = () => {
    if (on) {
      audio.current?.pause();
      setOn(false);
      return;
    }
    playing?.pause();
    const a = (audio.current ??= new Audio(`/api/journey/voice/${stepKey}/audio?v=${v}`));
    playing = a;
    a.onended = () => setOn(false);
    a.onpause = () => setOn(false);
    void a
      .play()
      .then(() => setOn(true))
      .catch(() => setOn(false));
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="mt-1 inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-link hover:bg-primary/[0.06]"
      aria-pressed={on}
    >
      {on ? <Square className="size-3" aria-hidden /> : <Volume2 className="size-3" aria-hidden />}
      {on ? t('jmap.stopListen') : t('jmap.listen')}
    </button>
  );
}
