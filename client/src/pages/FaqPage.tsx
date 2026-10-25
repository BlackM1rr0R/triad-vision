import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowRight, MessageCircle, Search, Sparkles, UserPlus } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { FaqList } from '@/components/cards';
import { Reveal } from '@/components/motion';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchEmpty } from '@/components/illustrations';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';

type Audience = 'all' | 'company' | 'candidate';

/** Lower-case and strip diacritics so "dil" finds "Dil", "sürücü" finds "surucu", etc. */
const norm = (s: string) =>
  s
    .toLocaleLowerCase()
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

export default function FaqPage() {
  const { t } = useTranslation();
  usePageTitle(t('faq.title'));
  const { tr } = useL10n();
  const { data } = useSiteContent();
  const [tab, setTab] = useState<Audience>('all');
  const [query, setQuery] = useState('');
  const q = useDeferredValue(norm(query.trim()));
  const tabs: Audience[] = ['all', 'candidate', 'company'];

  const items = useMemo(
    () =>
      (data?.faqs ?? [])
        .filter((f) => tab === 'all' || f.audience === tab || f.audience === 'all')
        .filter((f) => !q || norm(`${tr(f.question)} ${tr(f.answer)}`).includes(q)),
    [data?.faqs, tab, q, tr],
  );

  return (
    <>
      <PageHero title={t('faq.title')} subtitle={t('faq.subtitle')} image="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=2000&q=70" />
      <section className="section">
        <div className="container-x max-w-4xl">
          <div className="section-head flex flex-col items-center gap-4">
            <label className="relative w-full max-w-xl">
              <span className="sr-only">{t('faqPage.searchPh')}</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('faqPage.searchPh')}
                className="input h-12 rounded-full pl-12 text-[0.95rem]"
              />
            </label>
            <div className="inline-flex max-w-full overflow-x-auto rounded-full border border-line bg-sunken p-1 [scrollbar-width:none]">
              {tabs.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={clsx('relative min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors sm:px-5', tab === k ? 'text-primary-contrast' : 'text-ink hover:bg-card')}
                >
                  {tab === k && <motion.span layoutId="faq-tab" className="absolute inset-0 rounded-full bg-primary" />}
                  <span className="relative">{t(`faq.${k}`)}</span>
                </button>
              ))}
            </div>
          </div>
          {items.length ? (
            <FaqList key={`${tab}-${q}`} items={items} />
          ) : (
            <EmptyState className="rounded-3xl border border-line bg-card" illustration={<SearchEmpty />} title={t('faqPage.noResults')} />
          )}
        </div>
      </section>

      <section className="pb-16 sm:pb-20 lg:pb-28">
        <div className="container-x max-w-4xl">
          <Reveal>
            <div className="card card-pad grid gap-6 rounded-3xl sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <span className="grid size-11 place-items-center rounded-xl chip-soft">
                  <Sparkles className="size-5" />
                </span>
                <h2 className="mt-4 font-display text-2xl font-semibold text-ink">{t('faqPage.stillTitle')}</h2>
                <p className="mt-2 text-muted">{t('faqPage.stillText')}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-1">
                <Link to="/eligibility" className="btn-primary group">
                  {t('faqPage.quiz')} <ArrowRight className="size-4" />
                </Link>
                <Link to="/register" className="btn-secondary">
                  <UserPlus className="size-4" /> {t('faqPage.register')}
                </Link>
                <Link to="/contact" className="btn-secondary">
                  <MessageCircle className="size-4" /> {t('faqPage.contact')}
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
