import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Mail, MessageSquare, Palmtree, Smile, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { PresenceRow } from './api';
import { useWorkspaceInvalidate } from './api';
import { Avatar, Card, Chip, EMOJIS, Empty, PresenceDot, errorText, fmtTime, fmtUtcDay, fullName, relativeTime } from './ui';

/** Status line under a person's name: emoji + text + expiry, or leave, or last-seen. */
export const StatusLine = ({ p, now }: { p: PresenceRow; now: number }) => {
  const { t } = useTranslation();
  if (p.onLeave) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning-fg">
        <Palmtree className="size-3" aria-hidden /> {t('ws.presence.onLeaveUntil', { type: t(`ws.leave.types.${p.onLeave.type}`), date: fmtUtcDay(p.onLeave.until) })}
      </span>
    );
  }
  if (p.statusText || p.statusEmoji) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-xs text-ink/80">
        {p.statusEmoji && <span aria-hidden>{p.statusEmoji}</span>}
        <span className="truncate">{p.statusText}</span>
        {p.statusUntil && <span className="shrink-0 text-muted">· {t('ws.presence.statusUntil', { time: fmtTime(p.statusUntil) })}</span>}
      </span>
    );
  }
  return <span className="text-xs text-muted">{p.online ? t('ws.presence.online') : t('ws.presence.lastSeen', { when: relativeTime(p.lastSeenAt, now) })}</span>;
};

export const PersonCard = ({ p, now, me }: { p: PresenceRow; now: number; me: boolean }) => {
  const { t } = useTranslation();
  return (
    <article className="flex items-start gap-3 rounded-xl border border-line bg-card p-3 transition hover:border-line-strong">
      <span className="relative shrink-0">
        <Avatar id={p.id} person={p} size="lg" />
        <PresenceDot online={p.online} className="absolute -right-0.5 -bottom-0.5 size-3" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h3 className="truncate text-sm font-bold text-ink">
            {fullName(p)}
            {me && <span className="ml-1 text-xs font-normal text-muted">({t('ws.common.you')})</span>}
          </h3>
          <Chip tone={p.role === 'STAFF' ? 'neutral' : 'brand'} className="text-[0.65rem]">
            {t(`workspace.role.${p.role}`)}
          </Chip>
        </div>
        <div className="mt-0.5 truncate">
          <StatusLine p={p} now={now} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">{p.email}</p>
      </div>
      {!me && (
        <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row">
          <Link to={`/workspace/chat?dm=${p.id}`} title={t('ws.team.chat')} aria-label={t('ws.team.chat')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-primary/[0.06] hover:text-link">
            <MessageSquare className="size-4" />
          </Link>
          <Link to={`/workspace/mail?compose=${encodeURIComponent(p.email)}`} title={t('ws.team.email')} aria-label={t('ws.team.email')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-primary/[0.06] hover:text-link">
            <Mail className="size-4" />
          </Link>
        </div>
      )}
    </article>
  );
};

/** Compact "who is online / away" strip for the dashboard. */
export const PresenceStrip = ({ people, now, loading }: { people: PresenceRow[] | undefined; now: number; loading: boolean }) => {
  const { t } = useTranslation();
  const online = (people ?? []).filter((p) => p.online);
  const away = (people ?? []).filter((p) => p.onLeave);
  return (
    <Card
      icon={Users}
      title={
        <>
          {t('ws.home.presence.title')}
          {people && <Chip tone="success">{t('ws.home.presence.online', { count: online.length })}</Chip>}
          {away.length > 0 && <Chip tone="warn">{t('ws.home.presence.onLeave', { count: away.length })}</Chip>}
        </>
      }
      actions={
        <Link to="/workspace/team" className="text-xs font-semibold text-link hover:underline">
          {t('ws.home.presence.open')}
        </Link>
      }
      bodyClassName="p-3 sm:p-4"
    >
      {loading ? null : !people?.length ? (
        <Empty icon={Users}>{t('ws.home.presence.nobody')}</Empty>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {[...people].sort((a, b) => Number(b.online) - Number(a.online)).map((p) => (
            <li key={p.id} className="flex max-w-full items-center gap-2 rounded-full border border-line bg-sunken py-1 pr-3 pl-1" title={p.online ? t('ws.presence.online') : t('ws.presence.lastSeen', { when: relativeTime(p.lastSeenAt, now) })}>
              <span className="relative">
                <Avatar id={p.id} person={p} size="sm" />
                <PresenceDot online={p.online} className="absolute -right-0.5 -bottom-0.5 size-2.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-ink">
                  {p.statusEmoji && <span aria-hidden>{p.statusEmoji} </span>}
                  {p.firstName}
                </span>
                {(p.onLeave || p.statusText) && <span className="block max-w-40 truncate text-[0.68rem] text-muted">{p.onLeave ? t(`ws.leave.types.${p.onLeave.type}`) : p.statusText}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

type Preset = 'm30' | 'h1' | 'today' | 'none';
const presetUntil = (p: Preset): string | null => {
  const now = new Date();
  if (p === 'm30') return new Date(now.getTime() + 30 * 60_000).toISOString();
  if (p === 'h1') return new Date(now.getTime() + 60 * 60_000).toISOString();
  if (p === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  return null;
};

/** "My status" editor: emoji picker, text, clear-after presets. */
export const StatusEditor = ({ me }: { me: PresenceRow | undefined }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const inv = useWorkspaceInvalidate();
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('none');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched || !me) return;
    setText(me.statusText ?? '');
    setEmoji(me.statusEmoji);
  }, [me, touched]);

  const save = async (clear = false) => {
    setBusy(true);
    try {
      await api.put('/workspace/status', clear ? { statusText: null, statusEmoji: null, statusUntil: null } : { statusText: text.trim() || null, statusEmoji: emoji, statusUntil: presetUntil(preset) });
      if (clear) {
        setText('');
        setEmoji(null);
        setPreset('none');
      }
      setTouched(false);
      toast.success(t('ws.status.saved'));
      inv.presence();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const hasStatus = !!(me?.statusText || me?.statusEmoji);

  return (
    <Card icon={Smile} title={t('ws.status.title')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-3"
      >
        <div className="flex items-center gap-2">
          {user && <Avatar id={user.id} person={user} />}
          <div className="relative">
            <button type="button" onClick={() => setPickerOpen((o) => !o)} aria-label={t('ws.status.emoji')} aria-expanded={pickerOpen} className="grid size-10 place-items-center rounded-lg border border-line bg-sunken text-lg hover:border-line-strong">
              {emoji ?? <Smile className="size-5 text-muted" />}
            </button>
            {pickerOpen && (
              <div className="absolute top-11 left-0 z-20 grid w-56 grid-cols-8 gap-0.5 rounded-xl border border-line bg-card p-1.5 shadow-[var(--tv-shadow-raised)]" role="listbox" aria-label={t('ws.status.emoji')}>
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    role="option"
                    aria-selected={emoji === e}
                    onClick={() => {
                      setEmoji(e);
                      setTouched(true);
                      setPickerOpen(false);
                    }}
                    className={clsx('grid size-6 place-items-center rounded text-base hover:bg-sunken', emoji === e && 'bg-primary/10')}
                  >
                    {e}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setEmoji(null);
                    setTouched(true);
                    setPickerOpen(false);
                  }}
                  className="grid size-6 place-items-center rounded text-muted hover:bg-sunken"
                  aria-label={t('ws.status.clear')}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
          </div>
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTouched(true);
            }}
            maxLength={120}
            placeholder={t('ws.status.ph')}
            className="input h-10"
            aria-label={t('ws.status.title')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">{t('ws.status.clearAfter')}:</span>
          <div className="flex rounded-lg border border-line bg-sunken p-0.5">
            {(['m30', 'h1', 'today', 'none'] as Preset[]).map((p) => (
              <button key={p} type="button" aria-pressed={preset === p} onClick={() => setPreset(p)} className={clsx('rounded-md px-2.5 py-1 text-xs font-semibold', preset === p ? 'bg-card text-ink shadow-[var(--tv-shadow-card)] ring-1 ring-line' : 'text-muted hover:text-ink')}>
                {t(`ws.status.presets.${p}`)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {hasStatus && (
              <button type="button" onClick={() => void save(true)} disabled={busy} className="btn-secondary btn-sm h-8 border border-line px-3">
                {t('ws.status.clear')}
              </button>
            )}
            <button type="submit" disabled={busy || (!text.trim() && !emoji)} className="btn-primary btn-sm h-8 px-3">
              {t('ws.status.set')}
            </button>
          </div>
        </div>
      </form>
    </Card>
  );
};
