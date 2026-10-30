import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Check, Copy, Download, KeyRound, Landmark, ListChecks, RefreshCw, Rss, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesJobFeeds } from '@/i18n/pagesJobFeeds';
import { ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { fmtDateTime, toastError } from '@/components/admin/labels';
import { Badge } from '@/components/ui/Badge';
import { Checkbox, Field, Input } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { CHANNELS, STATUS_TONE, type BaView, type ChannelStatus, type FeedsOverview } from '@/components/jobFeeds/types';
import { useErrorLabel } from '@/components/jobFeeds/VacancyDistributionPanel';
import type { L10n } from '@/lib/types';

registerCopy(pagesJobFeeds);

const STATUSES: ChannelStatus[] = ['PUBLISHED', 'PENDING', 'ERROR', 'EXPIRED'];
const KEY = ['admin-job-feeds'];

const CopyField = ({ label, hint, value }: { label: string; hint: string; value: string }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('admin.common.opFailed'));
    }
  };
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <input className="input code-id min-w-0 flex-1 text-xs" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => void copy()} aria-label={`${t('jobFeeds.copy')}: ${label}`}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? t('jobFeeds.copied') : t('jobFeeds.copy')}
        </button>
      </div>
    </Field>
  );
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

type BaCheck = { fileName: string; included: { vacancyId: string; slug: string; title: string }[]; errors: { vacancyId: string; slug: string; errors: string[] }[]; fileErrors: string[] };

const BaPanel = ({ ba }: { ba: BaView }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errorLabel = useErrorLabel();
  const [form, setForm] = useState({ supplierId: ba.supplierId ?? '', partnerId: ba.partnerId ?? '', uploadUrl: ba.uploadUrl ?? '', passphrase: '' });
  const [certificate, setCertificate] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [check, setCheck] = useState<BaCheck | null>(null);
  useEffect(() => setForm((f) => ({ ...f, supplierId: ba.supplierId ?? '', partnerId: ba.partnerId ?? '', uploadUrl: ba.uploadUrl ?? '' })), [ba.supplierId, ba.partnerId, ba.uploadUrl]);

  const put = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.put<{ ba: BaView }>('/admin/job-feeds/ba', body)).data.ba,
    onSuccess: () => {
      toast.success(t('jobFeeds.ba.saved'));
      setCertificate(null);
      setForm((f) => ({ ...f, passphrase: '' }));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toastError(e),
  });
  const validate = useMutation({
    mutationFn: async () => (await api.get<BaCheck>('/admin/job-feeds/ba/validate')).data,
    onSuccess: setCheck,
    onError: (e) => toastError(e),
  });
  const download = useMutation({
    mutationFn: async () => {
      const res = await api.get<Blob>('/admin/job-feeds/ba.xml', { responseType: 'blob' });
      const name = /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ?? 'hr-ba-xml.xml';
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toastError(e),
  });
  const upload = useMutation({
    mutationFn: async () => (await api.post<{ result: { ok: boolean; uploaded?: number; skipped?: string; error?: string } }>('/admin/job-feeds/ba/upload')).data.result,
    onSuccess: (r) => {
      if (r.ok) toast.success(t('jobFeeds.ba.uploadResult.ok', { count: r.uploaded ?? 0 }));
      else toast.error(r.skipped ? t(`jobFeeds.ba.uploadResult.${r.skipped}`) : `${t('jobFeeds.ba.uploadResult.error')}: ${r.error ?? ''}`);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toastError(e),
  });

  const save = () =>
    put.mutate({
      supplierId: form.supplierId.trim() || null,
      partnerId: form.partnerId.trim() || null,
      uploadUrl: form.uploadUrl.trim() || null,
      ...(certificate ? { certificate } : {}),
      ...(form.passphrase ? { passphrase: form.passphrase } : {}),
    });

  return (
    <Panel title={t('jobFeeds.ba.title')} icon={Landmark}>
      <div className="grid gap-4">
        <p className="text-sm text-muted">{t('jobFeeds.ba.intro')}</p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={ba.ready ? 'success' : 'warning'} dot>
            {ba.ready ? t('jobFeeds.ba.ready') : t('jobFeeds.ba.notReady', { list: ba.missing.map((m) => t(`jobFeeds.ba.missing.${m}`)).join(', ') })}
          </Badge>
          {ba.lastUploadAt && <span className="text-muted">{t('jobFeeds.ba.lastUpload')}: {fmtDateTime(ba.lastUploadAt)}</span>}
          {ba.lastError && (
            <span className="text-danger-fg">
              {t('jobFeeds.ba.lastError')}: {ba.lastError}
            </span>
          )}
        </p>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field label={t('jobFeeds.ba.supplierId')}>
            <Input maxLength={40} autoComplete="off" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value.replace(/[^A-Za-z0-9]/g, '') })} />
          </Field>
          <Field label={t('jobFeeds.ba.partnerId')}>
            <Input maxLength={40} autoComplete="off" value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value.replace(/[^A-Za-z0-9]/g, '') })} />
          </Field>
          <Field label={t('jobFeeds.ba.uploadUrl')} className="sm:col-span-2">
            <Input type="url" maxLength={500} placeholder="https://hrbaxml.arbeitsagentur.de/…" value={form.uploadUrl} onChange={(e) => setForm({ ...form, uploadUrl: e.target.value })} />
          </Field>
          <Field label={t('jobFeeds.ba.certificate')} hint={certificate ? '✓' : ba.hasCertificate ? t('jobFeeds.ba.certificateSet') : t('jobFeeds.ba.certificateMissing')}>
            <input
              type="file"
              className="input"
              accept=".p12,.pfx,application/x-pkcs12"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setCertificate(await fileToBase64(file));
                } catch {
                  toast.error(t('admin.common.opFailed'));
                }
              }}
            />
          </Field>
          <Field label={t('jobFeeds.ba.passphrase')} hint={ba.hasPassphrase ? t('jobFeeds.ba.passphraseSet') : undefined}>
            <PasswordInput autoComplete="new-password" maxLength={200} value={form.passphrase} onChange={(e) => setForm({ ...form, passphrase: e.target.value })} />
          </Field>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button type="submit" className="btn-primary btn-sm" disabled={put.isPending}>
              {put.isPending && <Spinner className="size-3.5" />} {t('jobFeeds.ba.save')}
            </button>
            {(ba.hasCertificate || ba.hasPassphrase) && (
              <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setConfirmClear(true)}>
                {t('jobFeeds.ba.clear')}
              </button>
            )}
          </div>
        </form>
        <Checkbox
          label={t('jobFeeds.ba.enable')}
          checked={ba.uploadEnabled}
          disabled={(!ba.ready && !ba.uploadEnabled) || put.isPending}
          onChange={(e) => put.mutate({ uploadEnabled: e.target.checked })}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" disabled={validate.isPending} onClick={() => validate.mutate()}>
            <ListChecks className="size-3.5" /> {t('jobFeeds.ba.validate')}
          </button>
          <button type="button" className="btn-secondary btn-sm" disabled={download.isPending} onClick={() => download.mutate()}>
            <Download className="size-3.5" /> {t('jobFeeds.ba.download')}
          </button>
          <button type="button" className="btn-secondary btn-sm" disabled={!ba.ready || !ba.uploadEnabled || upload.isPending} onClick={() => upload.mutate()}>
            <Upload className="size-3.5" /> {t('jobFeeds.ba.uploadNow')}
          </button>
        </div>
        {check && (
          <div className="grid gap-2 rounded-lg border border-line p-3 text-sm">
            <p className="font-semibold text-ink">
              {check.fileName} · {t('jobFeeds.ba.included', { count: check.included.length })} · {t('jobFeeds.ba.invalid', { count: check.errors.length })}
            </p>
            {check.fileErrors.length > 0 && <p className="text-danger-fg">{errorLabel(check.fileErrors)}</p>}
            {check.errors.length > 0 && (
              <ul className="grid gap-1">
                {check.errors.map((e) => (
                  <li key={e.vacancyId}>
                    <Link to={`/admin/vacancies?id=${e.vacancyId}`} className="font-semibold text-link hover:underline">
                      {e.slug}
                    </Link>{' '}
                    <span className="text-danger-fg">{errorLabel(e.errors)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">{t('jobFeeds.ba.uncertain')}</summary>
          <ul className="mt-2 list-disc pl-5">
            {ba.uncertainFields.map((f) => (
              <li key={f} className="code-id">
                {f}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => put.mutate({ clearCredentials: true }, { onSettled: () => setConfirmClear(false) })}
        loading={put.isPending}
        title={t('jobFeeds.ba.clearTitle')}
        message={t('jobFeeds.ba.clearText')}
        confirmLabel={t('jobFeeds.ba.clear')}
      />
    </Panel>
  );
};

/** Admin → İşəgötürənlər → İş elanı kanalları (ADMIN+): feed URLs, token rotation, per-channel status, BA Jobbörse. */
export default function JobChannels() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  usePageTitle(t('jobFeeds.title'));
  const qc = useQueryClient();
  const errorLabel = useErrorLabel();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<FeedsOverview>('/admin/job-feeds')).data });
  const rotate = useMutation({
    mutationFn: () => api.post('/admin/job-feeds/rotate-token'),
    onSuccess: () => {
      toast.success(t('jobFeeds.rotated'));
      setConfirmRotate(false);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toastError(e),
  });
  const refresh = useMutation({
    mutationFn: () => api.post('/admin/job-feeds/refresh'),
    onSuccess: () => {
      toast.success(t('jobFeeds.refreshed'));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toastError(e),
  });

  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <LoadingBlock />;
  const d = q.data;

  return (
    <div className="stack-page">
      <PageHead
        title={t('jobFeeds.title')}
        subtitle={t('jobFeeds.intro')}
        actions={
          <button type="button" className="btn-secondary btn-sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            {refresh.isPending ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />} {t('jobFeeds.refresh')}
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CHANNELS.map((c) => {
          const ch = d.channels[c];
          return (
            <Panel key={c} title={t(`jobFeeds.channel.${c}`)} icon={c === 'ba' ? Landmark : Rss}>
              <div className="grid gap-2 text-sm">
                <p className="text-muted">
                  {t('jobFeeds.enabled')}: <span className="font-semibold text-ink tabular-nums">{ch.enabled}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.filter((s) => ch.counts[s]).map((s) => (
                    <Badge key={s} tone={STATUS_TONE[s]} dot>
                      {t(`jobFeeds.status.${s}`)} {ch.counts[s]}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted">
                  {t('jobFeeds.lastBuild')}: {ch.lastBuild ? `${fmtDateTime(ch.lastBuild.at)} · ${t('jobFeeds.lastBuildItems', { count: ch.lastBuild.items })}` : t('jobFeeds.never')}
                </p>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel
        title={t('jobFeeds.feedsTitle')}
        icon={KeyRound}
        actions={
          <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirmRotate(true)}>
            <RefreshCw className="size-3.5" /> {t('jobFeeds.rotate')}
          </button>
        }
      >
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            {t('jobFeeds.feedsHint')} {t('jobFeeds.rotatedAt', { date: fmtDateTime(d.tokenRotatedAt) })}
          </p>
          {d.tokenBroken && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-fg">{t('jobFeeds.tokenBroken')}</p>}
          {d.feeds && (['indeed', 'stepstone', 'generic'] as const).map((c) => <CopyField key={c} label={t(`jobFeeds.channel.${c}`)} hint={t(`jobFeeds.channelHint.${c}`)} value={d.feeds![c]} />)}
        </div>
      </Panel>

      <Panel title={t('jobFeeds.errorsTitle')} icon={AlertTriangle}>
        {d.errors.length === 0 ? (
          <p className="text-sm text-muted">{t('jobFeeds.noErrors')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.errors.map((e) => (
              <li key={`${e.channel}-${e.vacancy.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <Link to={`/admin/vacancies?id=${e.vacancy.id}`} className="font-semibold text-link hover:underline">
                    {tr(e.vacancy.title as L10n) || e.vacancy.slug}
                  </Link>
                  <span className="ml-2 text-xs text-muted">{t(`jobFeeds.channel.${e.channel}`)}</span>
                </span>
                <span className="text-danger-fg">{errorLabel(e.error)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <BaPanel ba={d.ba} />

      <ConfirmDialog
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        onConfirm={() => rotate.mutate()}
        loading={rotate.isPending}
        title={t('jobFeeds.rotateTitle')}
        message={t('jobFeeds.rotateText')}
        confirmLabel={t('jobFeeds.rotate')}
      />
    </div>
  );
}
