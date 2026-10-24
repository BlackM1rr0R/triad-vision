import type { Locale } from '@prisma/client';

/** Staff notifications of the four-eyes check of the embassy package, in the recipient's language. */

interface P {
  number: string;
  worker: string;
  by: string;
  comment: string | null;
}

const T: Record<Locale, { requestTitle: (p: P) => string; requestBody: (p: P) => string; approvedTitle: (p: P) => string; rejectedTitle: (p: P) => string; decisionBody: (p: P) => string; overriddenTitle: (p: P) => string }> = {
  az: {
    requestTitle: (p) => `4 göz yoxlaması: ${p.worker} (${p.number})`,
    requestBody: (p) => `${p.by} səfirlik paketini yoxlamağınızı xahiş edir. Səfirliyə təqdim etməzdən əvvəl sənədləri, tərcümə/apostili, pasportla adların uyğunluğunu, fotoları və imzalı formaları yoxlayın.`,
    approvedTitle: (p) => `Səfirlik paketi təsdiqləndi: ${p.number}`,
    rejectedTitle: (p) => `Səfirlik paketi geri qaytarıldı: ${p.number}`,
    decisionBody: (p) => `${p.by} 4 göz yoxlamasını tamamladı (${p.worker}).${p.comment ? `\nŞərh: ${p.comment}` : ''}`,
    overriddenTitle: (p) => `4 göz yoxlaması ötürüldü: ${p.number}`,
  },
  de: {
    requestTitle: (p) => `Vier-Augen-Prüfung: ${p.worker} (${p.number})`,
    requestBody: (p) => `${p.by} bittet Sie, das Botschaftspaket zu prüfen. Vor der Einreichung: Vollständigkeit, Übersetzungen/Apostille, Namen wie im Pass, Fotos und unterschriebene Formulare.`,
    approvedTitle: (p) => `Botschaftspaket freigegeben: ${p.number}`,
    rejectedTitle: (p) => `Botschaftspaket zurückgewiesen: ${p.number}`,
    decisionBody: (p) => `${p.by} hat die Vier-Augen-Prüfung abgeschlossen (${p.worker}).${p.comment ? `\nKommentar: ${p.comment}` : ''}`,
    overriddenTitle: (p) => `Vier-Augen-Prüfung übersprungen: ${p.number}`,
  },
  en: {
    requestTitle: (p) => `Four-eyes check: ${p.worker} (${p.number})`,
    requestBody: (p) => `${p.by} asks you to review the embassy package. Before it is lodged: completeness, translations/apostille, names as in the passport, photos and signed forms.`,
    approvedTitle: (p) => `Embassy package approved: ${p.number}`,
    rejectedTitle: (p) => `Embassy package sent back: ${p.number}`,
    decisionBody: (p) => `${p.by} completed the four-eyes check (${p.worker}).${p.comment ? `\nComment: ${p.comment}` : ''}`,
    overriddenTitle: (p) => `Four-eyes check overridden: ${p.number}`,
  },
  ru: {
    requestTitle: (p) => `Проверка «четыре глаза»: ${p.worker} (${p.number})`,
    requestBody: (p) => `${p.by} просит вас проверить пакет для посольства. Перед подачей: комплектность, переводы/апостиль, имена как в паспорте, фото и подписанные анкеты.`,
    approvedTitle: (p) => `Пакет для посольства одобрен: ${p.number}`,
    rejectedTitle: (p) => `Пакет для посольства возвращён: ${p.number}`,
    decisionBody: (p) => `${p.by} завершил(а) проверку «четыре глаза» (${p.worker}).${p.comment ? `\nКомментарий: ${p.comment}` : ''}`,
    overriddenTitle: (p) => `Проверка «четыре глаза» пропущена: ${p.number}`,
  },
};

export const fourEyesTexts = (l: Locale) => T[l] ?? T.az;
