import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { ArrowLeft, Briefcase, CloudOff, Download, Home, IdCard, Landmark, LifeBuoy, Phone, Plane, Printer, ShieldCheck, Siren, Smartphone, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { useChosenCase } from '@/lib/caseContext';
import { usePageTitle } from '@/lib/usePageTitle';
import { isIos, isStandalone, promptInstall, pwaState, subscribePwa } from '@/lib/pwa';
import { readArrivalCardLocal, removeArrivalCardOffline, saveArrivalCardOffline, useOfflineIndex, type OfflineArrivalCard } from '@/lib/offlineDocs';
import { telHref, vCard, type ArrivalCardData } from '@/lib/germanyDay';
import { useOfflineWho } from '@/components/offline/useOffline';
import { Skeleton } from '@/components/ui/Skeleton';
import { registerCopy } from '@/i18n';
import { pagesGermanyDay } from '@/i18n/pagesGermanyDay';
import { pagesEmergencyWallpaper } from '@/i18n/pagesEmergencyWallpaper';

registerCopy(pagesGermanyDay);
registerCopy(pagesEmergencyWallpaper);

type Row = { label: string; value: string; tel?: string };
type Section = { key: string; title: string; icon: typeof Home; rows: Row[] };

const useInstallable = () => useSyncExternalStore(subscribePwa, () => !!pwaState().installEvent, () => false);

/** The card as label / value sections in the user's language (shared by the page and the offline copy). */
const useSections = (card: ArrivalCardData | null): Section[] => {
  const { t } = useTranslation();
  const { date, dateTime } = useL10n();
  return useMemo(() => {
    if (!card) return [];
    const r = (label: string, value: string | null | undefined, tel?: boolean): Row[] => (value ? [{ label, value, ...(tel ? { tel: value } : {}) }] : []);
    const addr = card.address;
    return [
      {
        key: 'address',
        title: t('acard.address'),
        icon: Home,
        rows: [
          ...r(t('acard.holder'), card.holder.name),
          ...(addr.text ? r(t('acard.address'), addr.text) : addr.city ? [{ label: t('acard.address'), value: t('acard.addressCity', { city: addr.city }) }] : [{ label: t('acard.address'), value: t('acard.addressMissing') }]),
          ...r(t('acard.moveIn'), addr.moveInDate ? date(addr.moveInDate, { day: 'numeric', month: 'long', year: 'numeric' }) : null),
          ...r(t('acard.landlord'), addr.landlord?.name),
          ...r(t('acard.phone'), addr.landlord?.phone, true),
        ],
      },
      {
        key: 'employer',
        title: t('acard.employer'),
        icon: Briefcase,
        rows: [
          ...r(t('acard.employer'), card.employer?.name),
          ...r(t('acard.contact'), card.employer?.contactName),
          ...r(t('acard.phone'), card.employer?.phone, true),
          ...r('E-Mail', card.employer?.email),
          ...r(t('acard.address'), card.employer?.address),
          ...r(t('acard.firstDay'), card.firstWorkDay ? date(card.firstWorkDay, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : null),
        ],
      },
      {
        key: 'arrival',
        title: t('acard.arrival'),
        icon: Plane,
        rows: card.arrival
          ? [
              ...r(t('acard.arrival'), [card.arrival.at ? dateTime(card.arrival.at) : null, card.arrival.flightNumber, card.arrival.airport].filter(Boolean).join(' · ') || null),
              ...r(t('acard.pickup'), card.arrival.pickup),
            ]
          : [],
      },
      {
        key: 'emergency',
        title: t('acard.emergency'),
        icon: Siren,
        rows: card.emergency.map((e) => ({ label: t(`acard.em.${e.key}`), value: e.number, tel: e.number })),
      },
      {
        key: 'embassy',
        title: t('acard.embassy'),
        icon: Landmark,
        rows: [
          { label: t('acard.consular'), value: card.embassy.consular.address },
          { label: `${t('acard.consular')} · ${t('acard.phone')}`, value: card.embassy.consular.phone, tel: card.embassy.consular.phone },
          { label: t('acard.embassyPhone'), value: card.embassy.phone, tel: card.embassy.phone },
          { label: 'E-Mail', value: card.embassy.email },
        ],
      },
      {
        key: 'support',
        title: t('acard.support'),
        icon: LifeBuoy,
        rows: [{ label: t('acard.phone'), value: card.support.phone, tel: card.support.phone }],
      },
    ];
  }, [card, t, date, dateTime]);
};

/** QR: vCard of the employer's contact person, else of Triad Vision support. */
const useQr = (card: ArrivalCardData | null) => {
  const { t } = useTranslation();
  const [qr, setQr] = useState<{ dataUrl: string; caption: string } | null>(null);
  useEffect(() => {
    if (!card) return;
    const e = card.employer;
    const person = e?.contactName && (e.phone || e.email);
    const text = person
      ? vCard({ name: e!.contactName!, org: e!.name, phone: e!.phone, email: e!.email })
      : vCard({ name: 'Triad Vision', org: 'Triad Vision', phone: card.support.phone, note: card.case.number });
    const caption = person ? t('acard.qr') : t('acard.qrSupport');
    let alive = true;
    QRCode.toDataURL(text, { width: 360, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0b1f44', light: '#ffffff' } })
      .then((dataUrl) => alive && setQr({ dataUrl, caption }))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [card, t]);
  return qr;
};

const Value = ({ row }: { row: Row }) =>
  row.tel ? (
    <a href={telHref(row.tel)} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-link hover:underline print:min-h-0 print:text-ink">
      <Phone className="size-4 print:hidden" aria-hidden /> {row.value}
    </a>
  ) : (
    <span className="font-semibold break-words text-ink">{row.value}</span>
  );

const Block = ({ s }: { s: Section }) => {
  if (!s.rows.length) return null;
  const Icon = s.icon;
  return (
    <section className="card p-4 break-inside-avoid sm:p-5 print:border print:shadow-none" aria-labelledby={`ac-${s.key}`}>
      <h2 id={`ac-${s.key}`} className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
        <Icon className="size-4 text-primary" aria-hidden /> {s.title}
      </h2>
      <dl className="mt-2 space-y-2">
        {s.rows.map((row, i) => (
          <div key={i}>
            <dt className="text-xs text-muted">{row.label}</dt>
            <dd className="text-base">
              <Value row={row} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

const Shell = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/account/arrival-prep" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:underline print:hidden">
        <ArrowLeft className="size-4" aria-hidden /> {t('acard.back')}
      </Link>
      {children}
    </div>
  );
};

/**
 * Digital arrival card (/account/arrival-card): German address, employer + contact person, first work day, the
 * arrival, emergency numbers, the Azerbaijani embassy and Triad Vision support on one phone-sized page, a QR with the
 * contact person's vCard, and "Save offline" (Cache Storage for the static offline page + localStorage for this page;
 * device only, cleared on logout / after 30 days), print / PDF and "Add to home screen". Own data only.
 */
export default function ArrivalCardPage() {
  const { t } = useTranslation();
  usePageTitle(t('acard.title'));
  const { user } = useAuth();
  const chosen = useChosenCase(user?.id);
  const { date, dateTime } = useL10n();
  const who = useOfflineWho();
  const idx = useOfflineIndex();
  const installable = useInstallable();
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState<OfflineArrivalCard | null>(() => (user ? readArrivalCardLocal(user.id) : null));

  const q = useQuery({
    queryKey: ['account-arrival-card', chosen ?? 'default'],
    queryFn: async () => (await api.get<{ card: ArrivalCardData }>('/account/germany/arrival-card', { params: chosen ? { case: chosen } : undefined })).data.card,
    enabled: user?.role === 'CLIENT',
    retry: false,
    staleTime: 5 * 60_000,
  });
  const offlineCopy = kept ?? idx?.arrivalCard ?? null;
  const notReady = q.isError && (q.error as { response?: { status?: number } })?.response?.status === 404;
  const fromOffline = !q.data && !notReady && q.isError && !!offlineCopy;
  const card: ArrivalCardData | null = q.data ?? (fromOffline ? (offlineCopy!.data as ArrivalCardData) : null);
  const sections = useSections(card);
  const qr = useQr(card);
  const savedAt = offlineCopy?.savedAt ?? null;

  if (q.isLoading) {
    return (
      <Shell>
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </Shell>
    );
  }
  if (!card) {
    return (
      <Shell>
        <div className="card p-6 text-center">
          <IdCard className="mx-auto size-10 text-muted" aria-hidden />
          <p className="mt-3 text-ink">{notReady ? t('acard.notReady') : t('acard.error')}</p>
        </div>
      </Shell>
    );
  }

  const save = async () => {
    if (!who) return;
    setBusy(true);
    try {
      const entry = { title: `${t('acard.title')} · ${card.holder.name}`, sections: sections.map((s) => ({ title: s.title, rows: s.rows })), qr, data: card };
      const err = await saveArrivalCardOffline(entry, who);
      if (err) toast.error(t('acard.offlineError'));
      else {
        setKept(readArrivalCardLocal(who.userId) ?? { ...entry, savedAt: new Date().toISOString() });
        toast.success(t('acard.savedOffline', { date: dateTime(new Date()) }));
      }
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    await removeArrivalCardOffline().catch(() => undefined);
    setKept(null);
    setBusy(false);
  };

  return (
    <Shell>
      <header className="card overflow-hidden p-5 sm:p-6 print:shadow-none">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl chip-soft">
            <IdCard className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold text-ink sm:text-2xl">{t('acard.title')}</h1>
            <p className="mt-0.5 text-lg font-semibold text-ink">{card.holder.name}</p>
            <p className="text-xs text-muted">
              № {card.case.number} · {date(card.generatedAt)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted print:hidden">{t('acard.subtitle')}</p>
        {fromOffline && savedAt && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-warning-bg p-3 text-sm text-warning-fg" role="status">
            <CloudOff className="size-4 shrink-0" aria-hidden /> {t('acard.offlineShown', { date: dateTime(savedAt) })}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          {!fromOffline && (
            <button type="button" className="btn-primary min-h-11" onClick={() => void save()} disabled={busy || !who}>
              <Download className="size-4" aria-hidden /> {t('acard.saveOffline')}
            </button>
          )}
          <button type="button" className="btn-secondary min-h-11" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> {t('acard.print')}
          </button>
          {installable && !isStandalone() && (
            <button type="button" className="btn-secondary min-h-11" onClick={() => void promptInstall()}>
              <Smartphone className="size-4" aria-hidden /> {t('acard.install')}
            </button>
          )}
          {savedAt && (
            <button type="button" className="btn-ghost min-h-11" onClick={() => void remove()} disabled={busy}>
              <Trash2 className="size-4" aria-hidden /> {t('acard.removeOffline')}
            </button>
          )}
        </div>
        {savedAt && !fromOffline && <p className="mt-2 text-xs text-success-fg print:hidden">{t('acard.savedOffline', { date: dateTime(savedAt) })}</p>}
        {!installable && isIos() && !isStandalone() && <p className="mt-2 text-xs text-muted print:hidden">{t('acard.installIos')}</p>}
      </header>

      {sections.map((s) => (
        <Block key={s.key} s={s} />
      ))}

      {qr && (
        <section className="card flex flex-col items-center p-5 text-center break-inside-avoid print:shadow-none" aria-labelledby="ac-qr">
          <h2 id="ac-qr" className="text-sm font-semibold text-ink">
            {qr.caption}
          </h2>
          <img src={qr.dataUrl} alt={qr.caption} width={200} height={200} className="mt-3 rounded-xl bg-white p-2" />
          <p className="mt-2 text-xs text-muted">{t('acard.qrHint')}</p>
        </section>
      )}

      <Link to="/account/emergency-wallpaper" className="card flex min-h-14 items-center gap-3 px-4 py-2 text-sm font-semibold text-ink hover:bg-sunken print:hidden">
        <Smartphone className="size-5 text-primary" aria-hidden /> {t('ewp.portalTitle')}
      </Link>

      <p className="flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('acard.privacy')}
      </p>
    </Shell>
  );
}
