import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';
import { gateEventForAppState, initialGate, reduceGate, type GateEvent, type GateState } from './biometricGate';

const PREF_KEY = 'tv_biometric';

/** What the phone offers: decides whether the profile switch is enabled and how the lock screen is worded. */
export type BiometricAvailability = 'unknown' | 'available' | 'no-hardware' | 'not-enrolled';
export type BiometricKind = 'face' | 'fingerprint' | 'iris';

export type EnableResult = 'ok' | 'cancelled' | 'failed' | 'unavailable';

interface BiometricContextValue {
  /** The stored preference has been read (the root layout waits for it before showing anything). */
  ready: boolean;
  enabled: boolean;
  locked: boolean;
  availability: BiometricAvailability;
  kinds: BiometricKind[];
  /** Turns the lock on (after one successful authentication) or off. */
  setEnabled: (on: boolean) => Promise<EnableResult>;
  /** Prompts Face ID / fingerprint (device passcode as the system fallback); true when unlocked. */
  unlock: () => Promise<boolean>;
  refreshAvailability: () => Promise<BiometricAvailability>;
}

const BiometricContext = createContext<BiometricContextValue | null>(null);

const readPref = async () => {
  try {
    return (await SecureStore.getItemAsync(PREF_KEY)) === '1';
  } catch {
    return false;
  }
};

const writePref = (on: boolean) => (on ? SecureStore.setItemAsync(PREF_KEY, '1') : SecureStore.deleteItemAsync(PREF_KEY)).catch(() => undefined);

const kindOf = (t: LocalAuthentication.AuthenticationType): BiometricKind | null =>
  t === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION ? 'face' : t === LocalAuthentication.AuthenticationType.FINGERPRINT ? 'fingerprint' : t === LocalAuthentication.AuthenticationType.IRIS ? 'iris' : null;

const probe = async (): Promise<{ availability: BiometricAvailability; kinds: BiometricKind[] }> => {
  try {
    const hardware = await LocalAuthentication.hasHardwareAsync();
    if (!hardware) return { availability: 'no-hardware', kinds: [] };
    const kinds = (await LocalAuthentication.supportedAuthenticationTypesAsync()).map(kindOf).filter((k): k is BiometricKind => !!k);
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return { availability: enrolled ? 'available' : 'not-enrolled', kinds };
  } catch {
    return { availability: 'no-hardware', kinds: [] };
  }
};

const reducer = (s: GateState, e: GateEvent) => reduceGate(s, e);

export const BiometricProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const { status } = useAuth();
  const [gate, dispatch] = useReducer(reducer, initialGate);
  const [ready, setReady] = useState(false);
  const [availability, setAvailability] = useState<BiometricAvailability>('unknown');
  const [kinds, setKinds] = useState<BiometricKind[]>([]);
  const prompting = useRef(false);

  const refreshAvailability = useCallback(async () => {
    const r = await probe();
    setAvailability(r.availability);
    setKinds(r.kinds);
    return r.availability;
  }, []);

  // Boot: read the stored preference (the gate waits for it), probe the hardware, then follow the app lifecycle.
  useEffect(() => {
    let cancelled = false;
    void readPref().then((on) => {
      if (cancelled) return;
      dispatch({ type: 'boot', enabled: on });
      setReady(true);
      void refreshAvailability();
    });
    const sub = AppState.addEventListener('change', (s) => {
      const ev = gateEventForAppState(s, Date.now());
      if (ev) dispatch(ev);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [refreshAvailability]);

  // Logging out (or a server-side session end) forgets the preference: the next account starts fresh.
  const wasAuthed = useRef(false);
  useEffect(() => {
    if (status === 'guest' && wasAuthed.current) {
      void writePref(false);
      dispatch({ type: 'disable' });
    }
    wasAuthed.current = status === 'authed';
  }, [status]);

  const authenticate = useCallback(async () => {
    if (prompting.current) return false;
    prompting.current = true;
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: t('m.lock.prompt'),
        cancelLabel: t('m.common.cancel'),
        disableDeviceFallback: false,
        requireConfirmation: false,
      });
      return res.success;
    } catch {
      return false;
    } finally {
      prompting.current = false;
    }
  }, [t]);

  const unlock = useCallback(async () => {
    const ok = await authenticate();
    if (ok) dispatch({ type: 'unlock' });
    return ok;
  }, [authenticate]);

  const setEnabled = useCallback(
    async (on: boolean): Promise<EnableResult> => {
      if (!on) {
        await writePref(false);
        dispatch({ type: 'disable' });
        return 'ok';
      }
      if ((await refreshAvailability()) !== 'available') return 'unavailable';
      const ok = await authenticate();
      if (!ok) return 'cancelled';
      await writePref(true);
      dispatch({ type: 'enable' });
      return 'ok';
    },
    [authenticate, refreshAvailability],
  );

  const value = useMemo<BiometricContextValue>(
    () => ({ ready, enabled: gate.enabled, locked: gate.enabled && gate.locked, availability, kinds, setEnabled, unlock, refreshAvailability }),
    [ready, gate.enabled, gate.locked, availability, kinds, setEnabled, unlock, refreshAvailability],
  );

  return <BiometricContext.Provider value={value}>{children}</BiometricContext.Provider>;
};

export const useBiometric = () => {
  const ctx = useContext(BiometricContext);
  if (!ctx) throw new Error('useBiometric must be used inside <BiometricProvider>');
  return ctx;
};
