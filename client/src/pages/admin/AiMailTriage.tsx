import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Route, Save, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { aiMailError, aiMailKeys, TRIAGE_CATEGORIES, type StaffOption, type TriageCategory } from '@/components/aiMail/api';
import { CategoryChip } from '@/components/aiMail/TriageChips';

interface TriageSettings {
  enabled: boolean;
  mailboxes: string[];
  routing: Partial<Record<TriageCategory, string | null>>;
  autoLead: boolean;
  notifyAssignee: boolean;
  autoLabel: boolean;
}

interface SettingsResponse {
  settings: TriageSettings;
  staff: StaffOption[];
  mailboxes: { email: string; owners: string[] }[];
}

const Toggle = ({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-sunken p-3">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-ink">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
    <Switch checked={checked} onChange={onChange} label={label} />
  </div>
);

/** /admin/ai/mail-triage (SUPER_ADMIN): which mailboxes are analysed and who gets which category. Click-only. */
export default function AdminAiMailTriage() {
  const { t } = useTranslation();
  usePageTitle(t('aiMail.settings.title'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: aiMailKeys.settings, queryFn: async () => (await api.get<SettingsResponse>('/ai-mail/settings')).data });
  const [form, setForm] = useState<TriageSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (q.data && !form) setForm(q.data.settings);
  }, [q.data, form]);

  if (q.isLoading || (!form && !q.isError)) return <LoadingBlock />;
  if (q.isError || !form || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;

  const set = <K extends keyof TriageSettings>(k: K, v: TriageSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const known = new Map(q.data.mailboxes.map((m) => [m.email, m.owners]));
  const addresses = [...new Set([...form.mailboxes.filter((m) => m.includes('@')), ...q.data.mailboxes.map((m) => m.email)])].sort();
  const toggleMailbox = (email: string, on: boolean) => set('mailboxes', on ? [...new Set([...form.mailboxes, email])] : form.mailboxes.filter((m) => m !== email));

  const save = async () => {
    setSaving(true);
    try {
      const routing = Object.fromEntries(TRIAGE_CATEGORIES.map((c) => [c, form.routing[c] || null]));
      const { data } = await api.put<{ settings: TriageSettings }>('/ai-mail/settings', { ...form, routing });
      setForm(data.settings);
      void qc.invalidateQueries({ queryKey: ['ai-mail'] });
      toast.success(t('aiMail.settings.saved'));
    } catch (err) {
      toast.error(aiMailError(t, err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/admin/ai/settings" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> {t('admin.nav.settings')}
      </Link>
      <PageHead
        title={t('aiMail.settings.title')}
        subtitle={t('aiMail.settings.intro')}
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => void save()} disabled={saving}>
            <Save className="size-3.5" aria-hidden /> {t('aiMail.settings.save')}
          </button>
        }
      />
      <div className="space-y-6">
        <Panel title={t('aiMail.settings.title')} icon={Sparkles}>
          <div className="space-y-3">
            <Toggle label={t('aiMail.settings.enabled')} hint={t('aiMail.settings.enabledHint')} checked={form.enabled} onChange={(v) => set('enabled', v)} />
            <Toggle label={t('aiMail.settings.autoLead')} checked={form.autoLead} onChange={(v) => set('autoLead', v)} />
            <Toggle label={t('aiMail.settings.notifyAssignee')} checked={form.notifyAssignee} onChange={(v) => set('notifyAssignee', v)} />
            <Toggle label={t('aiMail.settings.autoLabel')} checked={form.autoLabel} onChange={(v) => set('autoLabel', v)} />
          </div>
        </Panel>

        <Panel title={t('aiMail.settings.mailboxes')} icon={Mail}>
          <p className="mb-3 text-xs text-muted">{t('aiMail.settings.mailboxesHint')}</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {addresses.map((email) => {
              const owners = known.get(email);
              return (
                <li key={email}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                    <input type="checkbox" className="size-4 accent-primary" checked={form.mailboxes.includes(email)} onChange={(e) => toggleMailbox(email, e.target.checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{email}</span>
                      <span className="block truncate text-xs text-muted">{owners?.length ? t('aiMail.settings.connectedBy', { names: owners.join(', ') }) : t('aiMail.settings.notConnected')}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title={t('aiMail.settings.routing')} icon={Route}>
          <p className="mb-3 text-xs text-muted">{t('aiMail.settings.routingHint')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TRIAGE_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-2 rounded-lg border border-line p-2.5">
                <span className="w-32 shrink-0">
                  <CategoryChip category={c} />
                </span>
                <select
                  className="input min-w-0 flex-1 py-1.5 text-sm"
                  value={form.routing[c] ?? ''}
                  onChange={(e) => set('routing', { ...form.routing, [c]: e.target.value || null })}
                  aria-label={t(`aiMail.category.${c}`)}
                >
                  <option value="">{t('aiMail.settings.nobody')}</option>
                  {q.data!.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
