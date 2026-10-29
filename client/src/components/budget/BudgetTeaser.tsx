import { Link } from 'react-router-dom';
import { ArrowRight, PiggyBank } from 'lucide-react';
import clsx from 'clsx';
import { useL10n } from '@/lib/l10n';
import { budgetHref } from './api';

/*
 * Links into the first-month budget (/budget or /account/budget) from the start-date calculator, visa pages,
 * vacancy pages and the portal. Copy is inline (four languages) so embedding pages do not load the page copy.
 */
const COPY = {
  az: { eyebrow: 'İlk ay', title: 'Almaniyada ilk ay nə qədərə başa gələcək?', text: 'Xalis maaş, depozit, ilk maaşa qədər xərclər və özünüzlə gətirməli olduğunuz məbləğ.', cta: 'Büdcəni hesabla', link: 'İlk ay büdcəsi: nə qədər pul lazımdır?' },
  de: { eyebrow: 'Erster Monat', title: 'Was kostet der erste Monat in Deutschland?', text: 'Nettogehalt, Kaution, Kosten bis zum ersten Gehalt und wie viel Geld Sie mitbringen sollten.', cta: 'Budget berechnen', link: 'Budget erster Monat: wie viel Geld brauche ich?' },
  en: { eyebrow: 'First month', title: 'What will your first month in Germany cost?', text: 'Net salary, deposit, costs until the first salary and how much money to bring.', cta: 'Calculate the budget', link: 'First-month budget: how much money do I need?' },
  ru: { eyebrow: 'Первый месяц', title: 'Сколько будет стоить первый месяц в Германии?', text: 'Зарплата нетто, залог, расходы до первой зарплаты и сколько денег взять с собой.', cta: 'Рассчитать бюджет', link: 'Бюджет первого месяца: сколько нужно денег?' },
} as const;

interface Prefill {
  gross?: number | null;
  grossMax?: number | null;
  place?: string | null;
  visa?: string | null;
  /** Portal: link to /account/budget instead of the public page. */
  portal?: boolean;
}

/** Call-out section (visa detail page, start-date calculator, portal). */
export const BudgetTeaser = ({ className, ...p }: Prefill & { className?: string }) => {
  const { locale } = useL10n();
  const c = COPY[locale] ?? COPY.en;
  return (
    <section className={clsx('section-sm', className)}>
      <div className="container-x">
        <div className="card card-pad flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl chip-sage">
              <PiggyBank className="size-6" aria-hidden />
            </span>
            <div>
              <span className="eyebrow">{c.eyebrow}</span>
              <p className="mt-1 font-display text-lg font-bold text-ink">{c.title}</p>
              <p className="mt-1 text-sm text-muted">{c.text}</p>
            </div>
          </div>
          <Link to={budgetHref({ ...p, base: p.portal ? '/account/budget' : '/budget' })} className="btn-ghost group shrink-0 px-5 py-3">
            {c.cta} <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
};

/** Compact text link (vacancy fact box, portal cards). */
export const BudgetLink = ({ className, ...p }: Prefill & { className?: string }) => {
  const { locale } = useL10n();
  const c = COPY[locale] ?? COPY.en;
  return (
    <Link
      to={budgetHref({ ...p, base: p.portal ? '/account/budget' : '/budget' })}
      className={clsx('inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-link hover:underline focus-visible:underline', className)}
    >
      <PiggyBank className="size-3.5" aria-hidden /> {c.link}
    </Link>
  );
};

export default BudgetTeaser;
