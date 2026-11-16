import type { ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { pagesEmbeds } from '@/i18n/pagesEmbeds';
import { isEmbedWidget, type EmbedWidget } from '@/lib/embeds';
import { useToolView } from '@/lib/toolAnalytics';
import { usePageTitle } from '@/lib/usePageTitle';
import SalaryEmbed from '@/components/embed/SalaryEmbed';
import BlueCardEmbed from '@/components/embed/BlueCardEmbed';
import WhichCityEmbed from '@/components/embed/WhichCityEmbed';

registerCopy(pagesEmbeds);

const WIDGETS: Record<EmbedWidget, ComponentType> = {
  'salary-calculator': SalaryEmbed,
  'blue-card-check': BlueCardEmbed,
  'which-city': WhichCityEmbed,
};

/**
 * /embed/:widget — an embeddable widget for other websites' iframes (lib/embeds.ts). Outside the site layout:
 * no header, footer, cookie banner or site extras. Views are counted as `tool_embed_view` of the tool.
 */
export default function EmbedPage() {
  const { t } = useTranslation();
  const { widget } = useParams();
  const known = isEmbedWidget(widget) ? widget : null;
  usePageTitle(known ? t(`embeds.names.${known}`) : t('embeds.unknown'));
  useToolView(known ?? '', 'embed_view');
  if (!known) return <p className="p-4 text-sm text-muted">{t('embeds.unknown')}</p>;
  const W = WIDGETS[known];
  return <W />;
}
