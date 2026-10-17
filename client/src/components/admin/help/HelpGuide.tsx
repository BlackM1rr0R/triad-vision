import { useTranslation } from 'react-i18next';
import { CheckCircle2, Lightbulb, UserCheck } from 'lucide-react';
import type { HelpKey } from './helpKeys';

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** One guide: what the page is for, who uses it, step-by-step how-tos and tips. */
export const HelpGuide = ({ helpKey, compact }: { helpKey: HelpKey; compact?: boolean }) => {
  const { t, i18n } = useTranslation();
  const base = `adminHelp.${helpKey}`;
  if (!i18n.exists(`${base}.title`)) return <p className="text-sm text-muted">{t('adminHelpUi.missing')}</p>;
  const steps = list(t(`${base}.steps`, { returnObjects: true }));
  const tips = list(t(`${base}.tips`, { returnObjects: true }));
  return (
    <div className="space-y-5 text-sm leading-relaxed text-ink">
      {!compact && <h3 className="font-display text-lg font-bold text-ink">{t(`${base}.title`)}</h3>}
      <p className="text-[15px]">{t(`${base}.summary`)}</p>
      {i18n.exists(`${base}.who`) && (
        <p className="flex items-start gap-2 rounded-xl bg-surface px-3.5 py-2.5 text-[13px] text-ink/80">
          <UserCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          <span>
            <span className="font-semibold text-ink">{t('adminHelpUi.who')}: </span>
            {t(`${base}.who`)}
          </span>
        </p>
      )}
      {steps.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t('adminHelpUi.how')}</h4>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {tips.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t('adminHelpUi.tips')}</h4>
          <ul className="space-y-2">
            {tips.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                {i === 0 ? <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />}
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
