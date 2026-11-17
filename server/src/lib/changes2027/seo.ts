import { SITE_NAME } from '../seoCatalogue.js';
import { changesPage, CHANGES_AS_OF } from './content.js';

/**
 * Crawlable body (lib/seoBody.ts) and JSON-LD (lib/seo.ts: Article + FAQPage) of /changes-2027, from the same
 * data as the page (changesPage → data freshness registry). Escaping: `link` escapes; texts go through `e`.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const CHANGES_PATH = '/changes-2027';

export const changes2027Body = (lng: string, link: (path: string, label: string) => string): string[] => {
  const p = changesPage(lng);
  const L = p.texts.labels;
  const out: string[] = [`<p>${esc(p.texts.intro)}</p>`, `<p>${esc(L.asOf)}: <time datetime="${p.asOf}">${p.asOf}</time></p>`];
  out.push(
    `<table><caption>${esc(p.texts.h1)}</caption><thead><tr><th scope="col">${esc(L.toc)}</th><th scope="col">${esc(L.before)}</th><th scope="col">${esc(L.after)}</th><th scope="col">${esc(L.status)}</th></tr></thead><tbody>`,
    p.items.map((i) => `<tr><th scope="row">${esc(i.title)}</th><td>${esc(i.before)}</td><td>${esc(i.after)}</td><td>${esc(i.statusName)}</td></tr>`).join(''),
    '</tbody></table>',
  );
  for (const i of p.items) {
    const tools = i.tools.map((t) => link(t.path, t.label)).join(' · ');
    const terms = i.glossary.map((g) => link(`/glossary/${g.slug}`, g.term)).join(' · ');
    out.push(
      `<section id="${esc(i.id)}"><h2>${esc(i.title)}</h2>`,
      `<p>${esc(L.before)}: <strong>${esc(i.before)}</strong> → ${esc(L.after)}: <strong>${esc(i.after)}</strong></p>`,
      `<p>${esc(L.status)}: ${esc(i.statusName)} — ${esc(i.statusLabel)}</p>`,
      `<p>${esc(L.affects)}: ${esc(i.affects.map((a) => p.texts.affects[a]).join(', '))}</p>`,
      `<p>${esc(i.text)}</p>`,
      `<p>${esc(L.source)}: <a href="${esc(i.source.url)}" rel="nofollow noopener">${esc(i.source.label)}</a></p>`,
      tools ? `<p>${esc(L.tools)}: ${tools}</p>` : '',
      terms ? `<p>${esc(L.glossary)}: ${terms}</p>` : '',
      '</section>',
    );
  }
  out.push(`<section><h2>${esc(L.also)}</h2><ul>${p.texts.also.map((a) => `<li>${esc(a)}</li>`).join('')}</ul><p>${link('/holiday-planner', p.holidayPlanner)}</p></section>`);
  out.push(`<section><h2>${esc(L.faq)}</h2>${p.texts.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>`);
  out.push(`<p><small>${esc(L.disclaimer)}</small></p>`);
  return out;
};

/** Article + FAQPage JSON-LD (publisher / author ids from the caller). */
export const changes2027Ld = (lng: string, url: string, image: string, publisher: { '@id': string }, authorUrl: string) => {
  const p = changesPage(lng);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: p.texts.h1,
      description: p.texts.intro.slice(0, 300),
      image: [image],
      datePublished: '2026-11-17',
      dateModified: CHANGES_AS_OF,
      inLanguage: p.lng,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      about: p.items.map((i) => ({ '@type': 'Thing', name: i.title })),
      author: { '@type': 'Organization', name: SITE_NAME, url: authorUrl },
      publisher,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: p.lng,
      mainEntity: p.texts.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];
};
