import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, CheckCircle2, Download, ExternalLink, Info, Medal, Upload } from 'lucide-react';
import { usePageTitle } from '@/lib/usePageTitle';
import { useL10n } from '@/lib/l10n';
import { getImpersonation } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Bar, LEVEL_TONE, WeeklyChallengeCard } from '@/components/ready/ReadyCards';
import { READY_QUERY_KEY, importLocalBests, localBests } from '@/lib/readyProgress/sync';
import { useReadyOverview, type ReadyActivityProgress, type ReadyCertificate } from '@/lib/readyProgress/api';
import type { ReadyGroup } from '@/lib/readyProgress/activities';

const GROUPS: ReadyGroup[] = ['work', 'german', 'everyday', 'exam', 'interview', 'portal'];
const LANGS = ['az', 'de', 'en', 'ru'] as const;

const ActivityRow = ({ a, highlight, to }: { a: ReadyActivityProgress; highlight: boolean; to?: string }) => {
  const { t } = useTranslation();
  const name = t(`gready.act.${a.id}`, { defaultValue: a.id });
  return (
    <li className={clsx('flex items-start gap-3 rounded-2xl border p-3', a.done ? 'border-success-border bg-success-bg' : highlight ? 'border-primary/40 bg-card' : 'border-line bg-card')}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-sm font-semibold text-ink">
            {name}
            {highlight && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{t('gready.yourScene')}</span>}
          </p>
          <span className="text-xs font-semibold text-ink tabular-nums">
            {a.earned} / {a.points}
          </span>
        </div>
        <Bar className="mt-1.5" value={Math.round(a.progress * 100)} max={100} label={name} />
        <p className="mt-1 text-xs text-muted">
          {a.done ? (
            <span className="inline-flex items-center gap-1 font-semibold text-success-fg">
              <CheckCircle2 className="size-3.5" aria-hidden /> {t('gready.done')}
            </span>
          ) : a.attempts || a.source === 'server' ? (
            [a.itemsRequired ? t('gready.items', { passed: a.itemsPassed ?? 0, required: a.itemsRequired }) : null, a.best !== null ? t('gready.best', { pct: a.best }) : null]
              .filter(Boolean)
              .join(' · ')
          ) : (
            t('gready.notYet')
          )}
          {a.source === 'server' && <span className="ml-1">· {t('gready.serverNote')}</span>}
        </p>
      </div>
      {!a.done && (
        <Link to={to ?? a.path} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-sunken" aria-label={`${t('gready.practise')}: ${name}`}>
          {t('gready.practise')} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </li>
  );
};

const CertificatePanel = ({ cert }: { cert: ReadyCertificate | null }) => {
  const { t, i18n } = useTranslation();
  const { date } = useL10n();
  const ui = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const [lang, setLang] = useState<(typeof LANGS)[number]>((LANGS as readonly string[]).includes(ui) ? (ui as (typeof LANGS)[number]) : 'de');
  const [busy, setBusy] = useState(false);
  const c = (k: string, o?: Record<string, unknown>) => String(t(`gready.cert.${k}`, o));

  if (!cert) return <p className="text-sm text-muted">{c('locked')}</p>;
  if (cert.revoked) {
    return (
      <div className="rounded-2xl border border-line bg-sunken p-4 text-sm">
        <p className="font-semibold text-ink">{c('revoked')}</p>
        <p className="mt-1 text-muted">{c('revokedText')}</p>
      </div>
    );
  }
  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/account/ready/certificate.pdf?lang=${lang}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `germany-ready-${cert.number}-${lang}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error(c('error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="font-semibold text-ink">{c('ready', { level: t(`gready.level.${cert.level}`) })}</p>
      <p className="text-sm text-muted">
        {c('number', { number: cert.number })} · {date(cert.levelAt)}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="label">{c('language')}</span>
          <select className="input min-h-11" value={lang} onChange={(e) => setLang(e.target.value as (typeof LANGS)[number])}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <Button icon={Download} loading={busy} onClick={() => void download()}>
          {c('download')}
        </Button>
        {cert.verifyUrl && (
          <a href={cert.verifyUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:underline">
            {c('verify')} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
};

const ImportPanel = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [has] = useState(() => (typeof window === 'undefined' ? false : localBests().length > 0));
  if (!has || getImpersonation()) return null;
  const run = async () => {
    setBusy(true);
    try {
      const r = await importLocalBests();
      toast.success(r.stored ? t('gready.import.done', { count: r.stored }) : t('gready.import.none'));
      void qc.invalidateQueries({ queryKey: [READY_QUERY_KEY] });
    } catch {
      toast.error(t('gready.import.error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card p-5" aria-labelledby="ready-import-h">
      <h2 id="ready-import-h" className="type-section-title text-ink">
        {t('gready.import.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('gready.import.text')}</p>
      <Button className="mt-3" variant="secondary" icon={Upload} loading={busy} onClick={() => void run()}>
        {t('gready.import.button')}
      </Button>
    </section>
  );
};

/**
 * /account/germany-ready — practice achievements: points per learning activity (games sync their results here),
 * total and level, next steps, the weekly challenge and the "Germany Ready" practice certificate (PDF + public check).
 * Clearly labelled as self-reported practice, not an exam.
 */
export default function AccountGermanyReady() {
  const { t } = useTranslation();
  usePageTitle(t('gready.title'));
  const q = useReadyOverview();

  if (q.isLoading || !q.data) {
    return (
      <div className="grid place-items-center py-16" role="status">
        <Spinner className="size-6" />
      </div>
    );
  }
  const o = q.data;
  const byId = new Map(o.activities.map((a) => [a.id, a]));
  const sceneId = o.professionScene;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h2 className="type-page-title flex items-center gap-2 text-ink">
          <Medal className="size-6 text-primary" aria-hidden /> {t('gready.title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('gready.intro')}</p>
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-sunken px-3 py-2 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('gready.selfReported')}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 [&>*]:min-w-0">
        <section className="card p-5" aria-labelledby="ready-total-h">
          <div className="flex items-center gap-4">
            <span className={clsx('grid size-16 shrink-0 place-items-center rounded-full', o.level ? LEVEL_TONE[o.level] : 'bg-sunken text-muted')}>
              <Medal className="size-7" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 id="ready-total-h" className="font-display text-2xl font-bold text-ink tabular-nums">
                {t('gready.points', { points: o.points, max: o.maxPoints })}
              </h3>
              <p className="text-sm text-muted">
                {o.level ? t(`gready.level.${o.level}`) : t('gready.noLevel')} · {t('gready.doneCount', { done: o.done })}
              </p>
            </div>
          </div>
          <Bar className="mt-3" value={o.points} max={o.maxPoints} label={t('gready.title')} />
          <p className="mt-2 text-xs text-muted">{o.next ? t('gready.nextLevel', { level: t(`gready.level.${o.next.level}`), points: o.next.points, done: o.next.done }) : t('gready.maxLevel')}</p>
        </section>
        <WeeklyChallengeCard challenge={o.challenge} />
      </div>

      <section className="card p-5" aria-labelledby="ready-cert-h">
        <h2 id="ready-cert-h" className="type-section-title mb-3 text-ink">
          {t('gready.cert.title')}
        </h2>
        <CertificatePanel cert={o.certificate} />
      </section>

      {o.suggestions.length > 0 && (
        <section aria-labelledby="ready-next-h">
          <h2 id="ready-next-h" className="type-section-title mb-3 text-ink">
            {t('gready.suggestions')}
          </h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {o.suggestions.map((id) => {
              const a = byId.get(id);
              return a ? <ActivityRow key={id} a={a} highlight={false} /> : null;
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="ready-all-h" className="space-y-4">
        <h2 id="ready-all-h" className="type-section-title text-ink">
          {t('gready.activities')}
        </h2>
        {GROUPS.map((g) => {
          const list = o.activities.filter((a) => a.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t(`gready.groups.${g}`)}</h3>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {list.map((a) => (
                  <ActivityRow key={a.id} a={a} highlight={a.id === 'work-scenes' && !!sceneId} to={a.id === 'work-scenes' && sceneId ? `/work-scenes/${sceneId}` : undefined} />
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <ImportPanel />
    </div>
  );
}
