import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesClientPlus } from '@/i18n/pagesClientPlus';

registerCopy(pagesClientPlus);

const PAGE_KEYS = ['title', 'appointment', 'caseNo', 'holder', 'when', 'place', 'documents', 'savedAt', 'empty', 'back', 'open'] as const;

/** Who saves (index owner) and the static offline page's copy in the user's language. */
export const useOfflineWho = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  const labels = Object.fromEntries(PAGE_KEYS.map((k) => [k, t(`cplus.offline.page.${k}`, { date: '{date}' })]));
  labels.privacy = t('cplus.offline.privacy');
  return { userId: user.id, holder: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(), lang: (i18n.resolvedLanguage ?? 'az').slice(0, 2), labels };
};

/** navigator.onLine, live. */
export const useOnline = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
};
