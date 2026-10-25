import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, CheckCircle2, Download, Eye, FileText, Pencil, Play, Search, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesOfficialForms } from '@/i18n/pagesOfficialForms';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { TONE_CLASS } from '@/components/ui/status';
import { Spinner } from '@/components/ui/Spinner';
import {
  openPdfBlob,
  toastFormError,
  type Catalogue,
  type FieldMap,
  type FieldMapping,
  type FilledRow,
  type MissingEntry,
  type PdfField,
  type Template,
  type TemplateDetail,
  type ValueFormat,
} from '@/components/officialForms/api';

registerCopy(pagesOfficialForms);

const useCatalogue = () =>
  useQuery({ queryKey: ['official-forms', 'catalog'], queryFn: async () => (await api.get<Catalogue>('/admin/official-forms/catalog')).data, staleTime: 10 * 60_000 });

/** Admin: official fillable PDFs — templates per key + version, field mapping, preview with a sample case. */
export default function AdminOfficialForms() {
  const [params, setParams] = useSearchParams();
  const id = params.get('t');
  return id ? <TemplateEditor id={id} onBack={() => setParams({}, { replace: true })} /> : <TemplateList onEdit={(t) => setParams({ t }, { replace: false })} />;
}

// ─── List ───────────────────────────────────────────────────────────────

interface InstallResult {
  key: string;
  version: string;
  status: 'INSTALLED' | 'EXISTS' | 'FAILED';
  reason?: string;
  dropped?: string[];
}

const TemplateList = ({ onEdit }: { onEdit: (id: string) => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  usePageTitle(t('officialForms.page.title'));
  const key = ['official-forms', 'templates'];
  const { data, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: async () => (await api.get<{ items: Template[] }>('/admin/official-forms/templates')).data.items });
  const [results, setResults] = useState<InstallResult[] | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Template | null>(null);

  const install = useMutation({
    mutationFn: async () => (await api.post<{ results: InstallResult[]; items: Template[] }>('/admin/official-forms/templates/install-defaults')).data,
    onSuccess: (d) => {
      setResults(d.results);
      qc.setQueryData(key, d.items);
    },
    onError: toastFormError,
  });
  const activate = useMutation({
    mutationFn: async (id: string) => (await api.post<{ items: Template[] }>(`/admin/official-forms/templates/${id}/activate`)).data.items,
    onSuccess: (items) => {
      qc.setQueryData(key, items);
      toast.success(t('officialForms.page.activated'));
    },
    onError: toastFormError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete<{ deleted: boolean }>(`/admin/official-forms/templates/${id}`)).data,
    onSuccess: (d) => {
      toast.success(t(d.deleted ? 'officialForms.page.deleted' : 'officialForms.page.deactivated'));
      setToDelete(null);
      void refetch();
    },
    onError: toastFormError,
  });

  const groups = useMemo(() => {
    const m = new Map<string, Template[]>();
    for (const tpl of data ?? []) m.set(tpl.key, [...(m.get(tpl.key) ?? []), tpl]);
    return [...m.entries()];
  }, [data]);

  return (
    <div className="stack-page">
      <PageHead
        title={t('officialForms.page.title')}
        subtitle={t('officialForms.page.subtitle')}
        actions={
          isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => install.mutate()} disabled={install.isPending} title={t('officialForms.page.installHint')}>
                {install.isPending ? <Spinner className="size-4" /> : <Wand2 className="size-4" aria-hidden />}
                {t('officialForms.page.install')}
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
                <Upload className="size-4" aria-hidden />
                {t('officialForms.page.upload')}
              </button>
            </div>
          )
        }
      />
      {!isAdmin && <p className="text-xs text-muted">{t('officialForms.page.readOnly')}</p>}
      {results && (
        <div className="rounded-xl border border-line bg-card p-4 text-sm" role="status">
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-2">
                <span className={clsx('badge', r.status === 'FAILED' ? TONE_CLASS.danger : r.status === 'INSTALLED' ? TONE_CLASS.success : TONE_CLASS.neutral)}>{t(`officialForms.page.installResult.${r.status}`)}</span>
                <span className="font-medium text-ink">{r.key}</span>
                <span className="text-xs text-muted">{r.version}</span>
                {r.reason && <span className="text-xs text-danger-fg">{r.reason}</span>}
                {!!r.dropped?.length && <span className="text-xs text-muted">{t('officialForms.editor.dropped', { fields: r.dropped.join(', ') })}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !groups.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={FileText} title={t('officialForms.page.empty')}>
            {t('officialForms.page.emptyHint')}
          </EmptyState>
        </div>
      ) : (
        groups.map(([k, versions]) => (
          <Panel key={k} title={versions.find((v) => v.active)?.title ?? versions[0].title} icon={FileText} actions={<span className="code-id text-xs text-muted">{k}</span>} bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-[1_1_14rem]">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{v.version}</span>
                      <span className={clsx('badge', v.active ? TONE_CLASS.success : TONE_CLASS.neutral)}>{t(v.active ? 'officialForms.page.active' : 'officialForms.page.inactive')}</span>
                      {v.builtIn && <span className={clsx('badge', TONE_CLASS.brand)}>{t('officialForms.page.builtIn')}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {t('officialForms.page.mapped', { count: v.mapped })} · {t('officialForms.page.fills', { count: v.fills ?? 0 })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className="btn-secondary btn-sm" onClick={() => onEdit(v.id)}>
                      <Pencil className="size-3.5" aria-hidden />
                      {t('officialForms.page.edit')}
                    </button>
                    <a className="btn-secondary btn-sm" href={`/api/admin/official-forms/templates/${v.id}/file`} target="_blank" rel="noreferrer">
                      <Eye className="size-3.5" aria-hidden />
                      {t('officialForms.page.blank')}
                    </a>
                    {isAdmin && !v.active && (
                      <button type="button" className="btn-secondary btn-sm" onClick={() => activate.mutate(v.id)} disabled={activate.isPending}>
                        <CheckCircle2 className="size-3.5" aria-hidden />
                        {t('officialForms.page.activate')}
                      </button>
                    )}
                    {isAdmin && (
                      <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setToDelete(v)} aria-label={t('officialForms.page.delete')}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ))
      )}
      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onCreated={(id) => {
            setUploadOpen(false);
            void qc.invalidateQueries({ queryKey: key });
            onEdit(id);
          }}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title={t('officialForms.page.delete')}
        message={t('officialForms.page.deleteConfirm')}
        danger
        busy={remove.isPending}
      />
    </div>
  );
};

const UploadDialog = ({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({ key: '', title: '', version: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('key', form.key.trim().toUpperCase());
      fd.append('title', form.title.trim());
      fd.append('version', form.version.trim());
      if (form.notes.trim()) fd.append('notes', form.notes.trim());
      fd.append('file', file!);
      return (await api.post<TemplateDetail>('/admin/official-forms/templates', fd)).data;
    },
    onSuccess: (d) => {
      toast.success(t('officialForms.page.created'));
      onCreated(d.template.id);
    },
    onError: toastFormError,
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (file) create.mutate();
  };
  const valid = /^[A-Za-z][A-Za-z0-9_]{1,59}$/.test(form.key.trim()) && form.title.trim().length >= 2 && !!form.version.trim() && !!file;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('officialForms.page.uploadTitle')}
      as="form"
      onSubmit={submit}
      busy={create.isPending}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('admin.common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button type="submit" className="btn-primary" disabled={!valid || create.isPending}>
            {t('officialForms.page.create')}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="of-key">
            {t('officialForms.page.key')}
          </label>
          <input id="of-key" className="input font-mono uppercase" value={form.key} maxLength={60} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} placeholder="NATIONAL_VISA" />
          <p className="mt-1 text-xs text-muted">{t('officialForms.page.keyHint')}</p>
        </div>
        <div>
          <label className="label" htmlFor="of-version">
            {t('officialForms.page.version')}
          </label>
          <input id="of-version" className="input" value={form.version} maxLength={40} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="2026-01" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="of-title">
            {t('officialForms.page.titleField')}
          </label>
          <input id="of-title" className="input" value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="of-file">
            {t('officialForms.page.file')}
          </label>
          <input id="of-file" type="file" accept="application/pdf" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="of-notes">
            {t('officialForms.page.notes')}
          </label>
          <textarea id="of-notes" rows={2} className="input" maxLength={4000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
};

// ─── Editor ─────────────────────────────────────────────────────────────

const mapToText = (m: Record<string, string> | undefined) => (m ? Object.entries(m).map(([k, v]) => `${k}=${v}`).join('\n') : '');
const textToMap = (s: string) => {
  const out: Record<string, string> = {};
  for (const line of s.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return Object.keys(out).length ? out : undefined;
};

type Filter = 'all' | 'mapped' | 'unmapped';

const TemplateEditor = ({ id, onBack }: { id: string; onBack: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  const cat = useCatalogue();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['official-forms', 'template', id], queryFn: async () => (await api.get<TemplateDetail>(`/admin/official-forms/templates/${id}`)).data });
  usePageTitle(data?.template.title ?? t('officialForms.page.title'));
  const [draft, setDraft] = useState<FieldMap | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const map = draft ?? data?.fieldMap ?? {};
  const dirty = !!draft;

  const save = useMutation({
    mutationFn: async () => (await api.put<{ fieldMap: FieldMap; dropped: string[] }>(`/admin/official-forms/templates/${id}`, { fieldMap: map })).data,
    onSuccess: (d) => {
      toast.success(t('officialForms.editor.saved'));
      if (d.dropped.length) toast.message(t('officialForms.editor.dropped', { fields: d.dropped.join(', ') }));
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['official-forms'] });
    },
    onError: toastFormError,
  });

  const setField = (name: string, m: FieldMapping | null) => {
    const next = { ...map };
    if (m) next[name] = m;
    else delete next[name];
    setDraft(next);
  };

  const suggest = () => {
    const s = data?.suggestions ?? {};
    const add = Object.entries(s).filter(([k]) => !map[k]);
    if (!add.length) return toast.message(t('officialForms.editor.suggestNone'));
    setDraft({ ...map, ...Object.fromEntries(add) });
    toast.success(t('officialForms.editor.suggestApplied', { count: add.length }));
  };

  if (isLoading || cat.isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  const keys = cat.data?.keys ?? [];
  const groups = cat.data?.groups ?? [];
  const fillable = data.fields.filter((f) => !['signature', 'button', 'unknown'].includes(f.type));
  const shown = fillable.filter((f) => (filter === 'mapped' ? !!map[f.name] : filter === 'unmapped' ? !map[f.name] : true)).filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack-page">
      <button type="button" className="btn-secondary btn-sm w-fit" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden />
        {t('officialForms.editor.back')}
      </button>
      <PageHead
        title={data.template.title}
        subtitle={`${data.template.key} · ${data.template.version} · ${t('officialForms.page.mapped', { count: Object.keys(map).length })}`}
        actions={
          isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={suggest}>
                <Sparkles className="size-4" aria-hidden />
                {t('officialForms.editor.suggest')}
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                {t('officialForms.editor.save')}
              </button>
            </div>
          )
        }
      />
      {dirty && <p className="text-xs font-medium text-warning-fg">{t('officialForms.editor.unsaved')}</p>}
      <PreviewPanel templateId={id} fieldMap={dirty ? map : undefined} />
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'mapped', 'unmapped'] as Filter[]).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)} count={f === 'all' ? fillable.length : f === 'mapped' ? fillable.filter((x) => map[x.name]).length : fillable.filter((x) => !map[x.name]).length}>
            {t(`officialForms.editor.filter${f[0].toUpperCase()}${f.slice(1)}`)}
          </Chip>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('officialForms.editor.search')} aria-label={t('officialForms.editor.search')} />
        </div>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {shown.map((f) => (
          <FieldRow key={f.name} field={f} mapping={map[f.name] ?? null} keys={keys} groups={groups} tr={tr} disabled={!isAdmin} onChange={(m) => setField(f.name, m)} />
        ))}
      </ul>
    </div>
  );
};

const FieldRow = ({
  field,
  mapping,
  keys,
  groups,
  tr,
  disabled,
  onChange,
}: {
  field: PdfField;
  mapping: FieldMapping | null;
  keys: Catalogue['keys'];
  groups: Catalogue['groups'];
  tr: (v: Catalogue['groups'][number]['label']) => string;
  disabled: boolean;
  onChange: (m: FieldMapping | null) => void;
}) => {
  const { t } = useTranslation();
  const def = keys.find((k) => k.key === mapping?.source);
  const patch = (p: Partial<FieldMapping>) => onChange({ ...(mapping ?? { source: 'const' }), ...p });
  const choice = field.type === 'checkbox' || field.type === 'radio' || field.type === 'dropdown' || field.type === 'optionlist';
  return (
    <li className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="font-medium break-words text-ink">{field.name}</p>
        <p className="text-xs text-muted">
          {t(`officialForms.types.${field.type}`)}
          {field.page !== null ? ` · ${t('officialForms.editor.page', { page: field.page + 1 })}` : ''}
        </p>
        {field.options.length > 0 && (
          <p className="mt-1 text-[11px] break-words text-muted">
            {t('officialForms.editor.options')}: {field.options.join(' · ')}
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className="input"
          aria-label={t('officialForms.editor.source')}
          value={mapping?.source ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) onChange(null);
            else onChange({ ...(mapping ?? {}), source: v, ...(v === 'const' ? { value: mapping?.value ?? '' } : { value: undefined }) });
          }}
        >
          <option value="">{t('officialForms.editor.none')}</option>
          <option value="const">{t('officialForms.editor.const')}</option>
          {groups.map((g) => (
            <optgroup key={g.key} label={tr(g.label)}>
              {keys
                .filter((k) => k.group === g.key)
                .map((k) => (
                  <option key={k.key} value={k.key}>
                    {tr(k.label)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {mapping && mapping.source === 'const' && (
          <input className="input" aria-label={t('officialForms.editor.constValue')} placeholder={t('officialForms.editor.constValue')} value={mapping.value ?? ''} disabled={disabled} onChange={(e) => patch({ value: e.target.value })} />
        )}
        {mapping && field.type === 'text' && mapping.source !== 'const' && (
          <select className="input" aria-label={t('officialForms.editor.format')} value={mapping.format ?? 'none'} disabled={disabled} onChange={(e) => patch({ format: e.target.value === 'none' ? undefined : (e.target.value as ValueFormat) })}>
            {(['none', 'date', 'dateIso', 'monthYear', 'upper', 'lower', 'money'] as ValueFormat[]).map((fm) => (
              <option key={fm} value={fm}>
                {t(`officialForms.formats.${fm}`)}
              </option>
            ))}
          </select>
        )}
        {mapping && field.type === 'checkbox' && (
          <div>
            <input className="input" aria-label={t('officialForms.editor.when')} placeholder={t('officialForms.editor.when')} value={mapping.when ?? ''} disabled={disabled} onChange={(e) => patch({ when: e.target.value || undefined })} />
            <p className="mt-1 text-[11px] text-muted">
              {t('officialForms.editor.whenHint')}
              {def?.codes ? ` (${def.codes.join(', ')})` : ''}
            </p>
          </div>
        )}
        {mapping && mapping.source !== 'const' && (choice || def?.kind === 'code') && field.type !== 'checkbox' && (
          <div className="sm:col-span-2">
            <textarea
              rows={2}
              className="input code-id text-xs"
              aria-label={t('officialForms.editor.map')}
              placeholder={def?.codes ? def.codes.map((c) => `${c}=${field.options[0] ?? '…'}`).join('\n') : t('officialForms.editor.mapHint')}
              defaultValue={mapToText(mapping.map)}
              disabled={disabled}
              onBlur={(e) => patch({ map: textToMap(e.target.value) })}
            />
            <p className="mt-1 text-[11px] text-muted">{t('officialForms.editor.mapHint')}</p>
          </div>
        )}
        {mapping && mapping.source !== 'const' && (
          <label className="flex items-center gap-2 text-xs text-ink/80">
            <input type="checkbox" checked={!!mapping.optional} disabled={disabled} onChange={(e) => patch({ optional: e.target.checked || undefined })} />
            {t('officialForms.editor.optional')}
          </label>
        )}
      </div>
    </li>
  );
};

// ─── Preview ────────────────────────────────────────────────────────────

interface SampleCase {
  id: string;
  number: string;
  clientName: string;
  companyName: string | null;
}

const PreviewPanel = ({ templateId, fieldMap }: { templateId: string; fieldMap?: FieldMap }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const [q, setQ] = useState('');
  const [caseId, setCaseId] = useState('');
  const cases = useQuery({
    queryKey: ['official-forms', 'sample-cases', q],
    queryFn: async () => (await api.get<{ items: SampleCase[] }>('/admin/official-forms/sample-cases', { params: { q } })).data.items,
  });
  const run = useMutation({
    mutationFn: async () => (await api.post<{ rows: FilledRow[]; missing: MissingEntry[]; caseNumber: string }>(`/admin/official-forms/templates/${templateId}/preview`, { caseId, fieldMap })).data,
    onError: toastFormError,
  });
  const pdf = useMutation({
    mutationFn: async () => (await api.post<Blob>(`/admin/official-forms/templates/${templateId}/preview.pdf`, { caseId, fieldMap }, { responseType: 'blob' })).data,
    onSuccess: openPdfBlob,
    onError: toastFormError,
  });
  return (
    <Panel title={t('officialForms.editor.preview')} icon={Play}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="of-prev-q">
            {t('officialForms.editor.previewCase')}
          </label>
          <input id="of-prev-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('officialForms.editor.previewSearch')} />
        </div>
        <select className="input" aria-label={t('officialForms.editor.previewCase')} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
          <option value="">—</option>
          {(cases.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.number} · {c.clientName}
              {c.companyName ? ` · ${c.companyName}` : ''}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary btn-sm" disabled={!caseId || run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? <Spinner className="size-4" /> : <Play className="size-4" aria-hidden />}
          {t('officialForms.editor.previewRun')}
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={!caseId || pdf.isPending} onClick={() => pdf.mutate()}>
          <Download className="size-4" aria-hidden />
          {t('officialForms.editor.previewPdf')}
        </button>
      </div>
      {run.data && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t('officialForms.editor.previewMissing')}</h3>
            {run.data.missing.length ? (
              <ul className="space-y-1 text-xs">
                {run.data.missing.map((m) => (
                  <li key={m.source} className={clsx('rounded-md px-2 py-1', TONE_CLASS.warning)}>
                    {m.label ? tr(m.label) : m.source} <span className="opacity-70">({m.fields.length})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={clsx('rounded-md px-2 py-1 text-xs', TONE_CLASS.success)}>{t('officialForms.editor.previewNoMissing')}</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t('officialForms.editor.previewValues')}</h3>
            <dl className="max-h-72 space-y-1 overflow-auto text-xs">
              {run.data.rows
                .filter((r) => r.value)
                .map((r) => (
                  <div key={r.field} className="flex gap-2">
                    <dt className="w-1/2 shrink-0 truncate text-muted" title={r.field}>
                      {r.field}
                    </dt>
                    <dd className="min-w-0 break-words text-ink">{r.type === 'checkbox' ? '☑' : r.value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      )}
    </Panel>
  );
};
