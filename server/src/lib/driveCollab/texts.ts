import type { Locale } from '@prisma/client';

/** Notification texts of drive collaboration, in the recipient's language. */
interface Catalog {
  mention: (p: { actor: string; name: string; excerpt: string }) => { title: string; body: string };
  linkUpload: (p: { label: string; file: string; folder: string }) => { title: string; body: string };
  cta: string;
  unnamedLink: string;
}

const az: Catalog = {
  mention: (p) => ({ title: `${p.actor} sizi «${p.name}» faylında qeyd etdi`, body: p.excerpt }),
  linkUpload: (p) => ({ title: `Link vasitəsilə yeni fayl: ${p.file}`, body: `«${p.label}» linki ilə «${p.folder}» qovluğuna fayl yükləndi.` }),
  cta: 'Fayla bax',
  unnamedLink: 'adsız link',
};
const de: Catalog = {
  mention: (p) => ({ title: `${p.actor} hat Sie bei „${p.name}“ erwähnt`, body: p.excerpt }),
  linkUpload: (p) => ({ title: `Neue Datei über Link: ${p.file}`, body: `Über den Link „${p.label}“ wurde eine Datei in „${p.folder}“ hochgeladen.` }),
  cta: 'Datei ansehen',
  unnamedLink: 'Link ohne Namen',
};
const en: Catalog = {
  mention: (p) => ({ title: `${p.actor} mentioned you on “${p.name}”`, body: p.excerpt }),
  linkUpload: (p) => ({ title: `New file via link: ${p.file}`, body: `A file was uploaded to “${p.folder}” through the link “${p.label}”.` }),
  cta: 'Open file',
  unnamedLink: 'unnamed link',
};
const ru: Catalog = {
  mention: (p) => ({ title: `${p.actor} упомянул(а) вас в «${p.name}»`, body: p.excerpt }),
  linkUpload: (p) => ({ title: `Новый файл по ссылке: ${p.file}`, body: `По ссылке «${p.label}» в папку «${p.folder}» загружен файл.` }),
  cta: 'Открыть файл',
  unnamedLink: 'ссылка без названия',
};

const catalogs: Record<Locale, Catalog> = { az, de, en, ru } as Record<Locale, Catalog>;
export const collabTexts = (locale: Locale | null | undefined): Catalog => (locale && catalogs[locale]) || az;
