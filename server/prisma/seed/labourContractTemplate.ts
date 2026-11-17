import type { PrismaClient } from '@prisma/client';

/**
 * Default "Əmək müqaviləsi" template (ContractKind LABOUR: Triad Vision ↔ client, first step of the two-step case
 * contracts, lib/caseContracts). A neutral DRAFT in Azerbaijani: the owner replaces the text with the real contract
 * in Admin › Contract templates. Inserted only while no LABOUR template exists, so edits and deletions survive a
 * re-seed. Lines starting with "//" are editor notes (never in the PDF).
 */

export const LABOUR_TEMPLATE_BODY = `// QARALAMA — istifadədən əvvəl öz müqavilə mətninizlə əvəz edin və hüquqşünasa yoxlatdırın.
// Bu şablon hüquqi məsləhət deyil. {{…}} yer tutucuları müraciətdən doldurulur; boş qalanlar ________ kimi görünür.
# Əmək müqaviləsi

Bir tərəfdən
{{triad.name}}, {{triad.address}}
– bundan sonra «Triad Vision» –

digər tərəfdən
{{client.fullName}}, doğum tarixi {{client.birthDate}}, pasport № {{client.passportNumber}}
ünvan: {{client.address}}, telefon {{client.phone}}, e-poçt {{client.email}}
– bundan sonra «Müştəri» –

aşağıdakı müqaviləni bağladılar.

## 1. Müqavilənin predmeti
Triad Vision Müştərinin Almaniyada işə düzəlməsi üçün prosesi təşkil edir (müraciət {{case.number}}, peşə: {{case.profession}}, müraciət növü: {{case.visaType}}).

## 2. Triad Vision-un öhdəlikləri
- prosesin bütün mərhələləri üzrə Müştəriyə məlumat vermək
- Almaniyadakı iş yeri və iş müqaviləsi (İş müqaviləsi) ilə bağlı işləri təşkil etmək
- səfirlik üçün lazım olan sənədləri hazırlamaq; viza müraciətini Müştəri özü verir, qərarı səfirlik verir

## 3. Müştərinin öhdəlikləri
Müştəri doğru və tam məlumat, lazımi sənədləri vaxtında təqdim edir və dəyişiklikləri dərhal bildirir.

## 4. Haqq
Xidmət haqqı: {{salary}}. Ödəniş qaydası: ________.

## 5. Müddət
Müqavilə {{startDate}} tarixindən qüvvəyə minir və proses başa çatana qədər qüvvədədir.

## 6. Yekun müddəalar
Dəyişikliklər yazılı formada edilir. Müqavilə elektron imza ilə imzalanır: əvvəlcə Triad Vision, sonra Müştəri.

Tarix: {{today}} · Məsul əməkdaş: {{staff.fullName}}
`;

export const seedLabourContractTemplate = async (prisma: PrismaClient) => {
  if (await prisma.contractTemplate.count({ where: { kind: 'LABOUR' } })) return 0;
  await prisma.contractTemplate.create({
    data: { name: 'Əmək müqaviləsi (Triad Vision ↔ müştəri) — qaralama', kind: 'LABOUR', language: 'az', body: LABOUR_TEMPLATE_BODY, isDefault: true, active: true },
  });
  return 1;
};
