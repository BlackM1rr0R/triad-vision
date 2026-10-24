import { cached } from './cache.js';
import { SEO_LOCALES, SITE_NAME, STATIC_PAGES, textIn, type SeoLocale } from './seoCatalogue.js';
import {
  collapse,
  escapeHtml as e,
  guidesInLanguage,
  indexable,
  JOB_LABELS,
  liveJobs,
  localizedPath,
  pick,
  pickList,
  requestTarget,
  resolvePage,
  type SeoData,
} from './seo.js';
import { guidePath, renderGuide, type GuideRow } from './guides/service.js';

/*
 * Crawlable page body ("SSR-lite") for search engines and link previews that do not run JavaScript.
 *
 * Caddy includes GET /__seo/body?path=… into <div id="root"> of index.html (deploy/Caddyfile). The fragment is
 * plain semantic HTML built from the CMS content and the SEO catalogue: site navigation, breadcrumbs, the h1,
 * intro text, the page's key lists (visa types, services, guides, jobs, news…) and a footer with name, address
 * and phone. React does not hydrate it: createRoot() replaces the children of #root on its first render, and
 * index.html hides the block as soon as JavaScript runs (html.js .ssr), so visitors never see it flash.
 * Private and unknown paths get an empty body. Everything is escaped; output is cached with the SEO data.
 */

type Labels = Record<
  'nav' | 'breadcrumb' | 'visas' | 'services' | 'guides' | 'news' | 'jobs' | 'events' | 'faq' | 'requirements' | 'documents' | 'features' | 'steps' | 'related' | 'contents' | 'updated' | 'cta' | 'eligibility' | 'languages' | 'phone' | 'email' | 'hours' | 'more',
  string
>;

const L: Record<SeoLocale, Labels> = {
  az: {
    nav: 'Əsas menyu', breadcrumb: 'Naviqasiya yolu', visas: 'Viza növləri', services: 'Xidmətlər', guides: 'Bələdçilər', news: 'Son xəbərlər',
    jobs: 'Açıq vakansiyalar', events: 'Yaxın tədbirlər', faq: 'Tez-tez verilən suallar', requirements: 'Tələblər', documents: 'Sənədlər',
    features: 'Nələr daxildir', steps: 'Necə işləyir', related: 'Digər bələdçilər', contents: 'Mündəricat', updated: 'Son yenilənmə',
    cta: 'Pulsuz konsultasiya təyin edin', eligibility: 'Viza testindən keçin', languages: 'Dillər', phone: 'Telefon', email: 'E-poçt', hours: 'İş saatları', more: 'Ətraflı',
  },
  de: {
    nav: 'Hauptnavigation', breadcrumb: 'Brotkrümelnavigation', visas: 'Visumarten', services: 'Leistungen', guides: 'Ratgeber', news: 'Aktuelle News',
    jobs: 'Offene Stellen', events: 'Nächste Veranstaltungen', faq: 'Häufige Fragen', requirements: 'Voraussetzungen', documents: 'Unterlagen',
    features: 'Leistungsumfang', steps: 'So funktioniert es', related: 'Weitere Ratgeber', contents: 'Inhalt', updated: 'Zuletzt aktualisiert',
    cta: 'Kostenlose Beratung buchen', eligibility: 'Zum Visum-Check', languages: 'Sprachen', phone: 'Telefon', email: 'E-Mail', hours: 'Öffnungszeiten', more: 'Mehr erfahren',
  },
  en: {
    nav: 'Main navigation', breadcrumb: 'Breadcrumb', visas: 'Visa types', services: 'Services', guides: 'Guides', news: 'Latest news',
    jobs: 'Open jobs', events: 'Upcoming events', faq: 'Frequently asked questions', requirements: 'Requirements', documents: 'Documents',
    features: 'What is included', steps: 'How it works', related: 'More guides', contents: 'Contents', updated: 'Last updated',
    cta: 'Book a free consultation', eligibility: 'Take the visa check', languages: 'Languages', phone: 'Phone', email: 'E-mail', hours: 'Opening hours', more: 'Learn more',
  },
  ru: {
    nav: 'Главное меню', breadcrumb: 'Навигационная цепочка', visas: 'Виды виз', services: 'Услуги', guides: 'Гиды', news: 'Последние новости',
    jobs: 'Открытые вакансии', events: 'Ближайшие мероприятия', faq: 'Частые вопросы', requirements: 'Требования', documents: 'Документы',
    features: 'Что входит', steps: 'Как это работает', related: 'Другие гиды', contents: 'Содержание', updated: 'Обновлено',
    cta: 'Записаться на бесплатную консультацию', eligibility: 'Пройти подбор визы', languages: 'Языки', phone: 'Телефон', email: 'E-mail', hours: 'Часы работы', more: 'Подробнее',
  },
  tr: {
    nav: 'Ana menü', breadcrumb: 'Sayfa yolu', visas: 'Vize türleri', services: 'Hizmetler', guides: 'Rehberler', news: 'Son haberler',
    jobs: 'Açık pozisyonlar', events: 'Yaklaşan etkinlikler', faq: 'Sıkça sorulan sorular', requirements: 'Şartlar', documents: 'Belgeler',
    features: 'Neler dahil', steps: 'Nasıl işler', related: 'Diğer rehberler', contents: 'İçindekiler', updated: 'Son güncelleme',
    cta: 'Ücretsiz danışmanlık alın', eligibility: 'Vize testini yapın', languages: 'Diller', phone: 'Telefon', email: 'E-posta', hours: 'Çalışma saatleri', more: 'Ayrıntılar',
  },
  uk: {
    nav: 'Головне меню', breadcrumb: 'Навігаційний ланцюжок', visas: 'Види віз', services: 'Послуги', guides: 'Посібники', news: 'Останні новини',
    jobs: 'Відкриті вакансії', events: 'Найближчі заходи', faq: 'Часті запитання', requirements: 'Вимоги', documents: 'Документи',
    features: 'Що входить', steps: 'Як це працює', related: 'Інші посібники', contents: 'Зміст', updated: 'Оновлено',
    cta: 'Записатися на безкоштовну консультацію', eligibility: 'Пройти підбір візи', languages: 'Мови', phone: 'Телефон', email: 'E-mail', hours: 'Години роботи', more: 'Докладніше',
  },
};

const LANGUAGE_NAMES: Record<SeoLocale, string> = { az: 'Azərbaycan', de: 'Deutsch', en: 'English', ru: 'Русский', tr: 'Türkçe', uk: 'Українська' };

const NAV = ['/visas', '/services', '/jobs', '/guides', '/ausbildung', '/news', '/about', '/contact'];
const TOOLS = ['/eligibility', '/chancenkarte-calculator', '/blue-card-check', '/salary-calculator', '/anerkennung', '/calculator', '/cities'];
const FOOTER = ['/booking', '/cooperation', '/faq', '/partners', '/stories', '/events', '/impressum', '/privacy', '/accessibility'];

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => collapse(p))
    .filter(Boolean)
    .map((p) => `<p>${e(p)}</p>`)
    .join('');

const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${e(i)}</li>`).join('')}</ul>` : '');

const section = (heading: string, inner: string) => (inner ? `<section><h2>${e(heading)}</h2>${inner}</section>` : '');

const asRecord = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const renderBody = (rawPath: string, data: SeoData): string => {
  const { path, lng } = requestTarget(rawPath, null);
  const page = resolvePage(path, lng, data);
  if (!page.index) return '';
  const t = L[lng];
  const href = (p: string, l: SeoLocale = lng) => e(localizedPath(p, l));
  const link = (p: string, label: string, l: SeoLocale = lng) => `<a href="${href(p, l)}">${e(label)}</a>`;
  const staticLabel = (p: string) => (STATIC_PAGES[p] ? textIn(STATIC_PAGES[p].name, lng) : p);
  const linkList = (paths: string[]) => `<ul>${paths.filter((p) => STATIC_PAGES[p]).map((p) => `<li>${link(p, staticLabel(p))}</li>`).join('')}</ul>`;
  const h1 = collapse(page.title.replace(/ \| Triad Vision$/, ''));

  // Language versions of this exact page (guides: each language's own slug).
  const alt =
    page.alternates === undefined
      ? Object.fromEntries(SEO_LOCALES.map((l) => [l, path]))
      : page.alternates === null
        ? {}
        : page.alternates;
  const languages = SEO_LOCALES.filter((l) => alt[l])
    .map((l) => `<li><a href="${href(alt[l] as string, l)}" hreflang="${l}" lang="${l}">${e(LANGUAGE_NAMES[l])}</a></li>`)
    .join('');

  const out: string[] = [];
  out.push(
    `<header><p><a href="${href('/')}"><strong>${e(SITE_NAME)}</strong></a></p>`,
    `<nav aria-label="${e(t.nav)}">${linkList(NAV)}</nav>`,
    languages ? `<nav aria-label="${e(t.languages)}"><ul>${languages}</ul></nav>` : '',
    '</header>',
    '<main>',
  );
  if (page.crumbs.length) {
    out.push(`<nav aria-label="${e(t.breadcrumb)}"><ol>${page.crumbs.map((c, i) => `<li>${i === page.crumbs.length - 1 ? e(c.name) : link(c.path, c.name)}</li>`).join('')}</ol></nav>`);
  }

  const visas = indexable(data.visas);
  const services = indexable(data.services);
  const posts = indexable(data.posts);
  const jobs = liveJobs(data);
  const guides = guidesInLanguage(data, lng);
  const visaList = () =>
    `<ul>${visas.map((v) => `<li>${link(`/visas/${v.slug}`, collapse(pick(v.title, lng)))}${v.visaLabel ? ` (${e(v.visaLabel)})` : ''} — ${e(collapse(pick(v.summary, lng)))}</li>`).join('')}</ul>`;
  const serviceList = () => `<ul>${services.map((s) => `<li>${link(`/services/${s.slug}`, collapse(pick(s.title, lng)))} — ${e(collapse(pick(s.summary, lng)))}</li>`).join('')}</ul>`;
  const guideList = (items: GuideRow[]) =>
    `<ul>${items.map((g) => `<li>${link(guidePath(g.slug), g.title, g.locale as SeoLocale)} — ${e(g.description)}</li>`).join('')}</ul>`;
  const postList = (n: number) =>
    `<ul>${posts.slice(0, n).map((p) => `<li>${link(`/news/${p.slug}`, collapse(pick(p.title, lng)))} <time datetime="${p.publishedAt.toISOString().slice(0, 10)}">${p.publishedAt.toISOString().slice(0, 10)}</time></li>`).join('')}</ul>`;
  const jobList = (n: number) =>
    `<ul>${jobs.slice(0, n).map((j) => `<li>${link(`/jobs/${j.slug}`, collapse(pick(j.title, lng)))}${j.city ? ` — ${e(j.city)}` : ''}</li>`).join('')}</ul>`;
  const eventList = () =>
    `<ul>${(data.events ?? []).map((ev) => `<li>${link(`/events/${ev.slug}`, collapse(pick(ev.title, lng)))} <time datetime="${ev.startsAt.toISOString()}">${ev.startsAt.toISOString().slice(0, 10)}</time></li>`).join('')}</ul>`;
  const cta = `<p>${link('/booking', t.cta)} · ${link('/eligibility', t.eligibility)}</p>`;

  const detail = /^\/(visas|services|news|jobs|events|guides)\/([^/]+)$/.exec(path);
  if (detail) {
    const [, kind, slug] = detail;
    if (kind === 'visas') {
      const v = visas.find((x) => x.slug === slug)!;
      out.push(
        `<article><h1>${e(collapse(pick(v.title, lng)))}</h1>`,
        `<p>${e(collapse(pick(v.summary, lng)))}</p>`,
        paragraphs(pick(v.body, lng)),
        list(pickList(v.items, lng)),
        section(t.requirements, list(pickList(v.requirements, lng))),
        section(t.documents, list(pickList(v.documents, lng))),
      );
      const faq = Array.isArray(v.faq) ? (v.faq as { q?: unknown; a?: unknown }[]).map((f) => [collapse(pick(f?.q, lng)), pick(f?.a, lng)] as const).filter(([q, a]) => q && a) : [];
      if (faq.length) out.push(section(t.faq, faq.map(([q, a]) => `<h3>${e(q)}</h3>${paragraphs(a)}`).join('')));
      out.push(cta, '</article>', section(t.visas, visaList()));
    } else if (kind === 'services') {
      const s = services.find((x) => x.slug === slug)!;
      out.push(
        `<article><h1>${e(collapse(pick(s.title, lng)))}</h1>`,
        `<p>${e(collapse(pick(s.summary, lng)))}</p>`,
        paragraphs(pick(s.body, lng)),
        section(t.features, list(pickList(s.features, lng))),
        section(t.steps, pickList(s.steps, lng).length ? `<ol>${pickList(s.steps, lng).map((x) => `<li>${e(x)}</li>`).join('')}</ol>` : ''),
        cta,
        '</article>',
        section(t.services, serviceList()),
      );
    } else if (kind === 'news') {
      const p = posts.find((x) => x.slug === slug)!;
      out.push(
        `<article><h1>${e(collapse(pick(p.title, lng)))}</h1>`,
        `<p><time datetime="${p.publishedAt.toISOString()}">${p.publishedAt.toISOString().slice(0, 10)}</time> · ${e(SITE_NAME)}</p>`,
        `<p><strong>${e(collapse(pick(p.excerpt, lng)))}</strong></p>`,
        paragraphs(pick(p.body, lng)),
        '</article>',
        section(t.news, postList(6)),
      );
    } else if (kind === 'jobs') {
      const j = jobs.find((x) => x.slug === slug)!;
      const salary = j.salaryMin != null || j.salaryMax != null ? `<p>${[j.salaryMin, j.salaryMax].filter((x) => x != null).join(' – ')} € / month (brutto)</p>` : '';
      out.push(
        `<article><h1>${e(collapse(pick(j.title, lng)))}${j.city ? ` — ${e(j.city)}` : ''}</h1>`,
        salary,
        paragraphs(pick(j.description, lng)),
        section(JOB_LABELS[lng].requirements, list(pickList(j.requirements, lng))),
        section(JOB_LABELS[lng].benefits, list(pickList(j.benefits, lng))),
        `<p>${link('/jobs', staticLabel('/jobs'))}</p>`,
        '</article>',
      );
    } else if (kind === 'events') {
      const ev = (data.events ?? []).find((x) => x.slug === slug)!;
      out.push(
        `<article><h1>${e(collapse(pick(ev.title, lng)))}</h1>`,
        `<p><time datetime="${ev.startsAt.toISOString()}">${ev.startsAt.toISOString().replace('T', ' ').slice(0, 16)} UTC</time>${ev.mode === 'ONLINE' ? ' · Online' : ev.address ? ` · ${e(collapse(ev.address))}` : ''}</p>`,
        paragraphs(pick(ev.description, lng)),
        '</article>',
        section(t.events, eventList()),
      );
    } else {
      const all = data.guides ?? [];
      const g = all.find((x) => x.locale === lng && x.slug === slug)!;
      const r = renderGuide(all, g);
      out.push(
        `<article><h1>${e(g.title)}</h1>`,
        `<p>${e(g.description)}</p>`,
        `<p>${e(t.updated)}: <time datetime="${r.updatedAt}">${r.updatedAt.slice(0, 10)}</time></p>`,
        r.toc.length ? `<nav aria-label="${e(t.contents)}"><ol>${r.toc.map((x) => `<li><a href="#${e(x.id)}">${e(x.text)}</a></li>`).join('')}</ol></nav>` : '',
        r.html, // rendered by lib/guides/markdown.ts: all source text escaped
        r.faq.length ? section(t.faq, r.faq.map((f) => `<h3>${e(f.q)}</h3><p>${e(f.a)}</p>`).join('')) : '',
        cta,
        '</article>',
        r.related.length ? section(t.related, `<ul>${r.related.map((x) => `<li><a href="${e(x.path)}">${e(x.title)}</a></li>`).join('')}</ul>`) : '',
      );
    }
  } else if (path.startsWith('/l/')) {
    out.push(`<h1>${e(h1)}</h1>`, `<p>${e(page.description)}</p>`, cta);
  } else {
    out.push(`<h1>${e(h1)}</h1>`, `<p>${e(page.description)}</p>`);
    switch (path) {
      case '/':
        out.push(
          cta,
          section(t.visas, visaList()),
          section(t.services, serviceList()),
          section(t.guides, guideList(guides)),
          jobs.length ? section(t.jobs, jobList(8)) : '',
          posts.length ? section(t.news, postList(5)) : '',
          (data.events ?? []).length ? section(t.events, eventList()) : '',
        );
        break;
      case '/visas':
        out.push(visaList(), section(t.guides, guideList(guides)), cta);
        break;
      case '/services':
        out.push(serviceList(), cta);
        break;
      case '/guides':
        out.push(guideList(guides), cta);
        break;
      case '/news':
        out.push(postList(50), section(t.guides, guideList(guides)));
        break;
      case '/jobs':
        out.push(jobList(200), cta);
        break;
      case '/events':
        out.push(eventList(), cta);
        break;
      case '/faq': {
        const faqs = data.faqs.map((f) => [collapse(pick(f.question, lng)), pick(f.answer, lng)] as const).filter(([q, a]) => q && a);
        out.push(faqs.map(([q, a]) => `<h2>${e(q)}</h2>${paragraphs(a)}`).join(''), cta);
        break;
      }
      case '/ausbildung':
      case '/eligibility':
      case '/uygunluq-testi':
      case '/chancenkarte-calculator':
      case '/blue-card-check':
      case '/anerkennung':
        out.push(section(t.guides, guideList(guides)), cta);
        break;
      default:
        out.push(cta);
    }
    if (TOOLS.includes(path) || path === '/') out.push(section(staticLabel('/eligibility'), linkList(TOOLS)));
  }
  out.push('</main>');

  // Footer with NAP (name, address, phone) from the contact settings.
  const contact = asRecord(data.settings.contact);
  const offices = Array.isArray(contact.offices) ? (contact.offices as Record<string, unknown>[]) : [];
  const nap: string[] = [`<p><strong>${e(SITE_NAME)}</strong></p>`];
  for (const o of offices) {
    if (typeof o?.address !== 'string') continue;
    const city = pick(o.city, lng);
    nap.push(`<address>${city ? `${e(city)}: ` : ''}${e(collapse(o.address))}</address>`);
  }
  const phone = typeof contact.phone === 'string' ? contact.phone : '';
  const email = typeof contact.email === 'string' ? contact.email : '';
  if (phone) nap.push(`<p>${e(t.phone)}: <a href="tel:${e(phone.replace(/[^\d+]/g, ''))}">${e(phone)}</a></p>`);
  if (email) nap.push(`<p>${e(t.email)}: <a href="mailto:${e(email)}">${e(email)}</a></p>`);
  const hours = pick(contact.hours, lng);
  if (hours) nap.push(`<p>${e(t.hours)}: ${e(hours)}</p>`);
  out.push(`<footer>${nap.join('')}<nav aria-label="${e(t.more)}">${linkList(FOOTER)}</nav></footer>`);

  return `<div class="ssr" lang="${lng}">${out.filter(Boolean).join('\n')}</div>`;
};

/** Body for a path, cached with the other SEO output (cleared on CMS writes). Unknown paths are not cached. */
export const getBody = async (rawPath: string, data: SeoData) => {
  const { path, lng } = requestTarget(rawPath, null);
  if (!resolvePage(path, lng, data).index) return '';
  return cached(`seo:body:${lng}:${path}`, async () => renderBody(rawPath, data));
};
