import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, ExternalLink, ShieldCheck, Trash2, WifiOff } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { clearOffline, KEEP_DAYS, OFFLINE_PAGE, offlineSupported, removeAppointmentOffline, saveAppointmentOffline, useOfflineIndex, type OfflineCase } from '@/lib/offlineDocs';
import { countdownText, type Countdown } from '@/components/portal/CountdownCards';
import { switchLabel } from '@/components/portal/FamilySwitcher';
import { Spinner } from '@/components/ui/Spinner';
import { useOfflineWho } from './useOffline';

interface Pack {
  cases: {
    id: string;
    number: string;
    member: { firstName: string | null; relation: string | null } | null;
    appointment: { at: string; place: string | null } | null;
    cards: Countdown[];
  }[];
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * "Oflayn sənədlərim" (portal › Documents): what this device keeps offline (count, size, until when), the
 * "Termin məlumatı" switch (appointment card + countdowns for the static offline page), "open the offline page" and
 * "delete all". Privacy note: device only, cleared on logout and after 30 days.
 */
export const OfflineCard = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { date, dateTime } = useL10n();
  const idx = useOfflineIndex();
  const who = useOfflineWho();
  const [busy, setBusy] = useState<'appt' | 'clear' | null>(null);
  if (!offlineSupported() || !who) return null;

  const docs = idx?.docs ?? [];
  const size = docs.reduce((a, d) => a + d.size, 0);
  const oldest = [...docs.map((d) => d.savedAt), ...(idx?.appointment ? [idx.appointment.savedAt] : [])].sort()[0];

  const saveAppointment = async () => {
    setBusy('appt');
    try {
      if (idx?.appointment) {
        await removeAppointmentOffline();
        toast.success(t('cplus.offline.removed'));
        return;
      }
      const pack = (await api.get<Pack>('/account/plus/offline-pack')).data;
      const cases: OfflineCase[] = pack.cases.map((c) => ({
        id: c.id,
        number: c.number,
        who: c.member ? switchLabel(t, { kind: (c.member.relation?.toLowerCase() ?? 'other') as 'spouse', firstName: c.member.firstName }) : null,
        appointment: c.appointment ? { at: dateTime(c.appointment.at), place: c.appointment.place } : null,
        cards: c.cards.map((k) => ({ kind: k.kind, at: k.kind === 'ANMELDUNG' ? date(k.at) : dateTime(k.at), days: k.days, place: k.place, detail: k.detail, text: countdownText(t, k) })),
      }));
      await saveAppointmentOffline(cases, who);
      toast.success(t('cplus.offline.appointmentSaved'));
    } catch {
      toast.error(t('cplus.offline.failed'));
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    setBusy('clear');
    await clearOffline();
    setBusy(null);
    toast.success(t('cplus.offline.cleared'));
  };

  return (
    <section className={className ?? 'card p-5 sm:p-6'} aria-labelledby="offline-title">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-sky">
          <WifiOff className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="offline-title" className="type-card-title">
            {t('cplus.offline.title')}
          </h3>
          <p className="mt-1 text-sm text-muted">{t('cplus.offline.text')}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink">
        {docs.length ? t('cplus.offline.count', { count: docs.length, size: formatBytes(size) }) : t('cplus.offline.none')}
        {oldest && <span className="text-muted"> · {t('cplus.offline.until', { date: date(new Date(new Date(oldest).getTime() + KEEP_DAYS * DAY)) })}</span>}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={idx?.appointment ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} onClick={() => void saveAppointment()} disabled={!!busy} aria-pressed={!!idx?.appointment}>
          {busy === 'appt' ? <Spinner className="size-3.5" /> : <CalendarClock className="size-4" aria-hidden />}
          {idx?.appointment ? t('cplus.offline.appointmentSaved') : t('cplus.offline.appointment')}
        </button>
        {idx && (
          <a href={OFFLINE_PAGE} target="_blank" rel="noopener" className="btn-secondary btn-sm">
            <ExternalLink className="size-4" aria-hidden /> {t('cplus.offline.open')}
          </a>
        )}
        {idx && (
          <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => void clear()} disabled={!!busy}>
            <Trash2 className="size-4" aria-hidden /> {t('cplus.offline.clear')}
          </button>
        )}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('cplus.offline.privacy')}
      </p>
    </section>
  );
};

export default OfflineCard;
