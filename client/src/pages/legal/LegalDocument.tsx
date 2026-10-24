import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, Cookie, History, Languages, TriangleAlert } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Markdown } from '@/components/ops/Markdown';
import { Spinner } from '@/components/ui/Spinner';
import { usePageTitle } from '@/lib/usePageTitle';
import { openConsentSettings } from '@/lib/consent';
import { currentLocale, registerCopy, type Locale } from '@/i18n';
import { pagesLegal } from '@/i18n/pagesLegal';
import { pagesLegalDocs } from '@/i18n/pagesLegalDocs';
import { LEGAL_KINDS, LEGAL_PATH, useLegalDocument, useLegalVersion, useLegalVersions, versionPath, type LegalDoc, type LegalKind } from '@/components/legal/api';
import NotFound from '../NotFound';

registerCopy(pagesLegal);
registerCopy(pagesLegalDocs);

const HERO_IMAGE = 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=2000&q=70';
const DATE_LOCALE: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

const fmtDate = (iso: string | null, lang: Locale) => (iso ? new Intl.DateTimeFormat(DATE_LOCALE[lang], { dateStyle: 'long' }).format(new Date(iso)) : null);

/** The text of one version (German binding; translation shown when it exists). */
const DocumentBody = ({ doc, fallback, archived }: { doc: LegalDoc; fallback: boolean; archived: boolean }) => {
  const { t, i18n } = useTranslation();
  const uiLang = currentLocale();
  const [showGerman, setShowGerman] = useState(false);
  const lang: Locale = showGerman || !doc.body[uiLang]?.trim() ? 'de' : uiLang;
  const tl = useMemo(() => i18n.getFixedT(lang), [i18n, lang]);
  const effective = fmtDate(doc.effectiveAt ?? doc.publishedAt, lang);
  const summary = doc.changeSummary?.[lang]?.trim() || doc.changeSummary?.de?.trim();

  return (
    <div lang={lang}>
      {uiLang !== 'de' && (
        <div className="mb-8 flex flex-col gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-ink/85">
            <Languages className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            {t('legalPages.common.germanPrevails')}
          </p>
          <button type="button" className="btn-ghost btn-sm shrink-0 self-start sm:self-center" onClick={() => setShowGerman((s) => !s)} aria-pressed={showGerman}>
            {showGerman ? t('legalPages.common.showTranslation') : t('legalPages.common.showGerman')}
          </button>
        </div>
      )}
      <p className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted">
        <span>{tl('legalDocs.page.version', { version: doc.version })}</span>
        {effective && <span>{tl('legalDocs.page.effective', { date: effective })}</span>}
      </p>
      {archived && (
        <div className="mb-6 flex flex-col gap-2 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <Archive className="size-4 shrink-0" aria-hidden />
            {tl('legalDocs.page.archived', { version: doc.version })}
          </span>
          <Link to={LEGAL_PATH[doc.kind]} className="font-semibold underline">
            {tl('legalDocs.page.toCurrent')}
          </Link>
        </div>
      )}
      {fallback && (
        <p className="mb-6 flex items-start gap-2 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {tl('legalDocs.page.draftNote')}
        </p>
      )}
      {summary && archived && (
        <div className="mb-6 rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-xs font-bold tracking-wide text-muted uppercase">{tl('legalDocs.page.changes')}</p>
          <p className="mt-1 text-sm whitespace-pre-line text-ink/85">{summary}</p>
        </div>
      )}
      <Markdown source={doc.body[lang] || doc.body.de} className="text-[0.95rem] [&_h2]:text-xl [&_h3]:mt-8 [&_h3]:font-display [&_h3]:text-xl sm:[&_h3]:text-2xl" />
    </div>
  );
};

/** Published and archived versions of a kind (links to the archive view). */
const VersionArchive = ({ kind, active }: { kind: LegalKind; active?: string }) => {
  const { t } = useTranslation();
  const lang = currentLocale();
  const { data } = useLegalVersions(kind);
  return (
    <aside className="rounded-2xl border border-line bg-card p-4 sm:p-5" aria-labelledby="legal-archive-title">
      <h2 id="legal-archive-title" className="type-card-title flex items-center gap-2">
        <History className="size-4 text-brand-600" aria-hidden />
        {t('legalDocs.page.archiveTitle')}
      </h2>
      {!data?.length ? (
        <p className="type-small mt-2">{t('legalDocs.page.archiveEmpty')}</p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {data.map((v) => (
            <li key={v.id}>
              <Link
                to={v.status === 'PUBLISHED' ? LEGAL_PATH[kind] : versionPath(kind, v.version)}
                aria-current={active === v.version ? 'page' : undefined}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-ink/85 hover:bg-surface aria-[current=page]:bg-brand-50 aria-[current=page]:font-semibold"
              >
                <span className="truncate">{v.version}</span>
                <span className="shrink-0 text-xs text-muted">{fmtDate(v.effectiveAt ?? v.publishedAt, lang)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
};

/** Current text of a kind: /agb (/terms), /cookies, and /privacy once a privacy version is published. */
export function LegalDocumentView({ kind }: { kind: LegalKind }) {
  const { t } = useTranslation();
  const tr = (v: LegalDoc['title'] | undefined) => (v ? v[currentLocale()] || v.de : '');
  const { data, isLoading } = useLegalDocument(kind);
  usePageTitle(data ? tr(data.document.title) : t(`legalDocs.page.${kind}.title`));
  return (
    <>
      <PageHero title={data ? tr(data.document.title) : t(`legalDocs.page.${kind}.title`)} subtitle={t(`legalDocs.page.${kind}.subtitle`)} image={HERO_IMAGE} />
      <section className="section">
        <div className="container-x grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-12">
          <article className="min-w-0 leading-relaxed text-ink/85 lg:max-w-4xl">
            {isLoading || !data ? (
              <div className="grid place-items-center py-16 text-brand-600" role="status">
                <Spinner className="size-7" />
              </div>
            ) : (
              <DocumentBody doc={data.document} fallback={data.fallback} archived={false} />
            )}
          </article>
          <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            {kind === 'COOKIES' && (
              <button type="button" className="btn-primary btn-sm w-full min-h-11" onClick={openConsentSettings}>
                <Cookie className="size-4" aria-hidden /> {t('legalDocs.page.cookieSettings')}
              </button>
            )}
            <VersionArchive kind={kind} active={data?.document.version} />
          </div>
        </div>
      </section>
    </>
  );
}

/** /legal/:kind/:version — an archived (or the current) version, read-only. */
export function LegalArchivedVersion() {
  const { t } = useTranslation();
  const params = useParams();
  const kind = (params.kind ?? '').toUpperCase() as LegalKind;
  const valid = (LEGAL_KINDS as readonly string[]).includes(kind);
  const { data, isLoading, isError } = useLegalVersion(kind, valid ? params.version : undefined);
  usePageTitle(valid ? t(`legalDocs.page.${kind}.title`) : '');
  if (!valid) return <NotFound />;
  return (
    <>
      <PageHero title={t(`legalDocs.page.${kind}.title`)} subtitle={params.version} image={HERO_IMAGE} />
      <section className="section">
        <div className="container-x grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-12">
          <article className="min-w-0 leading-relaxed text-ink/85 lg:max-w-4xl">
            {isLoading ? (
              <div className="grid place-items-center py-16 text-brand-600" role="status">
                <Spinner className="size-7" />
              </div>
            ) : isError || !data ? (
              <p className="rounded-xl border border-line bg-surface p-6 text-center text-muted">{t('legalDocs.page.notFound')}</p>
            ) : (
              <DocumentBody doc={data} fallback={false} archived={data.status !== 'PUBLISHED'} />
            )}
          </article>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <VersionArchive kind={kind} active={params.version} />
          </div>
        </div>
      </section>
    </>
  );
}

export function TermsPage() {
  return <LegalDocumentView kind="TERMS" />;
}

export function CookiesPage() {
  return <LegalDocumentView kind="COOKIES" />;
}
