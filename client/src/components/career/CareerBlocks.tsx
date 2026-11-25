import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, ExternalLink, FileText, GraduationCap, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { currentSiteLocale } from '@/i18n';
import { buttonClass } from '@/components/ui/Button';
import { PathLink, useGuides } from '@/components/guides/shared';

/**
 * Career page blocks (server lib/careerPages, GET /api/career/…): requirements, visa path, steps, FAQ and the
 * "related" links of the profession hubs (/for/:slug), the Ausbildung occupation pages (/ausbildung/:slug) and the
 * city pages (/cities/:slug). All texts come from the API in the reader's language (az, ru, tr, en, de); in other
 * languages the API answers null / 404 and nothing is rendered. Query key 'career' is server-rendered (SSR_QUERY_KEYS).
 * The FAQPage JSON-LD is in the page head (server lib/careerPages/seo.ts), so the FAQ here is plain markup:
 * native <details>, every answer in the DOM.
 */

export interface Faq {
  q: string;
  a: string;
}
export interface Labels {
  requirements: string;
  visa: string;
  visaLink: string;
  steps: string;
  faq: string;
  related: string;
  keywords: string;
  estimate: string;
  allowance: string;
  perMonth: string;
  years: string;
  germanLevel: string;
  about: string;
  after: string;
  ausbildungHub: string;
  ausbildungOthers: string;
  cities: string;
  cta: string;
  apply: string;
}
export interface Step {
  title: string;
  text: string;
}

export interface HubCareer {
  asOf: string;
  labels: Labels;
  keywords: string[];
  germanLevel: string;
  requirements: string[];
  visa: { text: string; label: string; slug: string; path: string };
  steps: Step[];
  faq: Faq[];
  ausbildung: { slug: string; path: string; name: string; title: string } | null;
  guides: string[];
  cities: { slug: string; name: string; path: string; jobs: number }[];
}

/** One career API resource in the current site language (null on 404). */
export const useCareer = <T,>(path: string, enabled = true) => {
  const lng = currentSiteLocale();
  return useQuery({
    queryKey: ['career', path, lng],
    queryFn: async () => {
      try {
        return (await api.get<T | null>(`/career/${path}`, { params: { lng } })).data;
      } catch (err) {
        if ((err as { response?: { status?: number } }).response?.status === 404) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    enabled,
  });
};

export const FaqList = ({ title, items, id }: { title: string; items: Faq[]; id: string }) =>
  items.length ? (
    <section className="section" aria-labelledby={id}>
      <div className="container-x max-w-3xl">
        <h2 id={id} className="h-section section-head text-ink">
          {title}
        </h2>
        <div className="space-y-3">
          {items.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-line bg-card open:border-line-strong">
              <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-ink sm:px-6">
                <h3 className="inline text-base">{f.q}</h3>
              </summary>
              <p className="px-5 pb-5 leading-relaxed text-muted sm:px-6">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  ) : null;

export const StepsList = ({ title, steps, id }: { title: string; steps: Step[]; id: string }) => (
  <section className="section bg-sunken" aria-labelledby={id}>
    <div className="container-x">
      <h2 id={id} className="h-section section-head text-ink">
        {title}
      </h2>
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.title} className="card card-pad rounded-3xl">
            <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-contrast" aria-hidden>
              {i + 1}
            </span>
            <h3 className="mt-3 font-display font-semibold text-ink">{s.title}</h3>
            <p className="mt-2 text-sm text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

export const CheckList = ({ items }: { items: string[] }) => (
  <ul className="space-y-2">
    {items.map((r) => (
      <li key={r} className="flex gap-2 text-ink">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> <span>{r}</span>
      </li>
    ))}
  </ul>
);

/** Pill links of the "related" block. */
export const RelatedLinks = ({ title, links, id }: { title: string; links: { to: string; label: string; icon?: 'ausbildung' | 'city' | 'doc' }[]; id: string }) =>
  links.length ? (
    <section className="section" aria-labelledby={id}>
      <div className="container-x">
        <h2 id={id} className="font-display text-xl font-semibold text-ink">
          {title}
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {links.map((l) => {
            const Icon = l.icon === 'ausbildung' ? GraduationCap : l.icon === 'city' ? MapPin : FileText;
            return (
              <li key={l.to}>
                <Link to={l.to} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink hover:border-line-strong">
                  <Icon className="size-4 text-primary" aria-hidden /> {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  ) : null;

/** Guides (CMS) by key, in the reader's language when published. */
const GuideLinks = ({ keys }: { keys: string[] }) => {
  const { data } = useGuides();
  const items = keys.map((k) => data?.find((g) => g.key === k)).filter((g): g is NonNullable<typeof g> => !!g);
  if (!items.length) return null;
  return (
    <ul className="mt-4 grid gap-3 md:grid-cols-2">
      {items.map((g) => (
        <li key={g.key}>
          <PathLink path={g.path} className="card card-interactive card-pad block rounded-2xl">
            <span className="font-semibold text-ink">{g.title}</span>
            <span className="mt-1 line-clamp-2 block text-sm text-muted">{g.description}</span>
          </PathLink>
        </li>
      ))}
    </ul>
  );
};

/** Profession hub: requirements, visa path, steps, FAQ and related links (career languages only). */
export const HubCareerSections = ({ slug, salaryLink }: { slug: string; salaryLink: string }) => {
  const { t } = useTranslation();
  const { data } = useCareer<HubCareer>(`hubs/${encodeURIComponent(slug)}`);
  if (!data) return null;
  const l = data.labels;
  return (
    <>
      <section className="section" aria-labelledby="hub-requirements">
        <div className="container-x grid gap-6 lg:grid-cols-2">
          <div className="card card-pad rounded-3xl">
            <h2 id="hub-requirements" className="font-display text-xl font-semibold text-ink">
              {l.requirements}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {l.germanLevel}: <strong className="text-ink">{data.germanLevel}</strong>
            </p>
            <div className="mt-4">
              <CheckList items={data.requirements} />
            </div>
          </div>
          <div className="card card-pad rounded-3xl">
            <h2 className="font-display text-xl font-semibold text-ink">
              {l.visa}: <span className="text-primary">{data.visa.label}</span>
            </h2>
            <p className="mt-3 leading-relaxed text-muted">{data.visa.text}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to={data.visa.path} className={buttonClass({ variant: 'outline', size: 'sm' })}>
                {l.visaLink} <ArrowRight className="size-4" aria-hidden />
              </Link>
              {data.ausbildung && (
                <Link to={data.ausbildung.path} className={buttonClass({ variant: 'outline', size: 'sm' })}>
                  <GraduationCap className="size-4" aria-hidden /> {data.ausbildung.name}
                </Link>
              )}
            </div>
            <GuideLinks keys={data.guides} />
          </div>
        </div>
      </section>
      <StepsList title={l.steps} steps={data.steps} id="hub-steps" />
      <FaqList title={l.faq} items={data.faq} id="hub-faq" />
      <RelatedLinks
        id="hub-related"
        title={l.related}
        links={[
          ...(data.ausbildung ? [{ to: data.ausbildung.path, label: data.ausbildung.title, icon: 'ausbildung' as const }] : []),
          ...data.cities.map((c) => ({ to: c.path, label: `${c.name} (${c.jobs})`, icon: 'city' as const })),
          { to: '/ausbildung', label: l.ausbildungHub, icon: 'ausbildung' as const },
          { to: salaryLink, label: t('profHub.salaryCalc') },
        ]}
      />
    </>
  );
};

/** /ausbildung: links to the occupation pages (career languages). */
export const AusbildungOccupations = () => {
  const { data } = useCareer<{ items: { slug: string; path: string; name: string; title: string; years: number; allowance: [number, number] }[] }>('ausbildung');
  if (!data?.items.length) return null;
  return (
    <section className="section" aria-labelledby="ausb-occupations">
      <div className="container-x">
        <ul id="ausb-occupations" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.items.map((o) => (
            <li key={o.slug}>
              <Link to={o.path} className="card card-interactive card-pad block h-full rounded-3xl">
                <GraduationCap className="size-5 text-primary" aria-hidden />
                <span className="mt-2 block font-display font-semibold text-ink">{o.title}</span>
                <span className="mt-1 block text-sm text-muted" lang="de">
                  {o.name} · {o.allowance[0]}–{o.allowance[1]} €
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

/** /cities: links to the city pages (career languages). */
export const CityPageLinks = ({ title }: { title?: string }) => {
  const { data } = useCareer<{ items: { slug: string; name: string; path: string; jobs: number }[] }>('cities');
  if (!data?.items.length) return null;
  return (
    <nav aria-label={title ?? 'Cities'} className="mt-6">
      {title && <p className="font-display text-lg font-semibold text-ink">{title}</p>}
      <ul className="mt-3 flex flex-wrap gap-2">
        {data.items.map((c) => (
          <li key={c.slug}>
            <Link to={c.path} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink hover:border-line-strong">
              <MapPin className="size-4 text-primary" aria-hidden /> {c.name}
              {c.jobs > 0 && <span className="text-muted">({c.jobs})</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export const ExternalSource = ({ href, label }: { href: string; label: string }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
    {label}
    <ExternalLink className="ml-0.5 inline size-3" aria-hidden />
  </a>
);
