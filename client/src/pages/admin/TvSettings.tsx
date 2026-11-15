import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { ArrowDown, ArrowUp, Copy, ExternalLink, MonitorPlay, Plus, Tv } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Checkbox, Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Switch } from '@/components/ui/Switch';
import { registerCopy } from '@/i18n';
import { pagesTvDisplay } from '@/i18n/pagesTvDisplay';
import { api, errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import type { TvPanelKey, TvSettings as Settings } from '@/lib/tvDisplay';

registerCopy(pagesTvDisplay);

/** Admin → TV mode (/admin/tv-settings, ADMIN+): display tokens (create with URL + QR, revoke, last seen) and the TV settings. */

interface TokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastSeenAt: string | null;
  lastSeenIp: string | null;
  revokedAt: string | null;
  active: boolean;
}
interface Overview {
  settings: Settings;
  panels: TvPanelKey[];
  tokens: TokenRow[];
}

const fmt = (iso: string | null, lang: string) =>
  iso ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baku' }).format(new Date(iso)) : null;

export default function TvSettings() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('tvd.title'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tv-display'], queryFn: async () => (await api.get<Overview>('/admin/tv-display')).data });

  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ url: string; qr: string } | null>(null);
  const [revoking, setRevoking] = useState<TokenRow | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  useEffect(() => {
    if (q.data && !draft) setDraft(q.data.settings);
  }, [q.data, draft]);

  const create = useMutation({
    mutationFn: async () => (await api.post<{ url: string }>('/admin/tv-display/tokens', { name: name.trim() })).data,
    onSuccess: async (res) => {
      const qr = await QRCode.toString(res.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1f44', light: '#ffffff' } });
      setCreated({ url: res.url, qr });
      setName('');
      void qc.invalidateQueries({ queryKey: ['tv-display'] });
    },
    onError: (e) => toast.error(`${t('tvd.error')} (${errorCode(e)})`),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/tv-display/tokens/${id}`),
    onSuccess: () => {
      toast.success(t('tvd.revokedToast'));
      setRevoking(null);
      void qc.invalidateQueries({ queryKey: ['tv-display'] });
    },
    onError: (e) => toast.error(`${t('tvd.error')} (${errorCode(e)})`),
  });

  const save = useMutation({
    mutationFn: async (s: Settings) => (await api.put<{ settings: Settings }>('/admin/tv-display/settings', s)).data.settings,
    onSuccess: (s) => {
      setDraft(s);
      toast.success(t('tvd.saved'));
      void qc.invalidateQueries({ queryKey: ['tv-display'] });
    },
    onError: (e) => toast.error(`${t('tvd.error')} (${errorCode(e)})`),
  });

  const all = q.data?.panels ?? [];
  // Chosen panels in their order, then the switched-off ones.
  const ordered = draft ? [...draft.panels, ...all.filter((p) => !draft.panels.includes(p))] : [];
  const toggle = (p: TvPanelKey, on: boolean) => draft && setDraft({ ...draft, panels: on ? [...draft.panels, p] : draft.panels.filter((x) => x !== p) });
  const move = (p: TvPanelKey, dir: -1 | 1) => {
    if (!draft) return;
    const list = [...draft.panels];
    const i = list.indexOf(p);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setDraft({ ...draft, panels: list });
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('tvd.title')}
        subtitle={t('tvd.subtitle')}
        actions={
          <a href="/admin/tv" target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-subtle">
            <MonitorPlay className="h-4 w-4" aria-hidden />
            {t('tvd.openPreview')}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        }
      />

      <Card title={t('tvd.tokens')} subtitle={t('tvd.tokensHint')} icon={Tv}>
        <form onSubmit={onCreate} className="mb-5 flex flex-wrap items-end gap-3">
          <Field label={t('tvd.name')} className="min-w-[16rem] flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('tvd.namePlaceholder')} />
          </Field>
          <Button type="submit" icon={Plus} loading={create.isPending} disabled={!name.trim()}>
            {t('tvd.create')}
          </Button>
        </form>
        {q.data && q.data.tokens.length === 0 ? (
          <p className="text-sm text-muted">{t('tvd.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">{t('tvd.cols.name')}</th>
                  <th className="py-2 pr-4">{t('tvd.cols.created')}</th>
                  <th className="py-2 pr-4">{t('tvd.cols.lastSeen')}</th>
                  <th className="py-2 pr-4">{t('tvd.cols.status')}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {(q.data?.tokens ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-ink">{row.name}</div>
                      <div className="font-mono text-xs text-muted">{row.tokenPrefix}…</div>
                    </td>
                    <td className="py-2 pr-4 text-muted">{fmt(row.createdAt, i18n.language)}</td>
                    <td className="py-2 pr-4 text-muted">
                      {fmt(row.lastSeenAt, i18n.language) ?? t('tvd.never')}
                      {row.lastSeenIp && <div className="font-mono text-xs">{row.lastSeenIp}</div>}
                    </td>
                    <td className="py-2 pr-4">{row.active ? <Badge tone="success">{t('tvd.active')}</Badge> : <Badge tone="neutral">{t('tvd.revokedBadge')}</Badge>}</td>
                    <td className="py-2 text-right">
                      {row.active && (
                        <Button variant="outline" size="sm" onClick={() => setRevoking(row)}>
                          {t('tvd.revoke')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {draft && (
        <Card title={t('tvd.display')} icon={MonitorPlay}>
          <div className="space-y-6">
            <fieldset>
              <legend className="text-sm font-semibold text-ink">{t('tvd.panels')}</legend>
              <p className="mb-3 text-xs text-muted">{t('tvd.panelsHint')}</p>
              <ul className="space-y-2">
                {ordered.map((p) => {
                  const on = draft.panels.includes(p);
                  const idx = draft.panels.indexOf(p);
                  return (
                    <li key={p} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                      <div className="flex-1">
                        <Checkbox label={t(`tvd.panel.${p}`)} checked={on} onChange={(e) => toggle(p, e.target.checked)} />
                      </div>
                      <IconButton icon={ArrowUp} label={t('tvd.up')} size="sm" disabled={!on || idx === 0} onClick={() => move(p, -1)} />
                      <IconButton icon={ArrowDown} label={t('tvd.down')} size="sm" disabled={!on || idx === draft.panels.length - 1} onClick={() => move(p, 1)} />
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-muted">{t('tvd.leaderboardNote')}</p>
            </fieldset>
            <Field label={t('tvd.rotation')} hint={t('tvd.rotationHint')} className="max-w-xs">
              <Input type="number" min={5} max={600} value={draft.rotationSeconds} onChange={(e) => setDraft({ ...draft, rotationSeconds: Number(e.target.value) || 5 })} />
            </Field>
            <Switch checked={draft.celebration} onChange={(v) => setDraft({ ...draft, celebration: v })} label={t('tvd.celebration')} hint={t('tvd.celebrationHint')} showLabel />
            <Switch checked={draft.sound} onChange={(v) => setDraft({ ...draft, sound: v })} label={t('tvd.sound')} hint={t('tvd.soundHint')} showLabel />
            <div>
              <Button onClick={() => save.mutate({ ...draft, rotationSeconds: Math.min(600, Math.max(5, Math.round(draft.rotationSeconds))) })} loading={save.isPending}>
                {t('tvd.save')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title={t('tvd.created')}
        description={t('tvd.createdText')}
        footer={<Button onClick={() => setCreated(null)}>{t('tvd.done')}</Button>}
      >
        {created && (
          <div className="space-y-4">
            <div className="mx-auto w-56 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: created.qr }} />
            <div className="flex items-center gap-2">
              <Input readOnly value={created.url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <IconButton
                icon={Copy}
                label={t('tvd.copy')}
                onClick={() => {
                  void navigator.clipboard?.writeText(created.url).then(() => toast.success(t('tvd.copied')));
                }}
              />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        loading={revoke.isPending}
        title={t('tvd.revokeTitle')}
        message={t('tvd.revokeText', { name: revoking?.name ?? '' })}
        confirmLabel={t('tvd.revoke')}
      />
    </div>
  );
}
