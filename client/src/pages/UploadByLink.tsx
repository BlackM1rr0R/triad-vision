import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, FileUp, SearchX, ShieldCheck } from 'lucide-react';
import { AxiosError } from 'axios';
import { api, errorCode } from '@/lib/api';
import { useBrand } from '@/lib/brand';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesStaffTools } from '@/i18n/pagesStaffTools';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesStaffTools);

// GET /api/upload-links/:token (server lib/uploadLinks/service.ts publicUploadView)
interface View {
  client: string;
  note: string | null;
  expiresAt: string;
  remainingFiles: number;
  maxFileSize: number;
  accept: string[];
  items: { id: string; title: L10n; description: L10n | null; uploaded: number; accepted: boolean }[];
}

type Load = { kind: 'ok'; view: View } | { kind: 'expired' } | { kind: 'invalid' };

interface ItemResult {
  busy?: boolean;
  names: string[];
  error?: string;
  warn?: boolean;
}

/**
 * Public /upload/:token — login-free upload page of a staff "request documents via link". Shows only the client's
 * initials and the requested items; each file goes straight into the case (server checks type, bytes, size).
 */
export default function UploadByLink() {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const { tr, dateTime } = useL10n();
  const brand = useBrand();
  const qc = useQueryClient();
  const p = (k: string, o?: Record<string, unknown>) => String(t(`staffTools.uploadPage.${k}`, o));
  usePageTitle(p('title'));
  const [results, setResults] = useState<Record<string, ItemResult>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const q = useQuery({
    queryKey: ['upload-link', token],
    retry: false,
    queryFn: async (): Promise<Load> => {
      try {
        return { kind: 'ok', view: (await api.get<View>(`/upload-links/${encodeURIComponent(token)}`)).data };
      } catch (err) {
        return err instanceof AxiosError && err.response?.status === 410 ? { kind: 'expired' } : { kind: 'invalid' };
      }
    },
  });

  const upload = async (itemId: string, file: File) => {
    const view = q.data?.kind === 'ok' ? q.data.view : null;
    if (view && file.size > view.maxFileSize) {
      setResults((r) => ({ ...r, [itemId]: { names: r[itemId]?.names ?? [], error: p('errors.FILE_TOO_LARGE') } }));
      return;
    }
    setResults((r) => ({ ...r, [itemId]: { names: r[itemId]?.names ?? [], busy: true } }));
    const fd = new FormData();
    fd.append('requirementId', itemId);
    fd.append('file', file);
    try {
      const res = await api.post<{ quality: { level: string } | null; checks: { level: string } | null }>(`/upload-links/${encodeURIComponent(token)}/files`, fd);
      const warn = res.data.quality?.level === 'BAD' || res.data.checks?.level === 'error';
      setResults((r) => ({ ...r, [itemId]: { names: [...(r[itemId]?.names ?? []), file.name], warn } }));
      void qc.invalidateQueries({ queryKey: ['upload-link', token] });
    } catch (err) {
      const code = errorCode(err);
      const known = ['UNSUPPORTED_FILE_TYPE', 'FILE_CONTENT_MISMATCH', 'FILE_TOO_LARGE', 'TOO_MANY_REQUESTS'];
      if (err instanceof AxiosError && err.response?.status === 410) void qc.invalidateQueries({ queryKey: ['upload-link', token] });
      setResults((r) => ({ ...r, [itemId]: { names: r[itemId]?.names ?? [], error: known.includes(code) ? p(`errors.${code}`) : p('failed') } }));
    }
  };

  const state = q.data;
  return (
    <section className="bg-canvas pt-24 pb-12 sm:pt-28">
      <div className="container-x">
        <div className="card mx-auto max-w-2xl rounded-3xl p-5 sm:p-8">
          <p className="type-overline inline-flex items-center gap-2 text-muted">
            <ShieldCheck className="size-4" aria-hidden />
            {p('kicker')}
          </p>
          <h1 className="type-page-title mt-2 text-ink">{p('title')}</h1>
          {!state ? (
            <p className="mt-8 flex items-center gap-3 text-muted" role="status">
              <Spinner className="size-5" />
            </p>
          ) : state.kind !== 'ok' ? (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-danger-border bg-danger-bg p-4 text-danger-fg" role="alert">
              {state.kind === 'expired' ? <Clock className="mt-0.5 size-5 shrink-0" aria-hidden /> : <SearchX className="mt-0.5 size-5 shrink-0" aria-hidden />}
              <div>
                <p className="font-semibold">{state.kind === 'expired' ? p('expired') : p('invalid')}</p>
                <p className="mt-1 text-sm">{state.kind === 'expired' ? p('expiredText', { phone: brand.phone }) : p('invalidText')}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm font-semibold text-ink">{p('hello', { initials: state.view.client })}</p>
              <p className="mt-3 text-sm text-ink/80">{p('intro')}</p>
              {state.view.note && <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-sm whitespace-pre-line text-ink">{state.view.note}</p>}
              <p className="mt-3 text-xs text-muted">
                {p('expires', { date: dateTime(state.view.expiresAt) })} · {p('limits', { size: Math.round(state.view.maxFileSize / (1024 * 1024)) })}
              </p>
              <ul className="mt-5 space-y-3">
                {state.view.items.map((item) => {
                  const r = results[item.id];
                  const done = item.uploaded > 0;
                  return (
                    <li key={item.id} className="rounded-2xl border border-line p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-semibold text-ink">
                            {done ? <CheckCircle2 className="size-4 shrink-0 text-success-fg" aria-hidden /> : <CircleDashed className="size-4 shrink-0 text-warning-fg" aria-hidden />}
                            {tr(item.title)}
                          </p>
                          {item.description && tr(item.description) && <p className="mt-1 text-xs text-muted">{tr(item.description)}</p>}
                          {done && <p className="mt-1 text-xs text-success-fg">{item.accepted ? p('accepted') : p('count', { count: item.uploaded })}</p>}
                        </div>
                        <input
                          ref={(el) => {
                            inputs.current[item.id] = el;
                          }}
                          type="file"
                          className="sr-only"
                          accept={state.view.accept.join(',')}
                          aria-label={`${p('choose')}: ${tr(item.title)}`}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) void upload(item.id, f);
                          }}
                        />
                        <button
                          type="button"
                          className="btn-primary btn-sm min-h-11"
                          disabled={r?.busy || state.view.remainingFiles <= 0}
                          onClick={() => inputs.current[item.id]?.click()}
                        >
                          {r?.busy ? <Spinner className="size-4" /> : <FileUp className="size-4" aria-hidden />} {r?.busy ? p('uploading') : p('choose')}
                        </button>
                      </div>
                      <div aria-live="polite">
                        {r?.names.map((n, i) => (
                          <p key={`${n}-${i}`} className="mt-2 text-xs text-success-fg">
                            {p('uploaded', { name: n })}
                          </p>
                        ))}
                        {r?.warn && (
                          <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-fg">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {p('warn')}
                          </p>
                        )}
                        {r?.error && (
                          <p className="mt-2 text-xs text-danger-fg" role="alert">
                            {r.error}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-xs text-muted">{p('remaining', { count: state.view.remainingFiles })}</p>
              <p className="mt-1 text-xs text-muted">{p('privacy')}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
