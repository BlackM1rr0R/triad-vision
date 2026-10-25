import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Check, Eye, FlaskConical, Megaphone, Save, Send, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { PageHead, Panel, Switch } from '@/components/admin/ui';
import { RichTextArea } from './RichTextArea';
import { SegmentPreviewPanel, useSegmentPreview } from './SegmentBuilder';
import {
  campaignError,
  CHANNELS,
  emptyContent,
  LANGS,
  useSegmentOptions,
  useSegments,
  type Campaign,
  type CampaignKind,
  type Channel,
  type Content,
  type Lang,
} from './api';

type Step = 'segment' | 'content' | 'channels' | 'review';
const STEPS: Step[] = ['segment', 'content', 'channels', 'review'];

interface Draft {
  name: string;
  kind: CampaignKind;
  segmentId: string;
  content: Content;
  channels: Channel[];
  emailsPerMinute: number;
  smsPerMinute: number;
  quietHours: boolean;
}

const fromCampaign = (c: Campaign | undefined): Draft => ({
  name: c?.name ?? '',
  kind: c?.kind ?? 'SERVICE',
  segmentId: c?.segmentId ?? '',
  content: c?.content ?? emptyContent(),
  channels: c?.channels?.length ? c.channels : ['EMAIL'],
  emailsPerMinute: c?.emailsPerMinute ?? 30,
  smsPerMinute: c?.smsPerMinute ?? 10,
  quietHours: c?.quietHours ?? true,
});

const filled = (c: Content[Lang]) => !!(c.subject.trim() && c.body.trim());

/** "YYYY-MM-DDTHH:mm" typed as Baku time → ISO with +04:00. */
const bakuIso = (local: string) => `${local}:00+04:00`;
/** Now + 1 hour as a Baku datetime-local value. */
const bakuLocalIn = (ms: number) => new Date(Date.now() + ms + 4 * 3600_000).toISOString().slice(0, 16);

interface PreviewResult {
  email: { subject: string; html: string; text: string };
  inApp: { title: string; body: string };
  sms: string;
  rejectedLinks: string[];
}

const PreviewPane = ({ draft }: { draft: Draft }) => {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Lang>('az');
  const [tab, setTab] = useState<'EMAIL' | 'SMS' | 'IN_APP'>('EMAIL');
  const [data, setData] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify([draft.content, draft.kind, lang]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const h = window.setTimeout(() => {
      api
        .post<PreviewResult>('/admin/campaigns/preview', { kind: draft.kind, content: draft.content, locale: lang })
        .then((r) => alive && setData(r.data))
        .catch(() => alive && setData(null))
        .finally(() => alive && setLoading(false));
    }, 500);
    return () => {
      alive = false;
      window.clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Eye className="size-4 text-link" aria-hidden />
        <span className="text-sm font-semibold text-ink">{t('campaigns.wizard.preview')}</span>
        <div className="ml-auto flex flex-wrap gap-1">
          {LANGS.map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={clsx('min-h-8 rounded-md px-2 text-xs font-bold uppercase', lang === l ? 'bg-primary text-primary-contrast' : 'text-muted hover:bg-sunken')}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-1 border-b border-line px-3 py-1.5">
        {(['EMAIL', 'IN_APP', 'SMS'] as const).map((c) => (
          <button key={c} type="button" aria-pressed={tab === c} onClick={() => setTab(c)} className={clsx('min-h-8 rounded-md px-2.5 text-xs font-semibold', tab === c ? 'bg-primary/[0.06] text-link' : 'text-muted hover:bg-sunken')}>
            {t(`campaigns.wizard.preview${c === 'EMAIL' ? 'Email' : c === 'SMS' ? 'Sms' : 'InApp'}`)}
          </button>
        ))}
        {loading && <Spinner className="ml-auto size-4 self-center" />}
      </div>
      {data?.rejectedLinks.length ? (
        <p className="border-b border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger-fg" role="alert">
          {t('campaigns.wizard.rejectedLinks', { links: data.rejectedLinks.join(', ') })}
        </p>
      ) : null}
      <div className="p-3">
        {!data ? (
          <p className="py-8 text-center text-sm text-muted">—</p>
        ) : tab === 'EMAIL' ? (
          <>
            <p className="mb-2 truncate text-sm font-semibold text-ink" title={data.email.subject}>
              {data.email.subject || '—'}
            </p>
            {/* Sandboxed: no scripts, no navigation out of the preview. */}
            <iframe title={t('campaigns.wizard.previewEmail')} sandbox="" srcDoc={data.email.html} className="h-[28rem] w-full rounded-lg border border-line bg-card" />
          </>
        ) : tab === 'SMS' ? (
          <p className="max-w-sm rounded-xl rounded-bl-sm bg-sunken px-4 py-3 text-sm whitespace-pre-wrap text-ink">{data.sms || '—'}</p>
        ) : (
          <div className="rounded-lg border border-line p-3">
            <p className="text-sm font-semibold text-ink">{data.inApp.title || '—'}</p>
            <p className="mt-1 text-xs whitespace-pre-line text-muted">{data.inApp.body}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export const CampaignWizard = ({ campaign }: { campaign?: Campaign }) => {
  const { t } = useTranslation();
  const w = (k: string, o?: Record<string, unknown>) => t(`campaigns.wizard.${k}`, o);
  const uid = useId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const segments = useSegments();
  const options = useSegmentOptions().data;
  const [draft, setDraft] = useState<Draft>(() => fromCampaign(campaign));
  const [id, setId] = useState<string | undefined>(campaign?.id);
  const [step, setStep] = useState<Step>('segment');
  const [lang, setLang] = useState<Lang>('az');
  const [when, setWhen] = useState<'now' | 'later'>(campaign?.scheduledAt ? 'later' : 'now');
  const [sendAt, setSendAt] = useState(() => (campaign?.scheduledAt ? new Date(new Date(campaign.scheduledAt).getTime() + 4 * 3600_000).toISOString().slice(0, 16) : bakuLocalIn(3600_000)));
  const [busy, setBusy] = useState<'save' | 'send' | 'test' | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setText = (l: Lang, field: keyof Content[Lang], v: string) => setDraft((d) => ({ ...d, content: { ...d.content, [l]: { ...d.content[l], [field]: v } } }));

  const segment = useMemo(() => segments.data?.find((s) => s.id === draft.segmentId) ?? null, [segments.data, draft.segmentId]);
  const preview = useSegmentPreview(segment?.definition ?? null);

  const save = async (): Promise<string | null> => {
    if (!draft.name.trim()) {
      toast.error(w('errors.nameRequired'));
      setStep('segment');
      return null;
    }
    const body = { ...draft, segmentId: draft.segmentId || null };
    const res = id ? await api.patch<{ item: { id: string } }>(`/admin/campaigns/${id}`, body) : await api.post<{ item: { id: string } }>('/admin/campaigns', body);
    setId(res.data.item.id);
    void qc.invalidateQueries({ queryKey: ['campaigns'] });
    void qc.invalidateQueries({ queryKey: ['campaign', res.data.item.id] });
    return res.data.item.id;
  };

  const run = async (kind: 'save' | 'send' | 'test') => {
    setBusy(kind);
    try {
      const savedId = await save();
      if (!savedId) return;
      if (kind === 'save') {
        toast.success(w('saved'));
        if (!id) navigate(`/admin/campaigns/${savedId}/edit`, { replace: true });
      } else if (kind === 'test') {
        const r = (await api.post<{ results: Record<string, string> }>(`/admin/campaigns/${savedId}/test`, { locale: lang })).data.results;
        toast.success(w('testSent', { results: Object.entries(r).map(([c, s]) => `${t(`campaigns.channel.${c}`)}: ${s}`).join(' · ') }));
      } else {
        if (when === 'later' && !sendAt) {
          toast.error(w('dateRequired'));
          return;
        }
        const res = (await api.post<{ queued: number }>(`/admin/campaigns/${savedId}/schedule`, { sendAt: when === 'later' ? new Date(bakuIso(sendAt)).toISOString() : null })).data;
        toast.success(when === 'later' ? w('scheduled') : w('started', { count: res.queued }));
        void qc.invalidateQueries({ queryKey: ['campaigns'] });
        navigate(`/admin/campaigns/${savedId}`);
      }
    } catch (err) {
      campaignError(err);
    } finally {
      setBusy(null);
    }
  };

  const idx = STEPS.indexOf(step);
  const canNext = step === 'segment' ? !!draft.name.trim() && !!draft.segmentId : step === 'content' ? LANGS.some((l) => filled(draft.content[l])) : step === 'channels' ? draft.channels.length > 0 : false;
  const recipientsEstimate = draft.kind === 'MARKETING' ? (preview.data?.marketingOptedIn ?? 0) : (preview.data?.count ?? 0);

  return (
    <div className="mx-auto max-w-6xl">
      <Link to={id ? `/admin/campaigns/${id}` : '/admin/campaigns'} className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {t('campaigns.detail.back')}
      </Link>
      <PageHead
        title={campaign ? w('titleEdit') : w('titleNew')}
        actions={
          <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void run('save')}>
            {busy === 'save' ? <Spinner className="size-3.5" /> : <Save className="size-3.5" aria-hidden />} {w('saveDraft')}
          </button>
        }
      />

      <ol className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setStep(s)}
              aria-current={step === s ? 'step' : undefined}
              className={clsx(
                'flex min-h-10 sm:min-h-9 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition',
                step === s ? 'border-primary bg-primary/[0.06] text-link' : i < idx ? 'border-line bg-card text-ink' : 'border-line bg-card text-muted',
              )}
            >
              <span className={clsx('grid size-6 shrink-0 place-items-center rounded-full text-[11px]', i < idx ? 'bg-success text-white' : step === s ? 'bg-primary text-primary-contrast' : 'bg-sunken text-muted')}>
                {i < idx ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className="min-w-0 truncate">{w(`steps.${s}`)}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 'segment' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
          <Panel title={w('steps.segment')} icon={Megaphone}>
            <div className="space-y-5">
              <div>
                <label className="label" htmlFor={`${uid}-name`}>
                  {w('name')}
                </label>
                <input id={`${uid}-name`} className="input" maxLength={200} value={draft.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <fieldset>
                <legend className="label">{w('kindTitle')}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['SERVICE', 'MARKETING'] as const).map((k) => (
                    <label key={k} className={clsx('flex cursor-pointer gap-3 rounded-lg border p-3 transition', draft.kind === k ? 'border-primary bg-primary/[0.06]' : 'border-line hover:border-line-strong')}>
                      <input type="radio" name={`${uid}-kind`} className="mt-1 accent-primary" checked={draft.kind === k} onChange={() => set('kind', k)} />
                      <span>
                        <span className="block text-sm font-semibold text-ink">{t(`campaigns.kind.${k}`)}</span>
                        <span className="mt-0.5 block text-xs text-muted">{t(`campaigns.kindHint.${k}`)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label className="label" htmlFor={`${uid}-segment`}>
                  {w('segment')}
                </label>
                <div className="flex flex-wrap gap-2">
                  <select id={`${uid}-segment`} className="input min-w-0 flex-1" value={draft.segmentId} onChange={(e) => set('segmentId', e.target.value)}>
                    <option value="">{w('chooseSegment')}</option>
                    {(segments.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <Link to="/admin/campaigns/segments/new" className="btn-secondary btn-sm">
                    {w('newSegment')}
                  </Link>
                </div>
              </div>
            </div>
          </Panel>
          <SegmentPreviewPanel preview={preview.data} loading={preview.loading} />
        </div>
      )}

      {step === 'content' && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title={w('steps.content')}>
            <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label={w('language')}>
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={lang === l}
                  onClick={() => setLang(l)}
                  className={clsx('inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold uppercase', lang === l ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink/80')}
                >
                  {l}
                  <span className={clsx('size-1.5 rounded-full', filled(draft.content[l]) ? 'bg-success' : 'bg-line-strong')} aria-label={filled(draft.content[l]) ? w('filled') : w('emptyLang')} />
                </button>
              ))}
            </div>
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor={`${uid}-subject`}>
                  {w('subject')} ({lang.toUpperCase()})
                </label>
                <input id={`${uid}-subject`} className="input" maxLength={200} value={draft.content[lang].subject} onChange={(e) => setText(lang, 'subject', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={`${uid}-body`}>
                  {w('body')} ({lang.toUpperCase()})
                </label>
                <RichTextArea id={`${uid}-body`} value={draft.content[lang].body} onChange={(v) => setText(lang, 'body', v)} allowedHosts={options?.allowedHosts} />
              </div>
              <div>
                <label className="label" htmlFor={`${uid}-sms`}>
                  {w('sms')} ({lang.toUpperCase()})
                </label>
                <textarea id={`${uid}-sms`} className="input" rows={3} maxLength={480} value={draft.content[lang].sms} onChange={(e) => setText(lang, 'sms', e.target.value)} />
                <p className="mt-1 text-xs text-muted">{w('smsHint', { count: draft.content[lang].sms.length })}</p>
              </div>
              <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">{w('fallback')}</p>
            </div>
          </Panel>
          <div className="space-y-3">
            <PreviewPane draft={draft} />
            <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void run('test')}>
              {busy === 'test' ? <Spinner className="size-3.5" /> : <FlaskConical className="size-3.5" aria-hidden />} {w('sendTest')}
            </button>
          </div>
        </div>
      )}

      {step === 'channels' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title={w('channelsTitle')}>
            <div className="space-y-2">
              {CHANNELS.map((c) => {
                const on = draft.channels.includes(c);
                return (
                  <label key={c} className={clsx('flex min-h-10 sm:min-h-9 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2', on ? 'border-primary bg-primary/[0.06]' : 'border-line')}>
                    <input type="checkbox" className="size-4 accent-primary" checked={on} onChange={() => set('channels', on ? draft.channels.filter((x) => x !== c) : [...draft.channels, c])} />
                    <span className="text-sm font-semibold text-ink">{t(`campaigns.channel.${c}`)}</span>
                  </label>
                );
              })}
              {!draft.channels.length && <p className="text-xs text-danger-fg">{w('noChannel')}</p>}
            </div>
            <fieldset className="mt-6">
              <legend className="label">{w('when')}</legend>
              <div className="flex flex-wrap gap-2">
                {(['now', 'later'] as const).map((v) => (
                  <label key={v} className={clsx('flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm', when === v ? 'border-primary bg-primary/[0.06] font-semibold' : 'border-line')}>
                    <input type="radio" name={`${uid}-when`} className="accent-primary" checked={when === v} onChange={() => setWhen(v)} />
                    {w(v)}
                  </label>
                ))}
              </div>
              {when === 'later' && (
                <div className="mt-3">
                  <input type="datetime-local" className="input max-w-xs" value={sendAt} onChange={(e) => setSendAt(e.target.value)} aria-describedby={`${uid}-tz`} />
                  <p id={`${uid}-tz`} className="mt-1 text-xs text-muted">
                    {w('tz')}
                  </p>
                </div>
              )}
            </fieldset>
          </Panel>
          <Panel title={w('throttleTitle')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`${uid}-epm`}>
                  {w('emailsPerMinute')}
                </label>
                <input id={`${uid}-epm`} type="number" min={1} max={120} className="input" value={draft.emailsPerMinute} onChange={(e) => set('emailsPerMinute', Math.max(1, Math.min(120, Number(e.target.value) || 1)))} />
              </div>
              <div>
                <label className="label" htmlFor={`${uid}-spm`}>
                  {w('smsPerMinute')}
                </label>
                <input id={`${uid}-spm`} type="number" min={1} max={60} className="input" value={draft.smsPerMinute} onChange={(e) => set('smsPerMinute', Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">{w('throttleHint')}</p>
            <div className="mt-5 flex items-start justify-between gap-3 rounded-lg border border-line p-3">
              <span className="text-sm text-ink">{w('quietHours')}</span>
              <Switch checked={draft.quietHours} onChange={(v) => set('quietHours', v)} label={w('quietHours')} />
            </div>
          </Panel>
        </div>
      )}

      {step === 'review' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
          <Panel title={w('reviewTitle')} icon={ShieldCheck}>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">{w('name')}</dt>
                <dd className="font-semibold text-ink">{draft.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{w('kindTitle')}</dt>
                <dd className="font-semibold text-ink">{t(`campaigns.kind.${draft.kind}`)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{w('segment')}</dt>
                <dd className="font-semibold text-ink">{segment?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{w('channelsTitle')}</dt>
                <dd className="font-semibold text-ink">{draft.channels.map((c) => t(`campaigns.channel.${c}`)).join(', ') || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{w('language')}</dt>
                <dd className="font-semibold text-ink uppercase">{LANGS.filter((l) => filled(draft.content[l])).join(', ') || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{w('when')}</dt>
                <dd className="font-semibold text-ink">{when === 'now' ? w('now') : `${sendAt.replace('T', ' ')} (${w('tz')})`}</dd>
              </div>
            </dl>
            <p className={clsx('mt-5 rounded-lg border px-3 py-2 text-sm', draft.kind === 'MARKETING' ? 'border-warning-border bg-warning-bg text-warning-fg' : 'border-line bg-sunken text-ink')}>
              {draft.kind === 'MARKETING' ? w('marketingWarn', { count: recipientsEstimate }) : w('serviceNote')}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={!!busy || !draft.segmentId || !draft.channels.length} onClick={() => void run('send')}>
                {busy === 'send' ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {when === 'now' ? w('sendNow') : w('schedule')}
              </button>
              <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => void run('test')}>
                {busy === 'test' ? <Spinner className="size-4" /> : <FlaskConical className="size-4" aria-hidden />} {w('sendTest')}
              </button>
            </div>
          </Panel>
          <SegmentPreviewPanel preview={preview.data} loading={preview.loading} />
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={idx === 0} onClick={() => setStep(STEPS[Math.max(0, idx - 1)]!)}>
          <ArrowLeft className="size-3.5" aria-hidden /> {w('back')}
        </button>
        {idx < STEPS.length - 1 && (
          <button type="button" className="btn-primary btn-sm" disabled={!canNext} onClick={() => setStep(STEPS[idx + 1]!)}>
            {w('next')} <ArrowRight className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
};
