import type { TranslationService } from '@prisma/client';

/**
 * Service kinds of the ARCHIVED translation orders (filter in Admin → Translation orders). Triad Vision no longer
 * offers translation, apostille or notarisation: the client order flow and the price list (Setting
 * `translationPricing`) were removed; only orders received earlier are kept for staff to close.
 */
export const SERVICES = ['TRANSLATION', 'APOSTILLE', 'TRANSLATION_APOSTILLE', 'NOTARY'] as const satisfies readonly TranslationService[];
