import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bell, Copy, Link2, ListChecks, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesSite } from '@/i18n/pagesSite';
import { currentPushSubscription, disablePush, enablePush, pushSupported } from '@/lib/pwa';

registerCopy(pagesSite);

interface Item {
  caseId: string;
  number: string;
  enabled: boolean;
  hasLink: boolean;
  linkCreatedAt: string | null;
}
const KEY = ['site', 'status-settings'];

const CaseRow = ({ item }: { item: Item }) => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const switchId = useId();
  const [fresh, setFresh] = useState<string | null>(null);
  const update = (next: Item) => qc.setQueryData<Item[]>(KEY, (l) => l?.map((x) => (x.caseId === next.caseId ? next : x)));
  const onError = () => toast.error(t('site.statusSettings.error'));

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => (await api.put<{ item: Item }>(`/site/status/mine/${item.caseId}`, { enabled })).data.item,
    onSuccess: (next) => {
      update(next);
      if (!next.enabled) setFresh(null);
      toast.success(t('site.statusSettings.saved'));
    },
    onError,
  });
  const create = useMutation({
    mutationFn: async () => (await api.post<{ item: Item; path: string }>(`/site/status/mine/${item.caseId}/link`)).data,
    onSuccess: (d) => {
      update(d.item);
      setFresh(`${window.location.origin}${d.path}`);
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: async () => (await api.delete<{ item: Item }>(`/site/status/mine/${item.caseId}/link`)).data.item,
    onSuccess: (next) => {
      update(next);
      setFresh(null);
    },
    onError,
  });
  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      toast.success(t('site.statusSettings.copied'));
    } catch {
      /* the field stays selectable */
    }
  };

  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={switchId} className="min-w-0">
          <span className="block font-semibold text-ink">{item.number}</span>
          <span className="text-sm text-muted">{t('site.statusSettings.enable')}</span>
        </label>
        <input
          id={switchId}
          type="checkbox"
          role="switch"
          className="size-6 shrink-0 accent-primary"
          checked={item.enabled}
          disabled={toggle.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
        />
      </div>
      {item.enabled && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Link2 className="size-4 text-primary" aria-hidden />
            {t('site.statusSettings.family')}
          </p>
          <p className="mt-1 text-sm text-muted">{t('site.statusSettings.familyText')}</p>
          {fresh ? (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <input readOnly value={fresh} onFocus={(e) => e.target.select()} className="input min-w-0 flex-1 font-mono text-xs" aria-label={t('site.statusSettings.family')} />
                <button type="button" onClick={copy} className="btn-primary btn-sm min-h-11 shrink-0">
                  <Copy className="size-4" aria-hidden />
                  {t('site.statusSettings.copy')}
                </button>
              </div>
              <p className="text-xs text-muted">{t('site.statusSettings.once')}</p>
            </div>
          ) : (
            item.hasLink &&
            item.linkCreatedAt && (
              <p className="mt-2 text-xs text-muted">
                {t('site.statusSettings.active', { date: new Date(item.linkCreatedAt).toLocaleDateString(i18n.language) })}
              </p>
            )
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => create.mutate()} disabled={create.isPending} className="btn-ghost btn-sm min-h-10">
              <RefreshCw className="size-4" aria-hidden />
              {item.hasLink ? t('site.statusSettings.rotate') : t('site.statusSettings.create')}
            </button>
            {item.hasLink && (
              <button type="button" onClick={() => revoke.mutate()} disabled={revoke.isPending} className="btn-sm min-h-10 rounded-full px-3.5 font-semibold text-danger-fg hover:bg-danger-bg">
                <Trash2 className="size-4" aria-hidden />
                {t('site.statusSettings.revoke')}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
};

/** Browser notifications on this device (Web Push) — switch next to the status settings. */
const BrowserPush = () => {
  const { t } = useTranslation();
  const [on, setOn] = useState<boolean | null>(null);
  const id = useId();
  useEffect(() => {
    void currentPushSubscription().then((s) => setOn(!!s && Notification.permission === 'granted'));
  }, []);
  if (!pushSupported() || on === null) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line p-4">
      <label htmlFor={id} className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
        <Bell className="size-4 shrink-0 text-primary" aria-hidden />
        {t('site.push.promptTitle')}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="size-6 shrink-0 accent-primary"
        checked={on}
        onChange={async (e) => {
          if (e.target.checked) {
            const r = await enablePush().catch(() => 'unavailable' as const);
            setOn(r === 'enabled');
            if (r === 'denied') toast.error(t('site.push.denied'));
            else if (r === 'unavailable') toast.error(t('site.push.unavailable'));
          } else {
            await disablePush();
            setOn(false);
          }
        }}
      />
    </div>
  );
};

/** Portal → privacy: public status check per case (off by default) and the "for my family" link. */
export const PublicStatusSettings = () => {
  const { t } = useTranslation();
  const headingId = useId();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<{ items: Item[] }>('/site/status/mine')).data.items });
  return (
    <section className="card card-pad" aria-labelledby={headingId}>
      <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold text-ink">
        <ListChecks className="size-5 text-primary" aria-hidden />
        {t('site.statusSettings.title')}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{t('site.statusSettings.intro')}</p>
      {q.data && q.data.length === 0 && <p className="mt-4 text-sm text-muted">{t('site.statusSettings.noCases')}</p>}
      {q.data && q.data.length > 0 && (
        <ul className="mt-4 space-y-3">
          {q.data.map((item) => (
            <CaseRow key={item.caseId} item={item} />
          ))}
        </ul>
      )}
      <BrowserPush />
    </section>
  );
};
