/**
 * FAQPage JSON-LD content of the German mock exam pages (/german-mock-exam, /a1, /b1) and the level
 * self-assessment (/german-level-test-self), in the page's language (the same FAQ the pages show).
 */
import { LEVEL_SELF_FAQ, MOCK_EXAM_FAQ, type FaqItem } from './faq.js';

type Lang = keyof typeof MOCK_EXAM_FAQ;

export const GERMAN_EXAM_FAQ_PAGES: Record<string, Record<Lang, FaqItem[]>> = {
  '/german-mock-exam': MOCK_EXAM_FAQ,
  '/german-mock-exam/a1': MOCK_EXAM_FAQ,
  '/german-mock-exam/b1': MOCK_EXAM_FAQ,
  '/german-level-test-self': LEVEL_SELF_FAQ,
};

/** FAQ items of `path` in `lng`, or null when the page has none. */
export const germanExamFaqFor = (path: string, lng: string): FaqItem[] | null => {
  const faq = GERMAN_EXAM_FAQ_PAGES[path];
  if (!faq) return null;
  return faq[lng as Lang] ?? faq.en;
};
