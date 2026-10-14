import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Mail, MessageCircle, Pencil, Phone, ShieldCheck, ShieldX, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useSiteContent } from '@/lib/content';
import type { CaseDetail } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '../StatusBadge';
import { fmtDate, fmtDateTime, fullName, toastError, waLink } from '../labels';
import type { StaffMember } from '../types';
import { useCaseRefresh } from './shared';

const patchCase = (id: string, body: Record<string, string | null>) => api.patch(`/admin/cases/${id}`, body);

export const CaseHeader = ({ c }: { c: CaseDetail }) => {
  const refresh = useCaseRefresh(c.id);
  const { data: staffData } = useQuery({
    queryKey: ['admin-staff'],
    queryFn: async () => (await api.get<{ staff: StaffMember[] }>('/admin/users/staff')).data.staff,
    staleTime: 5 * 60 * 1000,
  });
  const { data: content } = useSiteContent();
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profession, setProfession] = useState(c.profession);
  const [visaId, setVisaId] = useState(c.visaCategory?.id ?? '');
  const [saving, setSaving] = useState(false);

  const visaOptions = content?.visaCategories ?? [];
  const currentMissing = c.visaCategory && !visaOptions.some((v) => v.id === c.visaCategory?.id);

  const assign = async (assignedStaffId: string) => {
    setAssigning(true);
    try {
      await patchCase(c.id, { assignedStaffId: assignedStaffId || null });
      await refresh();
      toast.success(assignedStaffId ? 'Məsul əməkdaş təyin edildi.' : 'Məsul əməkdaş götürüldü.');
    } catch (err) {
      toastError(err);
    } finally {
      setAssigning(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await patchCase(c.id, { profession: profession.trim(), visaCategoryId: visaId || null });
      await refresh();
      setEditing(false);
      toast.success('Müraciət məlumatları yeniləndi.');
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const client = c.client;

  return (
    <div className="rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0 flex-[1_1_16rem]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-lg font-bold text-navy-900 sm:text-xl">{c.number}</h1>
            <StatusBadge status={c.status} />
          </div>
          <p className="mt-1 text-lg font-semibold break-words text-ink">{fullName(client)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`mailto:${client.email}`} className="inline-flex min-h-8 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink/80 transition hover:border-brand-400 hover:text-brand-700">
              <Mail className="size-3.5 shrink-0" /> <span className="truncate">{client.email}</span>
            </a>
            {client.phone && (
              <>
                <a href={`tel:${client.phone}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs whitespace-nowrap text-ink/80 transition hover:border-brand-400 hover:text-brand-700">
                  <Phone className="size-3.5" /> {client.phone}
                </a>
                <a
                  href={waLink(client.phone)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
                >
                  <MessageCircle className="size-3.5" /> WhatsApp
                </a>
              </>
            )}
            <span className="inline-flex min-h-8 items-center rounded-md bg-surface px-2.5 py-1 text-xs whitespace-nowrap text-muted uppercase">Dil: {client.locale}</span>
          </div>
        </div>
        <div className="w-full sm:w-64">
          <label htmlFor="assign" className="label">
            Məsul əməkdaş
          </label>
          <div className="relative">
            <select
              id="assign"
              className="input pr-8"
              value={c.assignedStaff?.id ?? ''}
              disabled={assigning}
              onChange={(e) => void assign(e.target.value)}
            >
              <option value="">— Təyin edilməyib —</option>
              {c.assignedStaff && !staffData?.some((s) => s.id === c.assignedStaff?.id) && (
                <option value={c.assignedStaff.id}>{fullName(c.assignedStaff)}</option>
              )}
              {staffData?.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </select>
            {assigning && <Spinner className="absolute top-1/2 right-8 size-3.5 -translate-y-1/2 text-brand-600" />}
          </div>
        </div>
      </div>

      <div className="border-t border-line px-5 py-4 sm:px-6">
        {editing ? (
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div>
              <label htmlFor="ed-prof" className="label">
                Peşə
              </label>
              <input id="ed-prof" className="input" value={profession} minLength={2} maxLength={120} required onChange={(e) => setProfession(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ed-visa" className="label">
                Viza kateqoriyası
              </label>
              <select id="ed-visa" className="input" value={visaId} onChange={(e) => setVisaId(e.target.value)}>
                <option value="">— Seçilməyib —</option>
                {currentMissing && c.visaCategory && <option value={c.visaCategory.id}>{c.visaCategory.title.az}</option>}
                {visaOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title.az} ({v.visaLabel})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary btn-sm" disabled={saving || profession.trim().length < 2}>
                {saving && <Spinner className="size-3.5" />} Yadda saxla
              </button>
              <button
                type="button"
                className="btn-white btn-sm border border-line"
                onClick={() => {
                  setEditing(false);
                  setProfession(c.profession);
                  setVisaId(c.visaCategory?.id ?? '');
                }}
                aria-label="Ləğv et"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </form>
        ) : (
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-[11px] text-muted">Peşə</dt>
              <dd className="font-medium text-ink">{c.profession}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Viza</dt>
              <dd className="font-medium text-ink">{c.visaCategory ? `${c.visaCategory.title.az} · ${c.visaCategory.visaLabel}` : '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Yaradılıb</dt>
              <dd className="text-ink/80">{fmtDate(c.createdAt)}</dd>
            </div>
            {c.appointmentAt && (
              <div>
                <dt className="text-[11px] text-muted">Səfirlik görüşü</dt>
                <dd className="flex items-start gap-1 font-medium text-violet-800">
                  <CalendarClock className="mt-0.5 size-3.5 shrink-0" /> {fmtDateTime(c.appointmentAt)} · {c.appointmentPlace}
                </dd>
              </div>
            )}
            {c.status === 'APPROVED' && (
              <div>
                <dt className="text-[11px] text-muted">Viza etibarlıdır</dt>
                <dd className="inline-flex items-center gap-1 font-medium text-emerald-800">
                  <ShieldCheck className="size-3.5" /> {fmtDate(c.visaValidFrom)} – {fmtDate(c.visaValidTo)}
                </dd>
              </div>
            )}
            {(c.status === 'REJECTED' || c.status === 'CANCELLED') && (c.decisionReason || c.cancelReason) && (
              <div className="min-w-0">
                <dt className="text-[11px] text-muted">{c.status === 'REJECTED' ? 'İmtina səbəbi' : 'Ləğv səbəbi'}</dt>
                <dd className="inline-flex items-center gap-1 font-medium text-red-700">
                  <ShieldX className="size-3.5 shrink-0" /> {c.status === 'REJECTED' ? c.decisionReason : c.cancelReason}
                </dd>
              </div>
            )}
            <button
              type="button"
              className="-my-2 ml-auto inline-flex min-h-10 items-center gap-1 text-xs font-semibold whitespace-nowrap text-brand-600 hover:text-brand-700"
              onClick={() => {
                setProfession(c.profession);
                setVisaId(c.visaCategory?.id ?? '');
                setEditing(true);
              }}
            >
              <Pencil className="size-3.5" /> Redaktə et
            </button>
          </dl>
        )}
      </div>
    </div>
  );
};
