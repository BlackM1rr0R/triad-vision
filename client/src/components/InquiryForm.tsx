import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { useSiteContent } from '@/lib/content';
import { Spinner } from './ui/Spinner';

/** Contact form or company cooperation request. Posts to /api/public/inquiries, which emails the team. */
export const InquiryForm = ({ kind }: { kind: 'company' | 'contact' }) => {
  const { t } = useTranslation();
  const { locale, tr } = useL10n();
  const { data } = useSiteContent();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { kind, locale };
    fd.forEach((v, k) => {
      if (typeof v === 'string' && v.trim() !== '') body[k] = v.trim();
    });
    setSending(true);
    try {
      await api.post('/public/inquiries', body);
      setSent(true);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {sent ? (
        <motion.div key="ok" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-12 text-center">
          <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', delay: 0.1 }} className="grid size-20 place-items-center rounded-full bg-emerald-100 text-success">
            <CheckCircle2 className="size-10" />
          </motion.span>
          <p className="mt-6 max-w-sm text-lg font-semibold text-navy-900">{t('form.sent')}</p>
        </motion.div>
      ) : (
        <motion.form key="form" onSubmit={submit} exit={{ opacity: 0, y: -10 }} className="grid gap-4 sm:grid-cols-2">
          {/* honeypot for bots */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          {kind === 'company' && (
            <div className="sm:col-span-2">
              <label className="label" htmlFor="companyName">{t('form.company')} *</label>
              <input id="companyName" name="companyName" required maxLength={160} className="input" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="contactName">{t('form.name')} *</label>
            <input id="contactName" name="contactName" required minLength={2} maxLength={120} className="input" autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="email">{t('form.email')} *</label>
            <input id="email" name="email" type="email" required className="input" autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="phone">{t('form.phone')}</label>
            <input id="phone" name="phone" type="tel" maxLength={40} className="input" autoComplete="tel" />
          </div>
          {kind === 'company' ? (
            <>
              <div>
                <label className="label" htmlFor="workersNeeded">{t('form.workers')}</label>
                <input id="workersNeeded" name="workersNeeded" type="number" min={1} max={10000} className="input" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="sector">{t('form.sector')}</label>
                <select id="sector" name="sector" className="input" defaultValue="">
                  <option value="">—</option>
                  {data?.visaCategories.map((v) => (
                    <option key={v.id} value={tr(v.title)}>
                      {tr(v.title)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div />
          )}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="message">{t('form.message')} *</label>
            <textarea id="message" name="message" required minLength={5} maxLength={5000} rows={5} className="input resize-y" />
          </div>
          <label className="flex items-start gap-2.5 text-xs text-muted sm:col-span-2">
            <input type="checkbox" required className="mt-0.5 size-4 accent-brand-600" />
            {t('form.privacy')}
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={sending} className="btn-primary w-full sm:w-auto">
              {sending ? <Spinner className="size-4" /> : <Send className="size-4" />}
              {sending ? t('form.sending') : t('form.send')}
            </button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
};
