import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { usePageTitle } from '@/lib/usePageTitle';
import { Lost } from '@/components/illustrations';

export default function NotFound() {
  const { t } = useTranslation();
  usePageTitle(t('notFound.title'));
  return (
    <section className="grid min-h-[90vh] place-items-center bg-canvas px-4 pt-28 pb-16 text-center">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mx-auto max-w-xl">
        <Lost animated className="mx-auto w-56 sm:w-72" />
        <p className="mt-6 font-display text-sm font-semibold tracking-[0.2em] text-highlight-fg">404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">{t('notFound.title')}</h1>
        <p className="mx-auto mt-4 max-w-[52ch] text-base leading-relaxed text-muted">{t('notFound.text')}</p>
        <div className="mt-8">
          <Link to="/" className="btn-primary btn-press btn-lg">
            <ArrowLeft className="size-4" aria-hidden /> {t('notFound.home')}
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
