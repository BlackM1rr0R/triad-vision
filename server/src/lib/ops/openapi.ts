import { config } from '../../config.js';
import { API_SCOPES } from './apiKeys.js';
import { WEBHOOK_EVENTS } from './webhooks.js';

/** Hand-written OpenAPI 3 description of the partner API (served at GET /api/v1/openapi.json). */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const okJson = (schema: object, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const errors = {
  '401': { description: 'Missing, invalid or revoked API key', content: { 'application/json': { schema: ref('Error') } } },
  '403': { description: 'The key lacks the required scope', content: { 'application/json': { schema: ref('Error') } } },
  '404': { description: 'Not found (or not visible to this key)', content: { 'application/json': { schema: ref('Error') } } },
  '429': { description: 'Rate limit exceeded (600 requests per minute per key)', content: { 'application/json': { schema: ref('Error') } } },
};
const idParam = (name: string) => ({ name, in: 'path', required: true, schema: { type: 'string' } });

export const buildOpenApi = () => ({
  openapi: '3.0.3',
  info: {
    title: 'Triad Vision Partner API',
    version: '1.0.0',
    description:
      'Read vacancies, applications, placed workers and interviews of your company, move applications through the pipeline and receive signed webhooks. Authenticate every request with `Authorization: Bearer tv_…` (API key from Admin → Integrations). All timestamps are ISO 8601 in UTC.',
  },
  servers: [{ url: `${config.clientUrl.replace(/\/$/, '')}/api/v1` }],
  security: [{ apiKey: [] }],
  tags: [
    { name: 'Vacancies' },
    { name: 'Applications' },
    { name: 'Candidates' },
    { name: 'Cases' },
    { name: 'Events' },
  ],
  paths: {
    '/vacancies': {
      get: {
        tags: ['Vacancies'],
        summary: 'List the company’s vacancies',
        description: 'Scope `vacancies:read`.',
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['DRAFT', 'PENDING', 'OPEN', 'CLOSED'] } }],
        responses: { '200': okJson({ type: 'object', properties: { items: { type: 'array', items: ref('Vacancy') } } }), ...errors },
      },
    },
    '/vacancies/{id}/applications': {
      get: {
        tags: ['Applications'],
        summary: 'Applications to one vacancy',
        description: 'Scope `applications:read`. Only applications already presented to the employer (PROPOSED, INTERVIEW, ACCEPTED) and the ones the employer decided on are included.',
        parameters: [idParam('id')],
        responses: { '200': okJson({ type: 'object', properties: { items: { type: 'array', items: ref('Application') } } }), ...errors },
      },
    },
    '/applications/{id}': {
      get: {
        tags: ['Applications'],
        summary: 'One application',
        description: 'Scope `applications:read`.',
        parameters: [idParam('id')],
        responses: { '200': okJson({ type: 'object', properties: { application: ref('Application') } }), ...errors },
      },
      patch: {
        tags: ['Applications'],
        summary: 'Decide on an application',
        description: 'Scope `applications:write`. Allowed transitions: PROPOSED → INTERVIEW, PROPOSED/INTERVIEW → ACCEPTED or REJECTED.',
        parameters: [idParam('id')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', enum: ['INTERVIEW', 'ACCEPTED', 'REJECTED'] }, note: { type: 'string', maxLength: 2000 } },
              },
            },
          },
        },
        responses: { '200': okJson({ type: 'object', properties: { application: ref('Application') } }), '409': { description: 'Transition not allowed from the current status' }, ...errors },
      },
    },
    '/candidates/{id}': {
      get: {
        tags: ['Candidates'],
        summary: 'Anonymised candidate profile',
        description: 'Scope `candidates:read`. Only candidates who applied to the company’s vacancies; no contact data.',
        parameters: [idParam('id')],
        responses: { '200': okJson({ type: 'object', properties: { candidate: ref('Candidate') } }), ...errors },
      },
    },
    '/cases': {
      get: {
        tags: ['Cases'],
        summary: 'Visa cases of workers placed with the company',
        description: 'Scope `cases:read`.',
        responses: { '200': okJson({ type: 'object', properties: { items: { type: 'array', items: ref('Case') } } }), ...errors },
      },
    },
    '/events': {
      get: {
        tags: ['Events'],
        summary: 'Recent events for polling',
        description: 'Scope `events:read`. The same events that webhooks deliver, newest first. Use `since` (ISO timestamp) to fetch only what changed.',
        parameters: [
          { name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        ],
        responses: { '200': okJson({ type: 'object', properties: { items: { type: 'array', items: ref('Event') } } }), ...errors },
      },
    },
  },
  components: {
    securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'tv_<key>' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
      L10n: { type: 'object', properties: { az: { type: 'string' }, de: { type: 'string' }, en: { type: 'string' }, ru: { type: 'string' } } },
      Vacancy: {
        type: 'object',
        properties: {
          id: { type: 'string' }, slug: { type: 'string' }, title: ref('L10n'), status: { type: 'string' }, city: { type: 'string', nullable: true },
          profession: { type: 'string', nullable: true }, positions: { type: 'integer' }, employmentType: { type: 'string' },
          salaryMin: { type: 'integer', nullable: true }, salaryMax: { type: 'integer', nullable: true },
          publishedAt: { type: 'string', format: 'date-time', nullable: true }, closesAt: { type: 'string', format: 'date-time', nullable: true },
          applications: { type: 'object', additionalProperties: { type: 'integer' }, description: 'Count per status' },
        },
      },
      Application: {
        type: 'object',
        properties: {
          id: { type: 'string' }, vacancyId: { type: 'string' }, status: { type: 'string' }, matchScore: { type: 'integer', nullable: true },
          companyNote: { type: 'string', nullable: true }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
          candidate: ref('Candidate'),
        },
      },
      Candidate: {
        type: 'object',
        properties: {
          id: { type: 'string' }, name: { type: 'string', description: 'First name and last initial' }, profession: { type: 'string', nullable: true },
          experienceYears: { type: 'integer', nullable: true }, germanLevel: { type: 'string', nullable: true }, education: { type: 'string', nullable: true },
          drivingLicence: { type: 'string', nullable: true }, city: { type: 'string', nullable: true },
        },
      },
      Case: {
        type: 'object',
        properties: {
          id: { type: 'string' }, number: { type: 'string' }, status: { type: 'string' }, profession: { type: 'string' },
          candidate: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
          vacancyId: { type: 'string', nullable: true }, createdAt: { type: 'string', format: 'date-time' },
          appointmentAt: { type: 'string', format: 'date-time', nullable: true }, decisionAt: { type: 'string', format: 'date-time', nullable: true },
          visaValidFrom: { type: 'string', format: 'date-time', nullable: true }, visaValidTo: { type: 'string', format: 'date-time', nullable: true },
          closedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Event: {
        type: 'object',
        properties: {
          id: { type: 'string' }, event: { type: 'string', enum: WEBHOOK_EVENTS }, at: { type: 'string', format: 'date-time' }, data: { type: 'object' },
        },
      },
      WebhookEnvelope: {
        type: 'object',
        description: 'Body of every webhook POST. Headers: X-TV-Event, X-TV-Delivery, X-TV-Signature (sha256=<HMAC-SHA256 hex of the raw body with the webhook secret>).',
        properties: { event: { type: 'string', enum: WEBHOOK_EVENTS }, at: { type: 'string', format: 'date-time' }, data: { type: 'object' } },
      },
    },
  },
  'x-scopes': API_SCOPES,
  'x-webhook-events': WEBHOOK_EVENTS,
});
