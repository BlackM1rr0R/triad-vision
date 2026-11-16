import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Coins, Landmark, Mic, Recycle, TriangleAlert, type LucideIcon } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesGames } from '@/i18n/pagesGames';

registerCopy(pagesGames);

/** The five learning games, in the order of the tools hub (keys: games.items.<key>). */
export const GAMES: { key: 'simulator' | 'pronunciation' | 'price' | 'signs' | 'waste'; to: string; icon: LucideIcon }[] = [
  { key: 'simulator', to: '/german-simulator', icon: Landmark },
  { key: 'pronunciation', to: '/pronunciation', icon: Mic },
  { key: 'price', to: '/price-game', icon: Coins },
  { key: 'signs', to: '/traffic-signs', icon: TriangleAlert },
  { key: 'waste', to: '/waste-sorting', icon: Recycle },
];

/** Cards linking the games (all but `current`), under each game and on the portal German page. */
export const GameLinks = ({ current, title, text }: { current?: string; title?: string; text?: string }) => {
  const { t } = useTranslation();
  const list = GAMES.filter((g) => g.to !== current);
  return (
    <section aria-labelledby="games-more-h" className="space-y-3">
      <h2 id="games-more-h" className="font-display text-lg font-semibold text-ink">
        {title ?? t('games.more')}
      </h2>
      {text && <p className="text-sm text-muted">{text}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((g) => (
          <li key={g.key}>
            <Link to={g.to} className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-line-strong hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
                <g.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-semibold text-ink">
                  {t(`games.items.${g.key}.title`)} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{t(`games.items.${g.key}.text`)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
