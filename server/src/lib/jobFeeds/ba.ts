import https from 'node:https';
import crypto from 'node:crypto';
import type { JobFeedConfig } from '@prisma/client';
import { prisma } from '../../db.js';
import { open } from '../secretBox.js';
import { buildChannel, ensureFeedConfig, recordChannelStates, toFeedJob, type FeedJob } from './service.js';
import { XML_DECL, el, elText } from './xml.js';

/**
 * Bundesagentur für Arbeit — Jobbörse, HR-BA-XML partner interface.
 *
 * Access needs a cooperation agreement (Account- und Allianzpartnermanagement of the BA); afterwards the BA
 * sends a personal X.509 client certificate (.p12) + its password, the supplier id (e.g. "P000132700") and the
 * partner id. Files are uploaded through the BA interface server (hrbaxml.arbeitsagentur.de, client-certificate
 * HTTPS) and validated there against HRBAXML_JobPosition_Current.xsd; an error file can be fetched a few minutes
 * later. The XSD, the code catalogues ("Kataloge", e.g. TitleCode = Berufe-ID / DKZ) and sample files are only
 * published as downloads for partners, so the element names below follow the public descriptions and existing
 * integrations; the ones marked UNCERTAIN must be checked against the XSD before the first upload
 * (deploy/README-jobfeeds.md lists them).
 *
 * Until partner id, supplier id, certificate, password and upload URL are entered AND the admin switches the
 * upload on, nothing is sent: admins download the file and upload it by hand in the BA web interface.
 */

/** Code values used in the file. UNCERTAIN: taken from public descriptions, check against the HR-BA-XML Kataloge. */
export const BA_CODES = {
  /** JobOfferType: 1 = Arbeitsstelle, 4 = Ausbildungsstelle (UNCERTAIN). */
  jobOfferType: { job: '1', apprenticeship: '4' },
  /** TemporaryOrRegular: 1 = befristet, 2 = unbefristet (UNCERTAIN). */
  temporary: { limited: '1', regular: '2' },
  /** WorkingTime: VZ = Vollzeit, TZ = Teilzeit (UNCERTAIN). */
  workingTime: { FULL_TIME: 'VZ', PART_TIME: 'TZ', SEASONAL: 'VZ', AUSBILDUNG: 'VZ' } as Record<string, string>,
  /** PostDetail/Status/Code: 1 = aktiv / veröffentlichen (UNCERTAIN). */
  statusActive: '1',
} as const;

/** Element paths whose name or code list could not be confirmed from public documentation. */
export const BA_UNCERTAIN_FIELDS = [
  'PostDetail/Status/Code',
  'JobPositionInformation/JobPositionDescription/JobOfferType',
  'JobPositionInformation/JobPositionDescription/TermLength/TemporaryOrRegular',
  'JobPositionInformation/JobPositionDescription/WorkingTime',
  'JobPositionInformation/JobPositionDescription/HoursPerWeek',
  'JobPositionInformation/JobPositionDescription/StartDate',
  'JobPositionInformation/JobPositionDescription/Salary',
  'JobPositionInformation/JobPositionRequirements/*',
  'HiringOrg/HiringOrgName (anonymous employer label instead of the real employer)',
  'TitleCode (DKZ / Berufe-ID expected; we send what is entered in baTitleCode)',
];

const MIN_DESCRIPTION = 50;

/** Required fields for one posting (error codes; the admin UI translates them). */
export const validateBaJob = (j: FeedJob): string[] => {
  const errors: string[] = [];
  if (!j.title) errors.push('TITLE_MISSING');
  if (!j.baTitleCode) errors.push('TITLE_CODE_MISSING');
  else if (!/^\d{1,12}$/.test(j.baTitleCode)) errors.push('TITLE_CODE_INVALID');
  if (j.descriptionText.length < MIN_DESCRIPTION) errors.push('DESCRIPTION_TOO_SHORT');
  if (!j.city) errors.push('CITY_MISSING');
  if (!j.postalCode) errors.push('POSTAL_CODE_MISSING');
  else if (!/^\d{5}$/.test(j.postalCode)) errors.push('POSTAL_CODE_INVALID');
  if (!j.company) errors.push('EMPLOYER_MISSING');
  if (j.limited && !j.limitedUntil) errors.push('LIMITED_UNTIL_MISSING');
  if (j.weeklyHours != null && (j.weeklyHours < 1 || j.weeklyHours > 60)) errors.push('WEEKLY_HOURS_INVALID');
  if (j.language !== 'de') errors.push('LANGUAGE_NOT_GERMAN');
  return errors;
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const localStamp = (d: Date) => d.toISOString().slice(0, 19); // "2026-10-26T12:00:00"

/** File name the BA validates: DS<SupplierId>_YYYY-MM-DD_HH-MM-SS.xml (UTC). */
export const baFileName = (supplierId: string, now = new Date()) =>
  `DS${supplierId.replace(/[^A-Za-z0-9]/g, '')}_${now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.xml`;

const postingXml = (j: FeedJob, supplierId: string, now: Date) => {
  const start = j.datePosted > now ? j.datePosted : now;
  // Publication end: closesAt, else 60 days (the BA requires an end date; it can be extended by the next upload).
  const end = j.validThrough ?? new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const address = `${elText('CountryCode', j.country)}${elText('PostalCode', j.postalCode)}${el('Municipality', j.city)}`;
  return [
    '<JobPositionPosting>',
    elText('JobPositionPostingId', `${supplierId}-${j.vacancyId}`),
    '<HiringOrg>',
    el('HiringOrgName', j.company),
    `<Contact><PostalAddress>${address}</PostalAddress></Contact>`,
    '</HiringOrg>',
    '<PostDetail>',
    elText('StartDate', isoDate(start)),
    elText('EndDate', isoDate(end)),
    elText('LastModificationDate', localStamp(j.updatedAt)),
    `<Status>${elText('Code', BA_CODES.statusActive)}</Status>`,
    elText('SupplierId', supplierId),
    '</PostDetail>',
    '<JobPositionInformation>',
    `<JobPositionTitle>${elText('TitleCode', j.baTitleCode)}</JobPositionTitle>`,
    '<JobPositionDescription>',
    el('JobPositionTitleDescription', j.title),
    elText('JobOfferType', j.employmentType === 'AUSBILDUNG' ? BA_CODES.jobOfferType.apprenticeship : BA_CODES.jobOfferType.job),
    el('Objective', j.descriptionText),
    `<Location>${address}</Location>`,
    elText('NumberOfJobs', j.positions),
    elText('WorkingTime', BA_CODES.workingTime[j.employmentType] ?? 'VZ'),
    j.weeklyHours != null ? elText('HoursPerWeek', j.weeklyHours) : '',
    `<TermLength>${elText('TemporaryOrRegular', j.limited ? BA_CODES.temporary.limited : BA_CODES.temporary.regular)}${
      j.limited && j.limitedUntil ? `<TermDate>${elText('End', isoDate(j.limitedUntil))}</TermDate>` : ''
    }</TermLength>`,
    elText('StartDate', isoDate(j.startDate ?? start)),
    j.salary ? el('Salary', j.salary) : '',
    el('ApplicationURL', j.url),
    '</JobPositionDescription>',
    '<JobPositionRequirements>',
    j.germanLevel && j.germanLevel !== 'none' ? `<Languages><Language>${el('LanguageName', 'Deutsch')}${elText('LanguageLevel', j.germanLevel)}</Language></Languages>` : '',
    j.drivingLicence ? `<Mobility><DrivingLicence>${el('DrivingLicenceCode', j.drivingLicence)}</DrivingLicence></Mobility>` : '',
    j.minExperience ? elText('ExperienceYears', j.minExperience) : '',
    '</JobPositionRequirements>',
    '</JobPositionInformation>',
    '</JobPositionPosting>',
  ]
    .filter(Boolean)
    .join('\n');
};

export interface BaExport {
  xml: string;
  fileName: string;
  included: FeedJob[];
  errors: { vacancyId: string; slug: string; errors: string[] }[];
  /** File-level problems (supplier id missing): the file can be looked at but not uploaded. */
  fileErrors: string[];
}

/** Full load (TypeOfLoad F): every live vacancy with the BA channel on that passes validation. */
export const buildBaExport = async (now = new Date()): Promise<BaExport> => {
  const cfg = await ensureFeedConfig();
  const supplierId = cfg.baSupplierId?.trim() || '';
  const { live } = await buildChannel('ba', now);
  const included: FeedJob[] = [];
  const errors: BaExport['errors'] = [];
  for (const v of live) {
    const job = toFeedJob(v, 'ba');
    const problems = validateBaJob(job);
    if (problems.length) errors.push({ vacancyId: v.id, slug: v.slug, errors: problems });
    else included.push(job);
  }
  const fileErrors = supplierId ? [] : ['SUPPLIER_ID_MISSING'];
  const sid = supplierId || 'SUPPLIER_ID';
  const xml = [
    XML_DECL,
    '<!-- HR-BA-XML job postings. Check the fields listed as uncertain in deploy/README-jobfeeds.md against HRBAXML_JobPosition_Current.xsd. -->',
    '<HRBAXMLJobPositionPosting xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="HRBAXML_JobPosition_Current.xsd">',
    '<Header>',
    elText('SupplierId', sid),
    elText('Timestamp', localStamp(now)),
    elText('Amount', included.length),
    elText('TypeOfLoad', 'F'),
    '</Header>',
    '<Data>',
    ...included.map((j) => postingXml(j, sid, now)),
    '</Data>',
    '</HRBAXMLJobPositionPosting>',
    '',
  ].join('\n');
  return { xml, fileName: baFileName(sid, now), included, errors, fileErrors };
};

/** Records the export outcome: invalid → ERROR; exported → PENDING (manual upload) or PUBLISHED (uploaded). */
export const recordBaStates = async (exp: BaExport, uploaded: boolean, uploadError?: string) => {
  await recordChannelStates('ba', [
    ...exp.included.map((j) => ({
      vacancyId: j.vacancyId,
      status: uploadError ? ('ERROR' as const) : uploaded ? ('PUBLISHED' as const) : ('PENDING' as const),
      error: uploadError ?? null,
      exported: !uploadError,
    })),
    ...exp.errors.map((e) => ({ vacancyId: e.vacancyId, status: 'ERROR' as const, error: e.errors.join(',') })),
  ]);
};

// ─── Upload (disabled until configured) ─────────────────────────────────

export const baMissing = (cfg: Pick<JobFeedConfig, 'baSupplierId' | 'baPartnerId' | 'baCertSealed' | 'baPassSealed' | 'baUploadUrl'>) => {
  const missing: string[] = [];
  if (!cfg.baSupplierId) missing.push('SUPPLIER_ID');
  if (!cfg.baPartnerId) missing.push('PARTNER_ID');
  if (!cfg.baCertSealed || !open(cfg.baCertSealed)) missing.push('CERTIFICATE');
  if (!cfg.baPassSealed || open(cfg.baPassSealed) === null) missing.push('PASSPHRASE');
  if (!cfg.baUploadUrl) missing.push('UPLOAD_URL');
  return missing;
};

/** Multipart POST of the file with the client certificate. The certificate and its password never reach a log. */
const postFile = (url: string, pfx: Buffer, passphrase: string, partnerId: string, fileName: string, xml: string) =>
  new Promise<void>((resolve, reject) => {
    const boundary = `----tvjobfeed${crypto.randomBytes(12).toString('hex')}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="partnerId"\r\n\r\n${partnerId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="upload"; filename="${fileName}"\r\nContent-Type: text/xml; charset=UTF-8\r\n\r\n`),
      Buffer.from(xml, 'utf8'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const req = https.request(url, {
      method: 'POST',
      pfx,
      passphrase,
      timeout: 60_000,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
    });
    req.on('response', (res) => {
      res.resume();
      if ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) resolve();
      else reject(new Error(`BA_UPLOAD_HTTP_${res.statusCode}`));
    });
    req.on('timeout', () => req.destroy(new Error('BA_UPLOAD_TIMEOUT')));
    req.on('error', (err) => reject(new Error(`BA_UPLOAD_FAILED: ${(err as NodeJS.ErrnoException).code ?? 'network'}`)));
    req.end(body);
  });

export type BaUploadResult =
  | { ok: true; fileName: string; uploaded: number; invalid: number }
  | { ok: false; skipped: 'DISABLED' | 'NOT_CONFIGURED' | 'NOTHING_TO_UPLOAD' | 'INVALID_FILE'; missing?: string[] }
  | { ok: false; error: string };

/** Scheduled + "upload now": does nothing unless the upload is switched on and fully configured. */
export const runBaUpload = async (opts: { manual?: boolean } = {}): Promise<BaUploadResult> => {
  const cfg = await ensureFeedConfig();
  if (!cfg.baUploadEnabled && !opts.manual) return { ok: false, skipped: 'DISABLED' };
  const missing = baMissing(cfg);
  if (missing.length) return { ok: false, skipped: 'NOT_CONFIGURED', missing };
  if (!cfg.baUploadEnabled) return { ok: false, skipped: 'DISABLED' };
  const exp = await buildBaExport();
  if (exp.fileErrors.length) return { ok: false, skipped: 'INVALID_FILE' };
  if (!exp.included.length) {
    await recordBaStates(exp, false);
    return { ok: false, skipped: 'NOTHING_TO_UPLOAD' };
  }
  try {
    await postFile(cfg.baUploadUrl!, Buffer.from(open(cfg.baCertSealed)!, 'base64'), open(cfg.baPassSealed) ?? '', cfg.baPartnerId!, exp.fileName, exp.xml);
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : 'BA_UPLOAD_FAILED';
    await prisma.jobFeedConfig.update({ where: { id: cfg.id }, data: { baLastError: message } });
    await recordBaStates(exp, false, message);
    return { ok: false, error: message };
  }
  await prisma.jobFeedConfig.update({ where: { id: cfg.id }, data: { baLastUploadAt: new Date(), baLastError: null } });
  await recordBaStates(exp, true);
  return { ok: true, fileName: exp.fileName, uploaded: exp.included.length, invalid: exp.errors.length };
};
