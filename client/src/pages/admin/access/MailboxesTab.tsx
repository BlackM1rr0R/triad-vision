import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Crown, Inbox, Plus, Search, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesMailAccess } from '@/i18n/pagesMailAccess';
import { Button, Modal, Spinner, confirmDialog } from '@/components/ui';
import { ErrorState } from '@/components/ui/ErrorState';

registerCopy(pagesMailAccess);

/**
 * Access Center › Mailboxes (SUPER_ADMIN only): which staff member may open which workspace mailbox.
 * Server: routes/admin/accessMailboxes.ts (enforcement in routes/mail.ts via lib/mail/access.ts). The owner always has
 * full access and every super admin reads all mailboxes; grants add READ ("Oxu") or SEND ("Oxu və göndər").
 */

type Level = 'READ' | 'SEND';
interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}
interface Grant {
  id: string;
  level: Level;
  createdAt: string;
  user: Person;
}
interface Mailbox {
  id: string;
  email: string;
  displayName: string | null;
  owner: Person;
  grants: Grant[];
}
interface Overview {
  mailboxes: Mailbox[];
  users: Person[];
}

const BASE = '/admin/access/mailboxes';
const KEY = ['access-mailboxes'] as const;
const nameOf = (p: Person) => `${p.firstName} ${p.lastName}`.trim() || p.email;

export default function MailboxesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'mailbox' | 'user'>('mailbox');
  const [q, setQ] = useState('');
  const [granting, setGranting] = useState<Mailbox | null>(null);
  const data = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<Overview>(BASE)).data });

  const showError = (err: unknown) => {
    const code = errorCode(err);
    toast.error(code === 'OWNER_HAS_ACCESS' || code === 'NOT_STAFF' ? t(`mailAccess.admin.errors.${code}`) : t('mailAccess.admin.error'));
  };
  const revoke = useMutation({
    mutationFn: async (id: string) => api.delete(`${BASE}/grants/${id}`),
    onSuccess: () => {
      toast.success(t('mailAccess.admin.removed'));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: showError,
  });
  const askRevoke = async (box: Mailbox, g: Grant) => {
    if (await confirmDialog({ title: t('mailAccess.admin.removeConfirm', { name: nameOf(g.user), mailbox: box.email }), tone: 'danger' })) revoke.mutate(g.id);
  };

  const needle = q.trim().toLowerCase();
  const boxes = useMemo(() => {
    const all = data.data?.mailboxes ?? [];
    if (!needle) return all;
    return all.filter((b) => [b.email, b.displayName ?? '', nameOf(b.owner), ...b.grants.map((g) => nameOf(g.user))].some((s) => s.toLowerCase().includes(needle)));
  }, [data.data, needle]);
  const people = useMemo(() => {
    const all = data.data?.users ?? [];
    return needle ? all.filter((u) => `${nameOf(u)} ${u.email}`.toLowerCase().includes(needle)) : all;
  }, [data.data, needle]);

  if (data.isLoading) {
    return (
      <div className="grid place-items-center py-16 text-primary">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (data.isError || !data.data) return <ErrorState onRetry={() => void data.refetch()} />;
  const all = data.data.mailboxes;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="type-section-title text-ink">{t('mailAccess.admin.title')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink">{t('mailAccess.admin.intro')}</p>
        <p className="mt-1 max-w-3xl text-xs text-muted">{t('mailAccess.admin.introNote')}</p>
      </div>

      <ul className="grid gap-2 text-xs text-muted sm:grid-cols-2">
        {(['READ', 'SEND'] as Level[]).map((l) => (
          <li key={l} className="rounded-lg border border-line bg-card px-3 py-2">
            <LevelChip level={l} /> <span className="ml-1">{t(`mailAccess.levelHint.${l}`)}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <label className="sr-only" htmlFor="access-mailboxes-search">
            {t('mailAccess.admin.search')}
          </label>
          <input id="access-mailboxes-search" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mailAccess.admin.search')} maxLength={100} />
        </div>
        <div className="inline-flex rounded-lg border border-line bg-card p-0.5" role="group" aria-label={t('mailAccess.admin.title')}>
          {(['mailbox', 'user'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={clsx('rounded-md px-3 py-1.5 text-sm font-semibold', mode === m ? 'bg-primary text-primary-contrast' : 'text-muted hover:text-ink')}
            >
              {m === 'mailbox' ? t('mailAccess.admin.byMailbox') : t('mailAccess.admin.byUser')}
            </button>
          ))}
        </div>
      </div>

      {mode === 'mailbox' ? (
        !all.length ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{t('mailAccess.admin.empty')}</p>
        ) : !boxes.length ? (
          <p className="px-1 py-6 text-sm text-muted">{t('mailAccess.admin.noMatch')}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-card">
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 border-b border-line bg-sunken px-4 py-2 text-[0.7rem] font-bold tracking-wider text-muted uppercase md:grid">
              <span>{t('mailAccess.admin.mailbox')}</span>
              <span>{t('mailAccess.admin.whoCanSee')}</span>
            </div>
            <ul className="divide-y divide-line">
              {boxes.map((b) => (
                <li key={b.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                      <Inbox className="size-4 shrink-0 text-muted" aria-hidden /> <span className="truncate">{b.email}</span>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {t('mailAccess.admin.owner')}: {nameOf(b.owner)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!b.grants.length && <span className="text-xs text-muted">{t('mailAccess.admin.onlyOwner')}</span>}
                    {b.grants.map((g) => (
                      <span key={g.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-sunken py-0.5 pr-1 pl-2.5 text-xs text-ink">
                        <span className="truncate">{nameOf(g.user)}</span>
                        <LevelChip level={g.level} small />
                        <button
                          type="button"
                          onClick={() => void askRevoke(b, g)}
                          disabled={revoke.isPending}
                          className="grid size-6 place-items-center rounded-full text-muted hover:bg-danger-bg hover:text-danger-fg"
                          aria-label={t('mailAccess.admin.remove', { name: nameOf(g.user) })}
                          title={t('mailAccess.admin.remove', { name: nameOf(g.user) })}
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    ))}
                    <button type="button" onClick={() => setGranting(b)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-xs font-semibold text-link hover:bg-primary/[0.06]">
                      <Plus className="size-3.5" aria-hidden /> {t('mailAccess.admin.grant')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : (
        <UserView users={people} mailboxes={all} />
      )}

      {granting && <GrantDialog mailbox={granting} users={data.data.users} onClose={() => setGranting(null)} onError={showError} />}
    </div>
  );
}

const LevelChip = ({ level, small }: { level: Level | 'OWNER'; small?: boolean }) => {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center rounded-full font-semibold',
        small ? 'px-1.5 text-[0.65rem]' : 'px-2 py-0.5 text-xs',
        level === 'READ' ? 'bg-primary/10 text-link' : level === 'SEND' ? 'bg-warning-bg text-warning-fg' : 'bg-success-bg text-success-fg',
      )}
    >
      {t(`mailAccess.level.${level}`)}
    </span>
  );
};

/** "Which mailboxes does this person see": own mailboxes, granted ones, or everything for a super admin. */
const UserView = ({ users, mailboxes }: { users: Person[]; mailboxes: Mailbox[] }) => {
  const { t } = useTranslation();
  if (!users.length) return <p className="px-1 py-6 text-sm text-muted">{t('mailAccess.admin.noMatch')}</p>;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {users.map((u) => {
        const own = mailboxes.filter((b) => b.owner.id === u.id);
        const shared = mailboxes.flatMap((b) => b.grants.filter((g) => g.user.id === u.id).map((g) => ({ box: b, level: g.level })));
        const sa = u.role === 'SUPER_ADMIN';
        return (
          <li key={u.id} className="rounded-xl border border-line bg-card p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              {sa && <Crown className="size-4 text-warning-fg" aria-label={t('mailAccess.admin.superAdmin')} />}
              <span className="truncate">{nameOf(u)}</span>
            </p>
            <p className="truncate text-xs text-muted">{u.email}</p>
            <p className="mt-2 text-[0.7rem] font-bold tracking-wider text-muted uppercase">{t('mailAccess.admin.userSees')}</p>
            {sa && <p className="mt-1 text-xs font-semibold text-ink">{t('mailAccess.admin.seesAll')}</p>}
            <dl className="mt-1 space-y-1 text-xs">
              <div>
                <dt className="text-muted">{t('mailAccess.admin.ownBoxes')}</dt>
                <dd className="text-ink">{own.length ? own.map((b) => b.email).join(', ') : t('mailAccess.admin.none')}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('mailAccess.admin.sharedBoxes')}</dt>
                <dd className="flex flex-wrap gap-1.5 text-ink">
                  {shared.length
                    ? shared.map((s) => (
                        <span key={s.box.id} className="inline-flex items-center gap-1">
                          {s.box.email} <LevelChip level={s.level} small />
                        </span>
                      ))
                    : t('mailAccess.admin.none')}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
};

const GrantDialog = ({ mailbox, users, onClose, onError }: { mailbox: Mailbox; users: Person[]; onClose: () => void; onError: (err: unknown) => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [level, setLevel] = useState<Level>('READ');
  const choices = users.filter((u) => u.id !== mailbox.owner.id);
  const save = useMutation({
    mutationFn: async () => api.post(`${BASE}/grants`, { accountId: mailbox.id, userId, level }),
    onSuccess: () => {
      toast.success(t('mailAccess.admin.granted'));
      void qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t('mailAccess.admin.grantTitle', { mailbox: mailbox.email })}
      description={`${t('mailAccess.admin.owner')}: ${nameOf(mailbox.owner)}`}
      busy={save.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('mailAccess.admin.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!userId} loading={save.isPending}>
            {t('mailAccess.admin.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-ink">{t('mailAccess.admin.pickUser')}</span>
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">{t('mailAccess.admin.pickUserPlaceholder')}</option>
            {choices.map((u) => (
              <option key={u.id} value={u.id}>
                {nameOf(u)} ({u.email})
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-ink">{t('mailAccess.admin.pickLevel')}</legend>
          <div className="space-y-2">
            {(['READ', 'SEND'] as Level[]).map((l) => (
              <label key={l} className={clsx('flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2', level === l ? 'border-primary bg-primary/[0.04]' : 'border-line')}>
                <input type="radio" name="mail-access-level" className="mt-1" checked={level === l} onChange={() => setLevel(l)} />
                <span>
                  <span className="block text-sm font-semibold text-ink">{t(`mailAccess.level.${l}`)}</span>
                  <span className="block text-xs text-muted">{t(`mailAccess.levelHint.${l}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
};
