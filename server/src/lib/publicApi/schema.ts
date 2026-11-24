import { API_LANGS, API_VERSION } from './vacancies.js';

/** JSON Schema (draft 2020-12) of GET /api/public/v1/vacancies — served at /api/public/v1/schema.json. */
export const vacancyListSchema = (baseUrl: string) => {
  const str = { type: 'string' };
  const nstr = { type: ['string', 'null'] };
  const nint = { type: ['integer', 'null'] };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${baseUrl.replace(/\/$/, '')}/api/public/v1/schema.json`,
    title: 'Triad Vision public vacancy API: vacancy list',
    version: API_VERSION,
    type: 'object',
    required: ['items', 'page', 'pageSize', 'total'],
    properties: {
      items: { type: 'array', items: { $ref: '#/$defs/vacancy' } },
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      total: { type: 'integer', minimum: 0 },
    },
    $defs: {
      vacancy: {
        type: 'object',
        required: ['id', 'slug', 'language', 'title', 'description', 'url', 'applyUrl', 'country', 'employmentType', 'positions'],
        properties: {
          id: str,
          slug: str,
          language: { enum: [...API_LANGS] },
          title: str,
          description: { ...str, description: 'Plain text with line breaks.' },
          requirements: { type: 'array', items: str },
          benefits: { type: 'array', items: str },
          profession: nstr,
          professionKey: { ...nstr, description: 'Canonical profession key, e.g. truck_driver, nurse, cook, electrician.' },
          sector: nstr,
          city: nstr,
          country: { const: 'DE' },
          germanLevel: { type: ['string', 'null'], enum: ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', null], description: 'Minimum German level.' },
          minExperienceYears: nint,
          drivingLicence: nstr,
          salary: {
            type: ['object', 'null'],
            properties: { min: nint, max: nint, currency: { const: 'EUR' }, period: { const: 'MONTH' }, gross: { const: true } },
          },
          positions: { type: 'integer' },
          employmentType: { enum: ['FULL_TIME', 'PART_TIME', 'SEASONAL', 'AUSBILDUNG'] },
          datePosted: { type: ['string', 'null'], format: 'date-time' },
          validThrough: { type: ['string', 'null'], format: 'date-time' },
          companyName: { ...nstr, description: 'Always null: employer names are not published (candidates learn them after the work contract).' },
          visaCategory: { type: ['object', 'null'], properties: { slug: str, label: str } },
          imageUrl: { type: ['string', 'null'], format: 'uri' },
          url: { type: 'string', format: 'uri' },
          applyUrl: {
            type: 'string',
            format: 'uri',
            description: 'Vacancy page with your partner attribution (ref = your partner code, src = your key prefix). Always send applicants to this link.',
          },
        },
      },
    },
  };
};
