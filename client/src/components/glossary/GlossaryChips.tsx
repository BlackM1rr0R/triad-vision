import { Link } from 'react-router-dom';
import { BookA } from 'lucide-react';

/**
 * German terms of the glossary (/glossary/:slug, server lib/glossary/terms) used by the public explainers
 * (/german-apartment, /residence-card-explained, /shortage-barometer). The term is shown in German, as in the
 * glossary; unknown slugs fall back to a readable form of the slug.
 */
const TERMS: Record<string, string> = {
  anmeldung: 'Anmeldung',
  wohnungsgeberbestaetigung: 'Wohnungsgeberbestätigung',
  einschreiben: 'Einschreiben',
  frist: 'Frist',
  bescheid: 'Bescheid',
  uebergabeprotokoll: 'Übergabeprotokoll',
  hausverwaltung: 'Hausverwaltung',
  vermieter: 'Vermieter',
  hausordnung: 'Hausordnung',
  ruhezeiten: 'Ruhezeiten',
  pfand: 'Pfand',
  muelltrennung: 'Mülltrennung',
  kaution: 'Kaution',
  mietvertrag: 'Mietvertrag',
  nebenkosten: 'Nebenkosten',
  nebenkostenabrechnung: 'Nebenkostenabrechnung',
  warmmiete: 'Warmmiete',
  kaltmiete: 'Kaltmiete',
  stromvertrag: 'Stromvertrag',
  rundfunkbeitrag: 'Rundfunkbeitrag',
  hausratversicherung: 'Hausratversicherung',
  haftpflichtversicherung: 'Haftpflichtversicherung',
  schoenheitsreparaturen: 'Schönheitsreparaturen',
  notruf: 'Notruf',
  lastschrift: 'Lastschrift',
  aufenthaltstitel: 'Aufenthaltstitel',
  'elektronischer-aufenthaltstitel': 'Elektronischer Aufenthaltstitel',
  aufenthaltserlaubnis: 'Aufenthaltserlaubnis',
  niederlassungserlaubnis: 'Niederlassungserlaubnis',
  'blaue-karte-eu': 'Blaue Karte EU',
  fiktionsbescheinigung: 'Fiktionsbescheinigung',
  auslaenderbehoerde: 'Ausländerbehörde',
  nebenbestimmung: 'Nebenbestimmung',
  beschaeftigungserlaubnis: 'Beschäftigungserlaubnis',
  aufenthaltsgesetz: 'Aufenthaltsgesetz',
  reisepass: 'Reisepass',
  buergeramt: 'Bürgeramt',
  ummeldung: 'Ummeldung',
  termin: 'Termin',
  antrag: 'Antrag',
  anerkennung: 'Anerkennung',
  kenntnispruefung: 'Kenntnisprüfung',
  anerkennungspartnerschaft: 'Anerkennungspartnerschaft',
  probezeit: 'Probezeit',
  schichtarbeit: 'Schichtarbeit',
  'fuehrerschein-umschreibung': 'Führerschein-Umschreibung',
  arbeitszeit: 'Arbeitszeit',
  handwerkskammer: 'Handwerkskammer',
  ihk: 'IHK',
  arbeitsvertrag: 'Arbeitsvertrag',
  zeitarbeit: 'Zeitarbeit',
  minijob: 'Minijob',
  kita: 'Kita',
  berufserlaubnis: 'Berufserlaubnis',
  'bundesagentur-fuer-arbeit': 'Bundesagentur für Arbeit',
  'zustimmung-der-bundesagentur': 'Zustimmung der Bundesagentur',
};

export const glossaryTerm = (slug: string) =>
  TERMS[slug] ??
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export function GlossaryChips({ slugs, className }: { slugs: string[]; className?: string }) {
  if (!slugs.length) return null;
  return (
    <ul className={className ?? 'flex flex-wrap gap-2'}>
      {[...new Set(slugs)].map((s) => (
        <li key={s}>
          <Link to={`/glossary/${s}`} lang="de" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm font-medium text-ink hover:border-primary hover:text-primary">
            <BookA className="size-3.5" aria-hidden /> {glossaryTerm(s)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
