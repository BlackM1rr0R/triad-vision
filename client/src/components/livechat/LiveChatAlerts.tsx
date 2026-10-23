import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useRealtime } from '@/lib/realtime';
import { registerCopy } from '@/i18n';
import { pagesCalls } from '@/i18n/pagesCalls';

registerCopy(pagesCalls);

const SOUND_KEY = 'tv-livechat-sound';
export const soundEnabled = () => {
  try {
    return localStorage.getItem(SOUND_KEY) !== '0';
  } catch {
    return true;
  }
};
export const setSoundEnabled = (on: boolean) => {
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    /* private mode */
  }
};

/** Two short tones (Web Audio, no asset file — CSP friendly). Browsers may block it before the first click. */
export const chime = () => {
  if (!soundEnabled()) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    /* audio unavailable */
  }
};

/**
 * Mounted in the workspace and admin layouts: a new live chat in the queue → sound + toast with "Open";
 * an incoming phone call → toast. Keeps the queue / call lists fresh.
 */
export const LiveChatAlerts = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  useRealtime('livechat.queue', (p) => {
    void qc.invalidateQueries({ queryKey: ['livechat'] });
    if (p.change !== 'new') return;
    chime();
    toast(t('livechat.staff.newChat', { name: String(p.name ?? '—') }), {
      id: `livechat-${String(p.chatId)}`,
      duration: 20_000,
      action: { label: t('livechat.staff.open'), onClick: () => navigate(`/workspace/live-chats?chat=${String(p.chatId)}`) },
    });
  });
  useRealtime('livechat.message', () => void qc.invalidateQueries({ queryKey: ['livechat'] }));
  useRealtime('call.inbound', (p) => {
    void qc.invalidateQueries({ queryKey: ['calls', 'list'] });
    toast(t('calls.incoming', { label: String(p.label ?? '') }), { duration: 15_000 });
  });
  useRealtime('callback.new', () => void qc.invalidateQueries({ queryKey: ['callbacks'] }));
  return null;
};

export default LiveChatAlerts;

/** Number of chats waiting for a colleague (rail badge); shares the queue query of the live chat page. */
export const useLiveChatWaiting = () => {
  const q = useQuery({
    queryKey: ['livechat', 'queue'],
    queryFn: async () => (await api.get<{ me: string; chats: { status: string }[] }>('/livechat/staff/queue')).data,
    refetchInterval: 60_000,
    retry: false,
  });
  return q.data?.chats.filter((c) => c.status === 'WAITING').length ?? 0;
};
