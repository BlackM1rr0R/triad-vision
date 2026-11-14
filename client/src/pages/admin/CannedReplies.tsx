import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Lock, MessageSquareText, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesStaffDesk } from '@/i18n/pagesStaffDesk';
import { usePageTitle } from '@/lib/usePageTitle';
import { Chip, EmptyState, ErrorBlock, ListSkeleton, PageHead, Panel } from '@/components/admin/ui';
import { fmtRelative, toastError } from '@/components/admin/labels';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { confirmDialog } from '@/components/ui/ConfirmHost';
import { cannedApi, refreshCanned, useCannedReplies, type CannedInput, type CannedReply } from '@/components/staffDesk/api';

registerCopy(pagesStaffDesk);

type Lang = 'az' | 'de' | 'en' | 'ru';
const LANGS: Lang[] = ['az', 'de', 'en', 'ru'];
type Scope = 'all' | 'mine' | 'team';

/** Sample values for the preview (the composer fills the real ones). */
const SAMPLE: Record<string, string> = {
  firstName: 'Leyla',
  lastName: 'Məmmədova',
  fullName: 'Leyla Məmmədova',
  caseNumber: 'TV-2026-0142',
  caseStatus: 'səfirlik görüşü təyin olunub',
  profession: 'Tibb bacısı',
  appointmentDate: '3 dekabr 2026',
  appointmentTime: '10:30',
  appointmentPlace: 'Almaniya səfirliyi, Bakı',
  staffName: 'Nigar Əliyeva',
  staffFirstName: 'Nigar',
  today: '14 noyabr 2026',
};
const fill = (text: string) => text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (all, k: string) => SAMPLE[k] ?? all);

/** Admin → Ünsiyyət → Hazır cavablar: personal replies (everyone) and team replies (ADMIN+), per client language. */
export default function AdminCannedReplies() {
  const { t } = useTranslation();
  usePageTitle(t('sd.canned.title'));
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useCannedReplies();
  const [scope, setScope] = useState<Scope>('all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<CannedReply | 'new' | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => cannedApi.remove(id),
    onSuccess: () => {
      toast.success(t('sd.canned.deleted'));
      refreshCanned(qc);
    },
    onError: (e) => toastError(e),
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    return (data?.replies ?? []).filter(
      (r) =>
        (scope === 'all' || (scope === 'mine' ? !r.shared && r.mine : r.shared)) &&
        (!needle || r.name.toLocaleLowerCase().includes(needle) || (r.shortcut ?? '').includes(needle) || r.body.toLocaleLowerCase().includes(needle)),
    );
  }, [data, scope, q]);
  const counts = useMemo(() => {
    const all = data?.replies ?? [];
    return { all: all.length, mine: all.filter((r) => !r.shared && r.mine).length, team: all.filter((r) => r.shared).length };
  }, [data]);

  return (
    <div className="space-y-5">
      <PageHead
        title={t('sd.canned.title')}
        subtitle={t('sd.canned.subtitle')}
        actions={
          <Button icon={Plus} onClick={() => setEdit('new')}>
            {t('sd.canned.new')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'mine', 'team'] as const).map((s) => (
          <Chip key={s} active={scope === s} onClick={() => setScope(s)} count={counts[s]}>
            {t(`sd.canned.scope.${s}`)}
          </Chip>
        ))}
        <label className="relative ml-auto w-full sm:w-72">
          <span className="sr-only">{t('sd.canned.search')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('sd.canned.search')} type="search" />
        </label>
      </div>

      <p className="rounded-lg border border-line bg-surface/60 px-3 py-2 text-xs text-muted">{t('sd.canned.howto', { v1: '{{firstName}}', v2: '{{caseNumber}}', v3: '{{appointmentDate}}' })}</p>

      {isLoading ? (
        <ListSkeleton rows={5} cols={3} />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : !rows.length ? (
        <EmptyState icon={MessageSquareText} title={t('sd.canned.empty')} text={t('sd.canned.emptyText')} action={<Button icon={Plus} onClick={() => setEdit('new')}>{t('sd.canned.new')}</Button>} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 truncate font-semibold text-ink">{r.name}</h3>
                {r.shortcut && <span className="code-id text-xs text-link">/{r.shortcut}</span>}
                <span className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-muted uppercase">{r.lang ?? t('sd.canned.anyLang')}</span>
                <span className={clsx('ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', r.shared ? 'bg-primary/[0.08] text-link' : 'bg-sunken text-muted')}>
                  {r.shared ? <Users className="size-3" aria-hidden /> : <Lock className="size-3" aria-hidden />}
                  {r.shared ? t('sd.canned.team') : t('sd.canned.personal')}
                </span>
              </div>
              <p className="mt-2 line-clamp-4 flex-1 text-sm whitespace-pre-line text-ink/80">{r.body}</p>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
                <span className="truncate">
                  {r.author ?? '—'} · {fmtRelative(r.updatedAt)}
                  {r.fromMail && ` · ${t('sd.canned.fromMail')}`}
                </span>
                {r.canEdit && (
                  <span className="ml-auto flex shrink-0 gap-1">
                    <button type="button" className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 font-semibold text-link hover:bg-primary/[0.06]" onClick={() => setEdit(r)}>
                      <Pencil className="size-3.5" aria-hidden /> {t('sd.canned.edit')}
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 font-semibold text-danger-fg hover:bg-danger-bg"
                      onClick={async () => {
                        if (await confirmDialog({ message: t('sd.canned.confirmDelete', { name: r.name }) })) remove.mutate(r.id);
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden /> <span className="sr-only sm:not-sr-only">{t('sd.canned.delete')}</span>
                    </button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && (
        <Panel title={t('sd.canned.varsTitle')} icon={MessageSquareText}>
          <ul className="flex flex-wrap gap-1.5">
            {data.variables.map((v) => (
              <li key={v} className="rounded-md bg-sunken px-2 py-1 text-xs">
                <code className="text-link">{`{{${v}}}`}</code> <span className="text-muted">— {t(`sd.canned.vars.${v}`, { defaultValue: v })}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {edit && <ReplyDialog reply={edit === 'new' ? null : edit} canTeam={!!data?.canManageTeam} variables={data?.variables ?? []} onClose={() => setEdit(null)} />}
    </div>
  );
}

const ReplyDialog = ({ reply, canTeam, variables, onClose }: { reply: CannedReply | null; canTeam: boolean; variables: string[]; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<CannedInput>({ name: reply?.name ?? '', text: reply?.body ?? '', shortcut: reply?.shortcut ?? '', lang: reply?.lang ?? null, shared: reply?.shared ?? false });
  const area = useRef<HTMLTextAreaElement>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, shortcut: form.shortcut?.trim() || null };
      return reply ? cannedApi.update(reply.id, body) : cannedApi.create(body);
    },
    onSuccess: () => {
      toast.success(t('sd.canned.saved'));
      refreshCanned(qc);
      onClose();
    },
    onError: (e) => toastError(e),
  });
  const insertVar = (v: string) => {
    const el = area.current;
    const token = `{{${v}}}`;
    const start = el?.selectionStart ?? form.text.length;
    const end = el?.selectionEnd ?? start;
    setForm((f) => ({ ...f, text: f.text.slice(0, start) + token + f.text.slice(end) }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      busy={save.isPending}
      title={reply ? t('sd.canned.editTitle') : t('sd.canned.newTitle')}
      size="lg"
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('sd.common.cancel')}
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!form.name.trim() || !form.text.trim()}>
            {t('sd.common.save')}
          </Button>
        </>
      }
      bodyClassName="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="block">
          <span className="label">{t('sd.canned.name')}</span>
          <input className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-autofocus />
        </label>
        <label className="block">
          <span className="label">{t('sd.canned.shortcut')}</span>
          <span className="relative block">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">/</span>
            <input className="input pl-6" maxLength={40} value={form.shortcut ?? ''} placeholder="salam" onChange={(e) => setForm({ ...form, shortcut: e.target.value })} />
          </span>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t('sd.canned.lang')}</span>
          <select className="input" value={form.lang ?? ''} onChange={(e) => setForm({ ...form, lang: (e.target.value || null) as Lang | null })}>
            <option value="">{t('sd.canned.anyLang')}</option>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`sd.langs.${l}`)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-muted">{t('sd.canned.langHint')}</span>
        </label>
        <fieldset className="block">
          <legend className="label">{t('sd.canned.visibility')}</legend>
          <div className="flex gap-2">
            {[false, true].map((shared) => (
              <label key={String(shared)} className={clsx('flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm', form.shared === shared ? 'border-line-strong bg-sunken font-semibold' : 'border-line', shared && !canTeam && 'cursor-not-allowed opacity-50')}>
                <input type="radio" name="canned-visibility" className="size-4" checked={form.shared === shared} disabled={shared && !canTeam} onChange={() => setForm({ ...form, shared })} />
                {shared ? t('sd.canned.team') : t('sd.canned.personal')}
              </label>
            ))}
          </div>
          {!canTeam && <span className="mt-1 block text-[11px] text-muted">{t('sd.canned.teamAdminOnly')}</span>}
        </fieldset>
      </div>
      <label className="block">
        <span className="label">{t('sd.canned.text')}</span>
        <textarea ref={area} className="input min-h-36 resize-y" required maxLength={4000} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
      </label>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-muted">{t('sd.canned.insertVar')}</p>
        <div className="flex flex-wrap gap-1.5">
          {variables.map((v) => (
            <button key={v} type="button" className="rounded-md border border-line px-2 py-1 text-xs text-link hover:border-line-strong" onClick={() => insertVar(v)} title={t(`sd.canned.vars.${v}`, { defaultValue: v })}>
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      </div>
      {form.text.trim() && (
        <div className="rounded-lg border border-line bg-surface/60 p-3">
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('sd.canned.preview')}</p>
          <p className="text-sm whitespace-pre-line text-ink">{fill(form.text)}</p>
        </div>
      )}
    </Modal>
  );
};
