import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { usePageTitle } from '@/lib/usePageTitle';

export default function NotFound() {
  const { t } = useTranslation();
  usePageTitle(t('notFound.title'));
  return (
    <section className="relative grid min-h-[90vh] place-items-center overflow-hidden bg-navy-950 px-4 pt-24 text-center text-white">
      <motion.p
        className="font-display text-[34vw] leading-none font-black text-white/5 sm:text-[20rem]"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      >
        404
      </motion.p>
      <div className="absolute inset-0 grid place-items-center px-4">
        <div>
          <motion.h1 initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="font-display text-4xl font-extrabold">
            {t('notFound.title')}
          </motion.h1>
          <motion.p initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="mt-4 text-white/70">
            {t('notFound.text')}
          </motion.p>
          <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="mt-8">
            <Link to="/" className="btn-primary">
              <ArrowLeft className="size-4" /> {t('notFound.home')}
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
