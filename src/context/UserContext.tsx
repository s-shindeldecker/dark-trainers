import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  type AppUser,
  type IdentifiedUserProfile,
  STANDARD_DEMO_USER,
  VIP_DEMO_USER,
  newAnonymousKey,
} from '../types/darktrainers';

export type AuthState = {
  user: AppUser;
  previousAnonymousKey?: string;
};

interface UserContextType {
  user: AppUser;
  /** Combined slice — updates atomically with transitions; prefer for LD multi-context. */
  authState: AuthState;
  /** True when browsing as anonymous Guest (not Standard/VIP). */
  isAnonymousGuest: boolean;
  /** True when identified Standard or VIP. */
  isIdentified: boolean;
  previousAnonymousKey?: string;
  setUser: (user: AppUser) => void;
  setPreviousAnonymousKey: (key: string | undefined) => void;
  resetToGuest: () => void;
  setIdentifiedStandard: () => void;
  setIdentifiedVip: () => void;
  /** Standard → VIP; clears multi stitch key. */
  upgradeIdentifiedToVip: () => void;
  /** Guest → Standard with LD multi context (call while still anonymous). */
  transitionGuestToStandard: () => void;
  /** Guest → VIP with LD multi context (call while still anonymous). */
  transitionGuestToVip: () => void;
  /** Same as resetToGuest — for header “Log out”. */
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const anonymousProfile = (): AppUser => ({
  anonymous: true,
  key: newAnonymousKey(),
});

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: anonymousProfile(),
    previousAnonymousKey: undefined,
  });

  const { user, previousAnonymousKey } = authState;

  const setUser = useCallback((next: AppUser) => {
    setAuthState((prev) => ({ ...prev, user: next }));
  }, []);

  const setPreviousAnonymousKey = useCallback((key: string | undefined) => {
    setAuthState((prev) => ({ ...prev, previousAnonymousKey: key }));
  }, []);

  const resetToGuest = useCallback(() => {
    setAuthState({
      user: anonymousProfile(),
      previousAnonymousKey: undefined,
    });
  }, []);

  const setIdentifiedStandard = useCallback(() => {
    setAuthState({
      user: { ...STANDARD_DEMO_USER },
      previousAnonymousKey: undefined,
    });
  }, []);

  const setIdentifiedVip = useCallback(() => {
    setAuthState({
      user: { ...VIP_DEMO_USER },
      previousAnonymousKey: undefined,
    });
  }, []);

  const upgradeIdentifiedToVip = useCallback(() => {
    setAuthState({
      user: { ...VIP_DEMO_USER },
      previousAnonymousKey: undefined,
    });
  }, []);

  const transitionGuestToStandard = useCallback(() => {
    setAuthState((prev) => {
      if (!prev.user.anonymous) return prev;
      return {
        user: { ...STANDARD_DEMO_USER },
        previousAnonymousKey: prev.user.key,
      };
    });
  }, []);

  const transitionGuestToVip = useCallback(() => {
    setAuthState((prev) => {
      if (!prev.user.anonymous) return prev;
      return {
        user: { ...VIP_DEMO_USER },
        previousAnonymousKey: prev.user.key,
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
        isAnonymousGuest,
        isIdentified,
        previousAnonymousKey,
        setUser,
        setPreviousAnonymousKey,
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
