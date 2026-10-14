import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Cookie } from 'lucide-react';

const KEY = 'tv_cookie_ok';

/** Informational notice: the site only sets strictly necessary cookies, so no consent choices are needed. */
export const CookieNotice = () => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = !!localStorage.getItem(KEY);
    } catch {
      // storage blocked: show the notice each visit
    }
    if (seen) return;
    const id = window.setTimeout(() => setShow(true), 2500);
    return () => window.clearTimeout(id);
  }, []);

  const accept = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // ignore
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="fixed inset-x-3 bottom-3 z-[45] flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-2xl sm:right-auto sm:bottom-6 sm:left-6 sm:max-w-md sm:flex-row sm:items-center sm:p-5"
        >
          <span className="hidden size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 sm:grid">
            <Cookie className="size-5" />
          </span>
          <p className="flex-1 text-xs leading-relaxed text-muted">{t('cookie.text')}</p>
          <button type="button" onClick={accept} className="btn-primary btn-sm shrink-0">
            {t('cookie.accept')}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
