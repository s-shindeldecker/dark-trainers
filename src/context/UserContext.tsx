import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  type AppUser,
  type IdentifiedUserProfile,
  STANDARD_DEMO_USER,
  VIP_DEMO_USER,
  newAnonymousKey,
} from '../types/darktrainers';
import { getOrCreateLdSessionKey, rotateLdSessionKey } from '../lib/ldSessionKey';

export type AuthState = {
  user: AppUser;
};

interface UserContextType {
  user: AppUser;
  /** Combined slice — updates atomically; used by LDContext. */
  authState: AuthState;
  /** Persisted browser-session key for LD `kind: "session"` (pre- and post-login). */
  sessionKey: string;
  /** True when browsing as anonymous Guest (not Standard/VIP). */
  isAnonymousGuest: boolean;
  /** True when identified Standard or VIP. */
  isIdentified: boolean;
  setUser: (user: AppUser) => void;
  resetToGuest: () => void;
  setIdentifiedStandard: () => void;
  setIdentifiedVip: () => void;
  /** Standard → VIP; same session key, updated user in LD multi-context. */
  upgradeIdentifiedToVip: () => void;
  /** Guest → Standard; LD identifies with multi(session + user). */
  transitionGuestToStandard: () => void;
  /** Guest → VIP; LD identifies with multi(session + user). */
  transitionGuestToVip: () => void;
  /** Same as resetToGuest — for header “Log out”. Rotates session key. */
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const anonymousProfile = (): AppUser => ({
  anonymous: true,
  key: newAnonymousKey(),
});

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [sessionKey, setSessionKey] = useState(() => getOrCreateLdSessionKey());
  const [authState, setAuthState] = useState<AuthState>({
    user: anonymousProfile(),
  });

  const { user } = authState;

  const setUser = useCallback((next: AppUser) => {
    setAuthState((prev) => ({ ...prev, user: next }));
  }, []);

  const resetToGuest = useCallback(() => {
    setSessionKey(rotateLdSessionKey());
    setAuthState({
      user: anonymousProfile(),
    });
  }, []);

  const setIdentifiedStandard = useCallback(() => {
    setAuthState({
      user: { ...STANDARD_DEMO_USER },
    });
  }, []);

  const setIdentifiedVip = useCallback(() => {
    setAuthState({
      user: { ...VIP_DEMO_USER },
    });
  }, []);

  const upgradeIdentifiedToVip = useCallback(() => {
    setAuthState({
      user: { ...VIP_DEMO_USER },
    });
  }, []);

  const transitionGuestToStandard = useCallback(() => {
    setAuthState((prev) => {
      if (!prev.user.anonymous) return prev;
      return {
        user: { ...STANDARD_DEMO_USER },
      };
    });
  }, []);

  const transitionGuestToVip = useCallback(() => {
    setAuthState((prev) => {
      if (!prev.user.anonymous) return prev;
      return {
        user: { ...VIP_DEMO_USER },
      };
    });
  }, []);

  const isAnonymousGuest = user.anonymous === true;
  const isIdentified = user.anonymous === false;

  return (
    <UserContext.Provider
      value={{
        user,
        authState,
        sessionKey,
        isAnonymousGuest,
        isIdentified,
        setUser,
        resetToGuest,
        setIdentifiedStandard,
        setIdentifiedVip,
        upgradeIdentifiedToVip,
        transitionGuestToStandard,
        transitionGuestToVip,
        logout: resetToGuest,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a UserProvider');
  return ctx;
};

/** @deprecated use IdentifiedUserProfile / AppUser from types/darktrainers */
export type UserProfile = IdentifiedUserProfile;
