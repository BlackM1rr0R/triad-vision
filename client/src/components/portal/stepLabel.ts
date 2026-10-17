import type { TFunction } from 'i18next';

/**
 * Label of a case step in the portal stepper. The contract step is named after the kind of
 * application (employment / Ausbildung / service contract) when the case knows it.
 */
export const stepLabel = (t: TFunction, key: string, visaType?: string | null) =>
  key === 'contract' && visaType ? t(`portal.contractByType.${visaType}`, { defaultValue: t('portal.steps.contract') }) : t(`portal.steps.${key}`);
