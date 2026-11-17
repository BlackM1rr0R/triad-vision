import { describe, expect, it } from 'vitest';
import {
  COMPANY_PERMS,
  ROLE_TEMPLATES,
  cleanOverrides,
  hasAllPerms,
  hasFullWork,
  resolveCompanyPerms,
  standardPerms,
} from '../../src/lib/companyAccess/permissions';
import { COMPANY_RULES, allowedByNeed, isGuardedPath, matchRule, redactSalaries, signerAllowed } from '../../src/lib/companyAccess/rules';
import { trimWorkerItems } from '../../src/lib/companyAccess/guard';
import { companyRouter } from '../../src/routes/company';
import { companyAccessRouter } from '../../src/routes/companyAccess';
import { companyAiRouter } from '../../src/routes/companyAi';
import { companyAvvRouter } from '../../src/routes/companyAvv';
import { companyFormsRouter } from '../../src/routes/companyForms';
import { companyInvoicesRouter } from '../../src/routes/companyInvoices';
import { companyPipelineRouter } from '../../src/routes/companyPipeline';
import { companyPoolRouter } from '../../src/routes/companyPool';
import { companyReportsRouter } from '../../src/routes/companyReports';
import { companyRequestsRouter } from '../../src/routes/companyRequests';
import { companySkillVideosRouter } from '../../src/routes/companySkillVideos';
import { companyTeamRouter } from '../../src/routes/companyTeam';
import { companyWorkersRouter } from '../../src/routes/companyWorkers';
import { companyConfiguratorRouter } from '../../src/routes/configurator';
import { companyQuotesRouter } from '../../src/routes/quotes';
import { companyReadinessRouter } from '../../src/routes/readyProgress';
import { signaturesRouter } from '../../src/routes/signatures';
import { interviewsRouter } from '../../src/routes/interviews';
import { interviewCalendarRouter } from '../../src/routes/interviewCalendar';

const ALL_TRUE = Object.fromEntries(COMPANY_PERMS.map((p) => [p, true]));

describe('employer roles: defaults equal today', () => {
  it('STANDARD (no role stored) = every permission, team management only for the owner', () => {
    expect(resolveCompanyPerms({ role: null, isOwner: false })).toEqual({ ...ALL_TRUE, manageTeam: false });
    expect(resolveCompanyPerms({ role: null, isOwner: true })).toEqual(ALL_TRUE);
    expect(resolveCompanyPerms({ role: undefined, isOwner: false })).toEqual(standardPerms(false));
    // An unknown stored value falls back to STANDARD, overrides are ignored without a role.
    expect(resolveCompanyPerms({ role: 'BOSS', overrides: { viewSalaries: false }, isOwner: false })).toEqual(standardPerms(false));
    expect(hasFullWork(standardPerms(false))).toBe(true);
  });

  it('the owner always has everything, whatever is stored', () => {
    expect(resolveCompanyPerms({ role: 'VIEWER', overrides: { manageTeam: false }, isOwner: true })).toEqual(ALL_TRUE);
  });

  it('OWNER and ADMIN templates have every permission', () => {
    expect(hasAllPerms(ROLE_TEMPLATES.OWNER)).toBe(true);
    expect(hasAllPerms(ROLE_TEMPLATES.ADMIN)).toBe(true);
  });
});

describe('employer roles: templates', () => {
  it('VIEWER: no salaries, no personal documents, no signing, read-only', () => {
    const v = ROLE_TEMPLATES.VIEWER;
    expect(v).toMatchObject({ viewSalaries: false, viewPersonalDocuments: false, signEzb: false, signAvv: false, fillEzb: false, viewContracts: false, manageTeam: false });
    expect(v).toMatchObject({ viewPipeline: true, viewWorkers: true, manageVacancies: false, manageArrivalChecklist: false, createRequests: false });
  });
  it('HR: fills and signs the EzB, workers, documents, pool and requests — no team, no AVV, no invoices', () => {
    expect(ROLE_TEMPLATES.HR).toMatchObject({ fillEzb: true, signEzb: true, viewSalaries: true, viewWorkers: true, manageArrivalChecklist: true, viewCandidatePool: true, createRequests: true });
    expect(ROLE_TEMPLATES.HR).toMatchObject({ manageTeam: false, signAvv: false, viewInvoices: false, manageBilling: false, editCompanyProfile: false });
  });
  it('MANAGER: workers, pipeline, arrival checklist — no salaries, no contracts', () => {
    expect(ROLE_TEMPLATES.MANAGER).toMatchObject({ viewWorkers: true, viewPipeline: true, manageArrivalChecklist: true });
    expect(ROLE_TEMPLATES.MANAGER).toMatchObject({ viewSalaries: false, viewContracts: false, viewPersonalDocuments: false, fillEzb: false, signEzb: false, signAvv: false, manageTeam: false });
  });
  it('overrides change single permissions on top of the role; junk is dropped', () => {
    expect(resolveCompanyPerms({ role: 'VIEWER', overrides: { viewSalaries: true, hack: true, signAvv: 'yes' }, isOwner: false })).toEqual({ ...ROLE_TEMPLATES.VIEWER, viewSalaries: true });
    expect(cleanOverrides([1, 2])).toEqual({});
    expect(cleanOverrides({ manageTeam: false, x: true })).toEqual({ manageTeam: false });
  });
});

describe('employer roles: endpoint rules', () => {
  const allowed = (role: keyof typeof ROLE_TEMPLATES, method: string, path: string) => allowedByNeed(matchRule(method, path)?.need ?? null, ROLE_TEMPLATES[role]);

  it('VIEWER cannot sign the EzB / AVV or open forms, invoices, documents; can see workers and pipeline', () => {
    expect(allowed('VIEWER', 'POST', '/company/forms/abc/submit')).toBe(false);
    expect(allowed('VIEWER', 'GET', '/company/forms')).toBe(false);
    expect(allowed('VIEWER', 'POST', '/company/avv/sign')).toBe(false);
    expect(allowed('VIEWER', 'GET', '/company/invoices')).toBe(false);
    expect(allowed('VIEWER', 'GET', '/company/workers/case12345/documents/form/form12345')).toBe(false);
    expect(allowed('VIEWER', 'POST', '/company/workers/case12345/checklist')).toBe(false);
    expect(allowed('VIEWER', 'GET', '/company/workers')).toBe(true);
    expect(allowed('VIEWER', 'GET', '/company/pipeline')).toBe(true);
    expect(allowed('VIEWER', 'GET', '/company/dashboard')).toBe(true);
  });
  it('HR fills the EzB but cannot manage the team', () => {
    expect(allowed('HR', 'GET', '/company/forms/abc')).toBe(true);
    expect(allowed('HR', 'POST', '/company/forms/abc/submit')).toBe(true);
    expect(allowed('HR', 'POST', '/company/team')).toBe(false);
    expect(allowed('HR', 'PATCH', '/company/team/u1/role')).toBe(false);
    expect(allowed('HR', 'DELETE', '/company/team/u1')).toBe(false);
  });
  it('MANAGER sees the pipeline and ticks the checklist but no contracts', () => {
    expect(allowed('MANAGER', 'GET', '/company/pipeline')).toBe(true);
    expect(allowed('MANAGER', 'PATCH', '/company/workers/case12345/checklist/item1')).toBe(true);
    expect(allowed('MANAGER', 'GET', '/company/workers/case12345/documents/signature/sig12345')).toBe(false);
    expect(allowed('MANAGER', 'GET', '/company/avv')).toBe(false);
    expect(signerAllowed('CONTRACT', 'view', ROLE_TEMPLATES.MANAGER)).toBe(false);
  });
  it('signature requests: AVV / EzB / contracts need their own permission', () => {
    expect(signerAllowed('AVV', 'sign', ROLE_TEMPLATES.HR)).toBe(false);
    expect(signerAllowed('EZB', 'sign', ROLE_TEMPLATES.HR)).toBe(true);
    expect(signerAllowed('EZB', 'sign', ROLE_TEMPLATES.VIEWER)).toBe(false);
    expect(signerAllowed('AVV', 'sign', ROLE_TEMPLATES.ADMIN)).toBe(true);
  });
  it('matching follows Express: case-insensitive, trailing slash, HEAD = GET; literal paths before params', () => {
    expect(matchRule('HEAD', '/Company/Workers/')?.path).toBe('/company/workers');
    expect(matchRule('GET', '/company/workers/export.csv')?.path).toBe('/company/workers/export.csv');
    expect(matchRule('GET', '/company/workers/checklists/overview')?.path).toBe('/company/workers/checklists/overview');
    expect(matchRule('GET', '/company/nothing/here/at/all')).toBeNull();
    expect(isGuardedPath('/company/x')).toBe(true);
    expect(isGuardedPath('/companyx')).toBe(false);
    expect(isGuardedPath('/signatures/my/abc')).toBe(true);
    expect(isGuardedPath('/signatures/other')).toBe(false);
  });
  it('unmapped endpoints: open for full-access members, closed for restricted roles', () => {
    expect(allowedByNeed(null, standardPerms(false))).toBe(true);
    expect(allowedByNeed(null, ROLE_TEMPLATES.HR)).toBe(false);
  });
});

describe('employer roles: every employer route has a rule', () => {
  type Layer = { route?: { path: string | string[]; methods: Record<string, boolean> }; handle?: { stack?: unknown[] } };
  const routesOf = (prefix: string, router: unknown) =>
    ((router as { stack: Layer[] }).stack ?? []).flatMap((l) => {
      if (!l.route) {
        // Nested routers would need their mount path; none of the employer routers has one.
        expect(l.handle?.stack, `${prefix}: nested router`).toBeUndefined();
        return [];
      }
      const paths = Array.isArray(l.route.path) ? l.route.path : [l.route.path];
      return paths.flatMap((p) => Object.keys(l.route!.methods).map((m) => ({ method: m.toUpperCase(), path: `${prefix}${p === '/' ? '' : p}` })));
    });
  const MOUNTS: [string, unknown][] = [
    ['/company/invoices', companyInvoicesRouter],
    ['/company/quotes', companyQuotesRouter],
    ['/company/requests', companyRequestsRouter],
    ['/company/pool', companyPoolRouter],
    ['/company/ai', companyAiRouter],
    ['/company/skill-videos', companySkillVideosRouter],
    ['/company/forms', companyFormsRouter],
    ['/company/avv', companyAvvRouter],
    ['/company/workers', companyWorkersRouter],
    ['/company/readiness-profile', companyReadinessRouter],
    ['/company/access', companyAccessRouter],
    ['/company/team', companyTeamRouter],
    ['/company/reports', companyReportsRouter],
    ['/company/pipeline', companyPipelineRouter],
    ['/company/configurator', companyConfiguratorRouter],
    ['/company', companyRouter],
  ];

  it('lists no unmapped /api/company route', () => {
    const unmapped = MOUNTS.flatMap(([prefix, router]) => routesOf(prefix, router))
      .filter((r) => r.method !== '_ALL')
      .map((r) => ({ ...r, sample: r.path.replace(/:[A-Za-z]+/g, 'x1') }))
      .filter((r) => !matchRule(r.method, r.sample))
      .map((r) => `${r.method} ${r.path}`);
    expect(unmapped).toEqual([]);
  });

  it('the portal signing routes, interviews and interview hours are mapped', () => {
    const extra = [
      ...routesOf('/signatures', signaturesRouter).filter((r) => r.path.startsWith('/signatures/my')),
      ...routesOf('/interviews', interviewsRouter),
      ...routesOf('/interview-calendar', interviewCalendarRouter),
    ];
    expect(extra.length).toBeGreaterThan(10);
    const unmapped = extra.filter((r) => !matchRule(r.method, r.path.replace(/:[A-Za-z]+/g, 'x1'))).map((r) => `${r.method} ${r.path}`);
    expect(unmapped).toEqual([]);
  });

  it('every rule is reachable (no rule shadowed by an earlier one)', () => {
    const shadowed = COMPANY_RULES.filter((rule) => {
      const sample = rule.path.replace(/:[A-Za-z]+/g, 'x1');
      const m = rule.method === '*' ? 'POST' : rule.method;
      return matchRule(m, sample) !== rule && rule.method !== '*';
    }).map((r) => `${r.method} ${r.path}`);
    expect(shadowed).toEqual([]);
  });
});

describe('employer roles: response trimming', () => {
  it('removes salary figures deep inside, keeps invoice amounts and dates', () => {
    const d = new Date('2026-11-01T00:00:00Z');
    const out = redactSalaries({ items: [{ id: 'v1', salaryMin: 2500, salaryMax: 3000, title: 'Fahrer', at: d }], grossCents: 100, values: { 'contract.grossMonthly': 3100, 'employment.payGroup': 'E5', name: 'X' } });
    expect(out).toEqual({ items: [{ id: 'v1', title: 'Fahrer', at: d }], grossCents: 100, values: { name: 'X' } });
    expect(JSON.stringify(out)).not.toContain('2500');
  });

  it('worker panel / drawer: contract and form entries only with the matching permission', () => {
    const body = {
      worker: { id: 'c1', openItems: [{ kind: 'SIGNATURE', title: 'Arbeitsvertrag' }, { kind: 'FORM' }, { kind: 'CHECKIN' }] },
      documents: [{ kind: 'SIGNATURE' }, { kind: 'FORM' }],
    };
    const viewer = trimWorkerItems(body, ROLE_TEMPLATES.VIEWER) as typeof body;
    expect(viewer.documents).toEqual([]);
    expect(viewer.worker.openItems).toEqual([{ kind: 'CHECKIN' }]);
    const hr = trimWorkerItems(body, ROLE_TEMPLATES.HR) as typeof body;
    expect(hr.documents).toHaveLength(2);
    expect(hr.worker.openItems).toHaveLength(3);
    const panel = trimWorkerItems({ items: [body.worker], summary: { x: 1 } }, ROLE_TEMPLATES.MANAGER) as { items: { openItems: unknown[] }[] };
    expect(panel.items[0].openItems).toEqual([{ kind: 'CHECKIN' }]);
  });
});
