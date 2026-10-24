/** Calculator types a guide body can embed (`::calculator{type="…"}`); mirrors server/src/lib/guides/calculators.ts. */
export const GUIDE_CALCULATOR_TYPES = ['chancenkarte', 'blue-card', 'cost', 'salary'] as const;
export type GuideCalculatorType = (typeof GUIDE_CALCULATOR_TYPES)[number];
