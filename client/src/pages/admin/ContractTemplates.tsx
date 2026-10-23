import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Braces, FileText, Plus, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesContracts } from '@/i18n/pagesContracts';
import { usePageTitle } from '@/lib/usePageTitle';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { fmtDate, toastError } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import {
  CONTRACT_KINDS,
  CONTRACT_LANGS,
  placeholderLabelKey,
  usePlaceholders,
  type ContractKind,
  type ContractTemplate,
  type PlaceholderDef,
  type PlaceholderGroup,
} from '@/components/contracts/shared';

registerCopy(pagesContracts);

const KIND_TONE: Record<ContractKind, string> = {
  WORK: 'bg-brand-100 text-brand-800',
  AUSBILDUNG: 'bg-violet-100 text-violet-800',
  SERVICE: 'bg-emerald-100 text-emerald-800',
};
const GROUP_ORDER: PlaceholderGroup[] = ['input', 'client', 'case', 'company', 'vacancy', 'triad', 'staff', 'date'];
const TOKEN = /\{\{\s*([A-Za-z][A-Za-z0-9_.]*)\s*\}\}/g;

const useTemplates = () =>
  useQuery({
    queryKey: ['contract-templates', 'all'],
    queryFn: async () => (await api.get<{ items: ContractTemplate[] }>('/admin/contract-templates')).data.items,
  });

const Disclaimer = () => {
  const { t } = useTranslation();
  return (
    <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('contractTpl.disclaimer')}
    </p>
  );
};

const TemplateList = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  usePageTitle(t('contractTpl.title'));
  const { data, isLoading, error, refetch } = useTemplates();
  const [kind, setKind] = useState<ContractKind | ''>('');
  const items = (data ?? []).filter((x) => !kind || x.kind === kind);

  return (
    <div>
      <PageHead
        title={t('contractTpl.title')}
        subtitle={t('contractTpl.subtitle')}
        actions={
          canEdit && (
            <Link to="new" className="btn-primary btn-sm">
              <Plus className="size-4" /> {t('contractTpl.new')}
            </Link>
          )
        }
      />
      <Disclaimer />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Chip active={!kind} onClick={() => setKind('')} count={data?.length}>
          {t('contractTpl.allKinds')}
        </Chip>
        {CONTRACT_KINDS.map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)} count={data?.filter((x) => x.kind === k).length}>
            {t(`contractTpl.kinds.${k}`)}
          </Chip>
        ))}
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : !items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={FileText} title={t('contractTpl.empty')}>
            {t('contractTpl.emptyHint')}
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((x) => (
            <li key={x.id}>
              <Link
                to={x.id}
                className={clsx(
                  'flex h-full flex-col rounded-xl border border-line bg-card p-4 transition hover:border-brand-400/60 hover:shadow-[0_8px_24px_-14px_rgba(11,31,68,0.35)]',
                  !x.active && 'opacity-70',
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={clsx('badge', KIND_TONE[x.kind])}>{t(`contractTpl.kinds.${x.kind}`)}</span>
                  <span className="badge bg-surface text-muted uppercase">{x.language}</span>
                  {x.isDefault && <span className="badge bg-warning-bg text-warning-fg">{t('contractTpl.default')}</span>}
                  {!x.active && <span className="badge bg-surface text-muted">{t('contractTpl.inactive')}</span>}
                </div>
                <p className="mt-2 font-semibold break-words text-ink">{x.name}</p>
                <p className="mt-auto pt-3 text-xs text-muted">
                  {t('contractTpl.placeholdersUsed', { count: x.placeholders.length })} · {t('contractTpl.updated', { date: fmtDate(x.updatedAt) })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const PlaceholderPicker = ({ defs, onPick, disabled }: { defs: PlaceholderDef[]; onPick: (key: string) => void; disabled: boolean }) => {
  const { t } = useTranslation();
  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t('contractTpl.pickerHint')}</p>
      <div className="grid gap-4">
        {GROUP_ORDER.map((g) => {
          const list = defs.filter((d) => d.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{t(`contractTpl.groups.${g}`)}</p>
              <ul className="grid gap-1">
                {list.map((d) => (
                  <li key={d.key}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onPick(d.key)}
                      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-line bg-card px-2.5 py-1.5 text-left text-xs transition hover:border-brand-400 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{t(placeholderLabelKey(d.key))}</span>
                        <code className="block truncate text-[10px] text-muted">{`{{${d.key}}}`}</code>
                      </span>
                      {d.input && <span className="badge shrink-0 bg-warning-bg text-warning-fg">{t('contractTpl.inputBadge')}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};

type Draft = Pick<ContractTemplate, 'name' | 'kind' | 'language' | 'body' | 'isDefault' | 'active'>;
const EMPTY: Draft = { name: '', kind: 'WORK', language: 'de', body: '', isDefault: false, active: true };

const TemplateEditor = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  const { data: defs } = usePlaceholders();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['contract-templates', 'one', id],
    queryFn: async () => (await api.get<{ template: ContractTemplate }>(`/admin/contract-templates/${id}`)).data.template,
    enabled: !isNew,
  });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  usePageTitle(isNew ? t('contractTpl.newTitle') : (data?.name ?? t('contractTpl.editTitle')));

  useEffect(() => {
    if (data) setDraft({ name: data.name, kind: data.kind, language: data.language, body: data.body, isDefault: data.isDefault, active: data.active });
  }, [data]);

  const known = useMemo(() => new Set((defs ?? []).map((d) => d.key)), [defs]);
  const unknown = useMemo(() => (defs ? [...new Set([...draft.body.matchAll(TOKEN)].map((m) => m[1]).filter((k) => !known.has(k)))] : []), [draft.body, known, defs]);

  const insert = (key: string) => {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    const body = draft.body.slice(0, start) + token + draft.body.slice(end);
    setDraft((d) => ({ ...d, body }));
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const res = await api.post<{ template: ContractTemplate }>('/admin/contract-templates', draft);
        toast.success(t('contractTpl.created'));
        await qc.invalidateQueries({ queryKey: ['contract-templates'] });
        navigate(`../${res.data.template.id}`, { replace: true });
      } else {
        await api.patch(`/admin/contract-templates/${id}`, draft);
        toast.success(t('contractTpl.saved'));
        await qc.invalidateQueries({ queryKey: ['contract-templates'] });
      }
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/admin/contract-templates/${id}`);
      toast.success(t('contractTpl.deleted'));
      await qc.invalidateQueries({ queryKey: ['contract-templates'] });
      navigate('..', { replace: true });
    } catch (err) {
      toastError(err);
    } finally {
      setDeleting(false);
    }
  };

  if (!isNew && isLoading) return <LoadingBlock />;
  if (!isNew && (error || !data)) return <ErrorBlock error={error} onRetry={() => void refetch()} />;

  const valid = draft.name.trim().length >= 2 && draft.body.trim().length >= 10;

  return (
    <div>
      <Link to=".." relative="path" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
        <ArrowLeft className="size-4" /> {t('contractTpl.back')}
      </Link>
      <PageHead
        title={isNew ? t('contractTpl.newTitle') : t('contractTpl.editTitle')}
        actions={
          canEdit && (
            <>
              {!isNew && (
                <button type="button" className="btn-secondary btn-sm text-danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" /> {t('contractTpl.delete')}
                </button>
              )}
              <button type="button" className="btn-primary btn-sm" disabled={!valid || saving} onClick={() => void save()}>
                {saving ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('contractTpl.save')}
              </button>
            </>
          )
        }
      />
      <Disclaimer />
      {!canEdit && <p className="mb-4 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">{t('contractTpl.readOnly')}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_9rem]">
              <div>
                <label htmlFor="ct-name" className="label">
                  {t('contractTpl.fields.name')}
                </label>
                <input id="ct-name" className="input" maxLength={160} value={draft.name} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="ct-kind" className="label">
                  {t('contractTpl.fields.kind')}
                </label>
                <select id="ct-kind" className="input" value={draft.kind} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as ContractKind }))}>
                  {CONTRACT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`contractTpl.kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ct-lang" className="label">
                  {t('contractTpl.fields.language')}
                </label>
                <select id="ct-lang" className="input" value={draft.language} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}>
                  {CONTRACT_LANGS.map((l) => (
                    <option key={l} value={l}>
                      {t(`contractTpl.languages.${l}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="inline-flex items-center gap-2 text-sm text-ink">
                <Switch checked={draft.isDefault} disabled={!canEdit} label={t('contractTpl.fields.isDefault')} onChange={(v) => setDraft((d) => ({ ...d, isDefault: v }))} />
                {t('contractTpl.fields.isDefault')}
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-ink">
                <Switch checked={draft.active} disabled={!canEdit} label={t('contractTpl.fields.active')} onChange={(v) => setDraft((d) => ({ ...d, active: v }))} />
                {t('contractTpl.fields.active')}
              </label>
            </div>
            <div>
              <label htmlFor="ct-body" className="label">
                {t('contractTpl.fields.body')}
              </label>
              <textarea
                id="ct-body"
                ref={bodyRef}
                className="input min-h-[55vh] font-mono text-[13px] leading-relaxed"
                spellCheck={false}
                value={draft.body}
                readOnly={!canEdit}
                maxLength={200_000}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              />
              <p className="mt-1.5 text-[11px] text-muted">{t('contractTpl.syntax', { braces: '{{…}}' })}</p>
              {unknown.length > 0 && <p className="mt-1 text-xs font-medium text-danger">{t('contractTpl.unknownKeys', { keys: unknown.join(', ') })}</p>}
            </div>
          </div>
        </Panel>
        <Panel title={t('contractTpl.pickerTitle')} icon={Braces} className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <PlaceholderPicker defs={defs ?? []} onPick={insert} disabled={!canEdit} />
        </Panel>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        loading={deleting}
        title={t('contractTpl.deleteTitle')}
        message={t('contractTpl.deleteText', { name: data?.name ?? '' })}
        confirmLabel={t('contractTpl.delete')}
      />
    </div>
  );
};

export default function AdminContractTemplates() {
  return (
    <Routes>
      <Route index element={<TemplateList />} />
      <Route path=":id" element={<TemplateEditor />} />
    </Routes>
  );
}
