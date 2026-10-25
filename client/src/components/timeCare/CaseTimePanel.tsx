import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { Panel } from '@/components/admin/ui';
import { fmtDuration, type Activity, type TimeEntry } from './api';
import { EntryDialog } from './EntryDialog';
import { TimerButton } from './TimerButton';

interface CaseTime {
  scope: 'mine' | 'all';
  totalMinutes: number;
  byActivity: { activity: Activity; minutes: number }[];
  byStaff: { userId: string; name: string; minutes: number }[];
  entries: TimeEntry[];
}

/** Case page card: "⏱ Başlat", manual entry, totals per activity / staff and the latest entries. */
export default function CaseTimePanel({ caseId }: { caseId: string }) {
  const { t, i18n } = useTranslation();
  const [edit, setEdit] = useState<TimeEntry | 'new' | null>(null);
  const q = useQuery({ queryKey: ['time', 'case', caseId], queryFn: async () => (await api.get<CaseTime>(`/admin/time/cases/${caseId}`)).data });
  const d = q.data;
  const date = (s: string) => new Date(s).toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit' });

  return (
    <Panel
      title={t('time.panel.title')}
      icon={Timer}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <TimerButton caseId={caseId} compact />
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEdit('new')}>
            <Plus className="size-4" /> {t('time.panel.manual')}
          </button>
        </div>
      }
    >
      {!d ? null : d.entries.length === 0 ? (
        <p className="text-sm text-muted">{t('time.panel.empty')}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              {t('time.panel.total')}: <strong className="tabular-nums">{fmtDuration(t, d.totalMinutes)}</strong>
            </p>
            <span className="text-[11px] text-muted">{d.scope === 'all' ? t('time.panel.scopeAll') : t('time.panel.scopeMine')}</span>
          </div>
          {d.byActivity.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {d.byActivity.map((a) => (
                <li key={a.activity} className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink">
                  {t(`time.activity.${a.activity}`)} · <span className="tabular-nums">{fmtDuration(t, a.minutes)}</span>
                </li>
              ))}
            </ul>
          )}
          {d.scope === 'all' && d.byStaff.length > 1 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted">{t('time.panel.byStaff')}</p>
              <ul className="space-y-0.5 text-sm">
                {d.byStaff.map((s) => (
                  <li key={s.userId} className="flex justify-between gap-2">
                    <span className="truncate">{s.name}</span>
                    <span className="tabular-nums">{fmtDuration(t, s.minutes)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="divide-y divide-line border-t border-line text-sm">
            {d.entries.slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5">
                <span className="w-12 shrink-0 text-xs text-muted tabular-nums">{date(e.startedAt)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {t(`time.activity.${e.activity}`)}
                  {d.scope === 'all' && e.userName && <span className="text-xs text-muted"> · {e.userName}</span>}
                  {e.note && <span className="text-xs text-muted"> · {e.note}</span>}
                </span>
                <span className="text-xs whitespace-nowrap tabular-nums">{e.running ? t('time.page.runningNow') : fmtDuration(t, e.minutes)}</span>
                <button type="button" className="grid size-7 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" onClick={() => setEdit(e)} aria-label={t('time.page.edit')}>
                  <Pencil className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <Link to={`/admin/time?caseId=${caseId}`} className="inline-block text-xs font-semibold text-link hover:underline">
            {t('time.panel.openAll')}
          </Link>
        </div>
      )}
      {edit && <EntryDialog entry={edit === 'new' ? null : edit} caseId={caseId} onClose={() => setEdit(null)} />}
    </Panel>
  );
}
