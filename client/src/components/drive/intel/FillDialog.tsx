import { useId, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CheckCircle2, CircleAlert, Search, WandSparkles, X } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { driveError } from '../api';
import type { DriveItem } from '../types';
import { fetchFields, fillTemplate, fillTemplateBulk, intelKeys, searchCases, type CaseHit, type FillLang, type TemplateField } from './api';

const LANGS: FillLang[] = ['de', 'az', 'en', 'ru'];

/**
 * "Müştəri məlumatı ilə doldur": pick a case (or several for the bulk mode), see the detected fields —
 * green = filled from the client data, amber = missing (typed here) — and create the filled file, saved in
 * the client's folder (or the current folder).
 */
export default function FillDialog({
  item,
  bulk,
  folderId,
  onClose,
  onCreated,
  onOpenFolder,
}: {
  item: DriveItem;
  bulk: boolean;
  folderId: string | null;
  onClose: () => void;
  onCreated: () => void;
  onOpenFolder?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const ids = { search: useId(), lang: useId() };
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<CaseHit[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [lang, setLang] = useState<FillLang>('de');
  const [target, setTarget] = useState<'client' | 'here'>('client');
  const [busy, setBusy] = useState(false);

  const first = picked[0]?.id ?? '';
  const fields = useQuery({ queryKey: intelKeys.fields(item.id, first, lang), queryFn: () => fetchFields(item.id, first, lang), placeholderData: keepPreviousData });
  const hits = useQuery({ queryKey: ['drive-intel', 'cases', query], queryFn: () => searchCases(query), enabled: query.trim().length >= 2 });

  const info = fields.data;
  const rows: TemplateField[] = info?.fields ?? [];
  const missing = useMemo(() => rows.filter((f) => f.status === 'missing' && !inputs[f.key]?.trim()), [rows, inputs]);
  const canPickMore = bulk || picked.length === 0;

  const pick = (c: CaseHit) => {
    setPicked((p) => (p.some((x) => x.id === c.id) ? p : bulk ? [...p, c].slice(0, 50) : [c]));
    setQuery('');
  };

  const submit = async () => {
    if (!picked.length) return toast.error(t('driveIntel.fill.pickClient'));
    const clean = Object.fromEntries(Object.entries(inputs).filter(([, v]) => v.trim()));
    setBusy(true);
    try {
      if (!bulk) {
        const r = await fillTemplate(item.id, { caseId: picked[0].id, inputs: clean, lang, targetFolderId: target === 'here' && folderId ? folderId : undefined });
        toast.success(t('driveIntel.fill.created', { name: r.name }), {
          description: r.missing.length ? t('driveIntel.fill.stillMissing', { list: r.missing.join(', ') }) : undefined,
          action: onOpenFolder ? { label: t('driveIntel.fill.openFile'), onClick: () => onOpenFolder(r.parentId) } : undefined,
        });
      } else {
        const results = await fillTemplateBulk(item.id, { caseIds: picked.map((p) => p.id), inputs: clean, lang });
        const ok = results.filter((r) => r.ok);
        const failed = results.filter((r) => !r.ok);
        if (ok.length) toast.success(t('driveIntel.fill.createdBulk', { count: ok.length }));
        if (failed.length) toast.error(t('driveIntel.fill.failedBulk', { count: failed.length }), { description: driveError(failed[0].error) });
      }
      onCreated();
      onClose();
    } catch (e) {
      toast.error(driveError(e));
    } finally {
      setBusy(false);
    }
  };

  const reasonText =
    info && !info.supported
      ? info.reason === 'TEMPLATE_NO_FIELDS'
        ? t('driveIntel.fill.noPdfFields')
        : info.reason === 'NOT_A_TEMPLATE'
          ? t('driveIntel.fill.notTemplate')
          : t('driveIntel.fill.noFields')
      : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="inline-flex items-center gap-2">
          <WandSparkles className="size-4 text-brand-600" aria-hidden />
          {bulk ? t('driveIntel.fill.bulkTitle') : t('driveIntel.fill.title')}
        </span>
      }
      description={`${t('driveIntel.fill.template')}: ${item.name}`}
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
            {t('admin.common.close')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={busy || !info?.supported || !picked.length} onClick={() => void submit()}>
            {busy ? <Spinner className="size-3.5" /> : <WandSparkles className="size-3.5" aria-hidden />}
            {busy ? t('driveIntel.fill.creating') : bulk && picked.length > 1 ? t('driveIntel.fill.createN', { count: picked.length }) : t('driveIntel.fill.create')}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Clients */}
        <div>
          <label htmlFor={ids.search} className="label">
            {bulk ? t('driveIntel.fill.clients') : t('driveIntel.fill.client')}
          </label>
          {picked.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {picked.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-1 pl-3 text-sm">
                  <span className="font-semibold text-ink">
                    {c.client.firstName} {c.client.lastName}
                  </span>
                  <span className="text-xs text-muted">{c.number}</span>
                  <button type="button" onClick={() => setPicked((p) => p.filter((x) => x.id !== c.id))} className="grid size-6 place-items-center rounded-full text-muted hover:bg-card hover:text-ink" aria-label={t('driveIntel.fill.remove')}>
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              {bulk && <span className="self-center text-xs text-muted">{t('driveIntel.fill.selected', { count: picked.length })}</span>}
            </div>
          )}
          {canPickMore && (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input id={ids.search} className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('driveIntel.fill.searchCase')} autoComplete="off" />
              </div>
              {!!hits.data?.length && query.trim().length >= 2 && (
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-line bg-card">
                  {hits.data.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface" onClick={() => pick(c)}>
                        <span className="font-semibold text-ink">
                          {c.client.firstName} {c.client.lastName}
                        </span>
                        <span className="text-muted">{c.number}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Fields */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-bold text-ink">{t('driveIntel.fill.fields')}</h3>
            {fields.isFetching && <Spinner className="size-3.5" />}
            <label htmlFor={ids.lang} className="ml-auto text-xs text-muted">
              {t('driveIntel.fill.lang')}
            </label>
            <select id={ids.lang} className="input !w-auto !py-1 !text-xs" value={lang} onChange={(e) => setLang(e.target.value as FillLang)}>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          {fields.isLoading ? (
            <Spinner className="size-5" />
          ) : fields.isError ? (
            <p className="text-sm text-danger">{driveError(fields.error)}</p>
          ) : reasonText ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <p>{reasonText}</p>
              {info?.reason !== 'TEMPLATE_NO_FIELDS' && info?.reason !== 'NOT_A_TEMPLATE' && (
                <p className="mt-2 flex flex-wrap gap-1.5 font-mono text-xs">
                  {['{{client.fullName}}', '[[client.passportNumber]]', '«Ad Soyad»'].map((x) => (
                    <code key={x} className="rounded bg-card px-1.5 py-0.5">
                      {x}
                    </code>
                  ))}
                </p>
              )}
            </div>
          ) : (
            <>
              {!picked.length && <p className="mb-2 text-xs text-muted">{t('driveIntel.fill.previewHint')}</p>}
              <ul className="divide-y divide-line rounded-xl border border-line">
                {rows.map((f) => {
                  const typed = inputs[f.key] ?? '';
                  const filled = f.status === 'filled' || (!!typed.trim() && f.status !== 'known');
                  const needsInput = f.status === 'missing' || f.status === 'optional' || f.status === 'input';
                  return (
                    <li key={f.key} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                      <span className="flex min-w-0 items-center gap-2 sm:w-56 sm:shrink-0">
                        {filled ? (
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                        ) : f.status === 'missing' ? (
                          <CircleAlert className="size-4 shrink-0 text-amber-500" aria-hidden />
                        ) : (
                          <span className="size-4 shrink-0 rounded-full border-2 border-line" aria-hidden />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-xs font-semibold text-ink" title={f.label}>
                            {f.label}
                          </span>
                          {f.label !== f.key && <span className="block truncate text-[11px] text-muted">{f.key}</span>}
                        </span>
                      </span>
                      {f.status === 'filled' && !typed ? (
                        <span className="min-w-0 flex-1 truncate rounded-md bg-emerald-50 px-2 py-1 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">{f.value}</span>
                      ) : needsInput ? (
                        <input
                          className={clsx('input !py-1.5 !text-sm sm:flex-1', f.status === 'missing' && !typed.trim() && 'border-amber-400 ring-1 ring-amber-200')}
                          type={f.key === 'startDate' ? 'date' : 'text'}
                          placeholder={f.status === 'optional' ? t('driveIntel.fill.optional') : t('driveIntel.fill.typeValue')}
                          value={typed}
                          onChange={(e) => setInputs((s) => ({ ...s, [f.key]: e.target.value }))}
                          aria-label={f.label}
                        />
                      ) : (
                        <span className="text-xs text-muted">{t('driveIntel.fill.known')}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {picked.length > 0 && missing.length > 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t('driveIntel.fill.stillMissing', { list: missing.map((m) => m.label).join(', ') })}</p>}
            </>
          )}
        </div>

        {/* Target */}
        {!bulk && folderId && info?.supported && (
          <fieldset>
            <legend className="label">{t('driveIntel.fill.target')}</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="radio" className="accent-brand-600" checked={target === 'client'} onChange={() => setTarget('client')} />
                {t('driveIntel.fill.targetClient')}
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" className="accent-brand-600" checked={target === 'here'} onChange={() => setTarget('here')} />
                {t('driveIntel.fill.targetHere')}
              </label>
            </div>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
